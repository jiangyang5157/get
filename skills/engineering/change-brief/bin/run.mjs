#!/usr/bin/env node
// change-brief CLI — entry point: arg parsing + phase dispatch.
//   collect <base>  -> change-set.json        (Phase A, deterministic)
//   render  <model> -> change-brief.html      (Phase C, deterministic; --change-set for chart)
//   verify  <change-set> <model>              (validate model schema+vocab+evidence)
//   all     <base>  -> collect then instruct Phase B; render if --model valid
//
// Path model (three independent knobs):
//   --repo <path>     target git repo for git commands (default: current cwd
//                     — required when cwd is not inside a git repo)
//   --out-dir <path>  where artifacts live (default: <repo>/.change-brief)
//   --run-id <name>   run history: artifacts go to <out-dir>/<run-id>/ ;
//                     "auto" names the run <headSha8>_<baseSha8>
// Exit codes: 0 ok · 1 abort/validation · 2 usage
import fs from 'node:fs';
import path from 'node:path';
import { collect, CollectError, isGitRepo } from '../lib/git-collect.mjs';
import { renderChangeBrief } from '../lib/renderer.mjs';
import { checkModel } from '../lib/check-model.mjs';
import { validateJsonFile } from '../lib/validator.mjs';

const DEFAULT_OUT = '.change-brief';

function usage() {
  return `Usage:
  node bin/run.mjs collect <base> [--head <A>] [--repo <path>] [--out-dir <path>] [--run-id <name|auto>]
                        [--offline] [--context repo-context.json]
  node bin/run.mjs render  <change-model.json> [--out <file>] [--change-set <file>] [--out-dir <path>]
  node bin/run.mjs all     <base> [--head <A>] [--repo <path>] [--out-dir <path>] [--run-id <name|auto>]
                        [--model <file>] [--offline] [--context repo-context.json]
  node bin/run.mjs review  <base> …   (alias for 'all')
  node bin/run.mjs verify  [--repo <path>] [--out-dir <path>] [--run-id <name|auto>]
                        # or: verify <change-set.json> <change-model.json>

  A defaults to current HEAD (use --head to pick any branch/ref/tag/sha).
  B is required and resolved like A (local-first, then origin).
  Artifacts: change-set.json, change-model.json, change-brief.html.
Exit codes: 0 success · 1 abort/validation failure · 2 usage error`;
}

function fail(msg, code = 1) {
  process.stderr.write(`${msg}\n`);
  process.exit(code);
}

function warnNotes(changeSet) {
  if (changeSet?.baseLocalNote) process.stderr.write(`Note: ${changeSet.baseLocalNote}\n`);
  if (changeSet?.workingTreeDirty) {
    const n = changeSet.dirtyCount ?? 0;
    process.stderr.write(`Note: ${n} uncommitted change${n === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} not included in this brief — commit or stash first.\n`);
  }
}

const VALUE_FLAGS = new Set(['out', 'out-dir', 'change-set', 'context', 'model', 'head', 'repo', 'run-id']);

function parseFlags(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
      if (eq >= 0) {
        flags[key] = a.slice(eq + 1);
      } else if (VALUE_FLAGS.has(key)) {
        flags[key] = argv[++i];
      } else {
        flags[key] = true; // boolean flag
      }
    } else pos.push(a);
  }
  return { pos, flags };
}

/** Resolve target repo root: --repo wins, else cwd (must be inside a repo for git ops). */
function resolveRepo(flags, { requireRepo = true } = {}) {
  const p = flags.repo ? path.resolve(flags.repo) : process.cwd();
  if (requireRepo && !isGitRepo(p)) {
    fail(`Not a git repository: ${p}\nRun inside the target repo or pass --repo <path>.`, 1);
  }
  return p;
}

/** Resolve artifact root dir: --out-dir wins, else <repo>/.change-brief. */
function resolveOutDir(repo, flags) {
  return flags['out-dir'] ? path.resolve(flags['out-dir']) : path.join(repo, DEFAULT_OUT);
}

/** Resolve the run directory (history support): flat by default, <out>/<run-id> otherwise. */
function resolveRunDir(outDir, runId) {
  return runId ? path.join(outDir, runId) : outDir;
}

function rel(repoRoot, p) {
  try {
    const r = path.relative(repoRoot, p);
    return r && !r.startsWith('..') ? r : p;
  } catch {
    return p;
  }
}

function relOut(outDir, p) {
  try {
    const r = path.relative(outDir, p);
    return r && !r.startsWith('..') ? r : p;
  } catch {
    return p;
  }
}

function loadJson(p, label) {
  if (!fs.existsSync(p)) fail(`${label}: file not found: ${p}`);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`${label}: invalid JSON in ${p}: ${e.message}`);
  }
}

/** compute dirtyExclude pathspec (relative to repo) for the output area, if inside repo */
function dirtyExcludeOf(repo, outDir, runId) {
  const runDir = resolveRunDir(outDir, runId);
  const relRun = path.relative(repo, runDir);
  if (!relRun || relRun.startsWith('..')) return null; // outside repo — nothing to exclude
  return relRun.split(path.sep).join('/');
}

function loadContext(flags) {
  if (!flags.context) return null;
  const v = validateJsonFile('repo-context', flags.context);
  if (!v.ok) {
    const first = v.violations[0];
    fail(`repo-context invalid at ${first.path}: ${first.msg}`);
  }
  return JSON.parse(fs.readFileSync(flags.context, 'utf8'));
}

async function cmdCollect(pos, flags, repo) {
  const [base] = pos;
  if (!base) {
    process.stderr.write(`${usage()}\n\n`);
    fail('usage: collect <base> required', 2);
  }
  const outDir = resolveOutDir(repo, flags);
  let changeSet;
  try {
    changeSet = await collect({
      base,
      from: flags.head || null,
      dirtyExclude: dirtyExcludeOf(repo, outDir, flags['run-id']),
      offline: flags.offline === true || flags.offline === 'true',
      repoContext: loadContext(flags),
      cwd: repo,
    });
  } catch (e) {
    if (e instanceof CollectError) fail(e.message);
    throw e;
  }
  const runId = flags['run-id'] === 'auto' ? `${changeSet.headSha.slice(0, 8)}_${changeSet.baseSha.slice(0, 8)}` : flags['run-id'];
  const runDir = resolveRunDir(outDir, runId);
  const outPath = path.join(runDir, 'change-set.json');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(changeSet, null, 2) + '\n');
  process.stdout.write(`Wrote ${relOut(outDir, outPath)}\n`);
  if (changeSet.empty) process.stdout.write(`Note: ${changeSet.summaryHint}\n`);
  warnNotes(changeSet);
  return 0;
}

async function cmdRender(pos, flags) {
  const [modelPathArg] = pos;
  if (!modelPathArg) fail('usage: render <change-model.json> required', 2);
  const modelPath = path.resolve(modelPathArg);
  const model = loadJson(modelPath, 'change-model');
  const changeSet = flags['change-set']
    ? loadJson(path.resolve(flags['change-set']), 'change-set')
    : null;

  const check = await checkModel(model, changeSet);
  if (!check.ok) {
    const first = check.violations[0];
    fail(`change-model invalid at ${first.path}: ${first.msg}`);
  }

  const html = renderChangeBrief(model, changeSet);
  // default HTML goes next to the model file (most predictable across repos);
  // --out or --out-dir override it
  const outPath = flags.out
    ? path.resolve(flags.out)
    : flags['out-dir']
      ? path.join(path.resolve(flags['out-dir']), 'change-brief.html')
      : path.join(path.dirname(modelPath), 'change-brief.html');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  process.stdout.write(`Wrote ${outPath}\n`);
  if (!changeSet) {
    process.stdout.write('Note: no --change-set given; diff chart omitted. Add --change-set to include it.\n');
  }
  return 0;
}

async function cmdVerify(pos, flags) {
  // Positional paths may be omitted when the run location is given:
  //   verify --repo <path> [--out-dir <path>] [--run-id <name|auto>]
  let [csPath, modelPath] = pos;
  if (!csPath || !modelPath) {
    const repo = flags.repo ? path.resolve(flags.repo) : process.cwd();
    const outDir = resolveOutDir(repo, flags);
    let runDir = outDir;
    if (flags['run-id']) {
      if (flags['run-id'] === 'auto') {
        // pick the newest A8_B8 run dir under outDir
        const dirs = fs.readdirSync(outDir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && /^[0-9a-f]{8}_[0-9a-f]{8}$/.test(d.name))
          .map((d) => path.join(outDir, d.name))
          .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
        if (!dirs.length) fail(`verify: no auto run dir found under ${outDir}`, 1);
        runDir = dirs[0];
      } else {
        runDir = path.join(outDir, flags['run-id']);
      }
    }
    csPath = csPath || path.join(runDir, 'change-set.json');
    modelPath = modelPath || path.join(runDir, 'change-model.json');
  }
  const csV = validateJsonFile('change-set', csPath);
  if (!csV.ok) {
    const first = csV.violations[0];
    fail(`change-set invalid at ${first.path}: ${first.msg}`);
  }
  const changeSet = JSON.parse(fs.readFileSync(csPath, 'utf8'));
  const model = loadJson(modelPath, 'change-model');
  const check = await checkModel(model, changeSet);
  if (!check.ok) {
    const first = check.violations[0];
    fail(`change-model invalid at ${first.path}: ${first.msg}`);
  }
  process.stdout.write('OK: change-model matches schema, profile vocabulary, and change-set evidence.\n');
  return 0;
}

async function cmdAll(pos, flags, repo) {
  const [base] = pos;
  if (!base) fail('usage: all <base> required', 2);
  const outDir = resolveOutDir(repo, flags);
  // Phase A
  let changeSet;
  try {
    changeSet = await collect({
      base,
      from: flags.head || null,
      dirtyExclude: dirtyExcludeOf(repo, outDir, flags['run-id']),
      offline: flags.offline === true || flags.offline === 'true',
      repoContext: loadContext(flags),
      cwd: repo,
    });
  } catch (e) {
    if (e instanceof CollectError) fail(e.message);
    throw e;
  }
  const runId = flags['run-id'] === 'auto' ? `${changeSet.headSha.slice(0, 8)}_${changeSet.baseSha.slice(0, 8)}` : flags['run-id'];
  const runDir = resolveRunDir(outDir, runId);
  const csPath = path.join(runDir, 'change-set.json');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(csPath, JSON.stringify(changeSet, null, 2) + '\n');
  process.stdout.write(`Wrote ${relOut(outDir, csPath)}\n`);
  if (changeSet.empty) process.stdout.write(`Note: ${changeSet.summaryHint}\n`);
  warnNotes(changeSet);

  // Phase B is the LLM step, external to this CLI.
  const modelPath = flags.model ? path.resolve(flags.model) : path.join(runDir, 'change-model.json');
  const modelGiven = fs.existsSync(modelPath);
  const htmlDefault = path.join(runDir, 'change-brief.html');
  const relArgs = (abs) => `"${abs}"`;
  process.stdout.write(
    `Run Phase B (LLM/chat) on ${relArgs(csPath)} → ${relArgs(modelPath)}, then:\n` +
    `  node bin/run.mjs render ${relArgs(modelPath)} --change-set ${relArgs(csPath)}\n` +
    `  # HTML output: ${relArgs(htmlDefault)}\n`,
  );
  if (modelGiven) {
    const model = loadJson(modelPath, 'change-model');
    const check = await checkModel(model, changeSet);
    if (!check.ok) {
      const first = check.violations[0];
      fail(`change-model invalid at ${first.path}: ${first.msg}`);
    }
    const html = renderChangeBrief(model, changeSet);
    const outPath = flags.out
      ? path.resolve(flags.out)
      : path.join(runDir, 'change-brief.html');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
    process.stdout.write(`Rendered ${relOut(outDir, outPath)}\n`);
  } else {
    process.stdout.write('No change-model.json yet — Phase B pending (the CLI never calls an LLM).\n');
  }
  return 0;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(`${usage()}\n`);
    return argv.length === 0 ? 2 : 0;
  }
  const cmd = argv[0];
  const { pos, flags } = parseFlags(argv.slice(1));

  switch (cmd) {
    case 'collect': {
      const repo = resolveRepo(flags); // git ops need a real repo
      return cmdCollect(pos, flags, repo);
    }
    case 'all':
    case 'review': {           // 'review' is an alias for 'all'
      const repo = resolveRepo(flags);
      return cmdAll(pos, flags, repo);
    }
    case 'render': return cmdRender(pos, flags);
    case 'verify': return cmdVerify(pos, flags);
    default:
      process.stderr.write(`${usage()}\n\n`);
      fail(`unknown command: ${cmd}`, 2);
  }
}

main().then((code) => process.exit(code)).catch((e) => {
  process.stderr.write(`Error: ${e.message}\n`);
  process.exit(1);
});
