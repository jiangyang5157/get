#!/usr/bin/env node
// change-brief CLI — entry point: arg parsing + phase dispatch.
//   collect <base>  -> change-set.json        (Phase A, deterministic)
//   render  <model> -> change-brief.html      (Phase C, deterministic; --change-set for chart)
//   verify  <change-set> <model>              (validate model schema+vocab+evidence)
//   all     <base>  -> collect then instruct Phase B; render if --model valid
// Exit codes: 0 ok · 1 abort/validation · 2 usage
import fs from 'node:fs';
import path from 'node:path';
import { collect, CollectError } from '../lib/git-collect.mjs';
import { renderChangeBrief } from '../lib/renderer.mjs';
import { checkModel } from '../lib/check-model.mjs';
import { validateJsonFile } from '../lib/validator.mjs';

function usage() {
  return `Usage:
  node bin/run.mjs collect <base> [--head <A>] [--out change-set.json] [--offline] [--context repo-context.json]
                       # A defaults to current HEAD; B resolves as origin/<base>
  node bin/run.mjs render  <change-model.json> [--out change-brief.html] [--change-set change-set.json]
  node bin/run.mjs verify  <change-set.json> <change-model.json>
  node bin/run.mjs all     <base> [--head <A>] [--model change-model.json] [--out change-brief.html] [--offline] [--context repo-context.json]
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

const VALUE_FLAGS = new Set(['out', 'change-set', 'context', 'model', 'head']);

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

function rel(repoRoot, p) {
  try {
    const r = path.relative(repoRoot, p);
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

async function cmdCollect(pos, flags, repoRoot) {
  const [base] = pos;
  if (!base) {
    process.stderr.write(`${usage()}\n\n`);
    fail('usage: collect <base> required', 2);
  }
  let context = null;
  if (flags.context) {
    const v = validateJsonFile('repo-context', flags.context);
    if (!v.ok) {
      const first = v.violations[0];
      fail(`repo-context invalid at ${first.path}: ${first.msg}`);
    }
    context = JSON.parse(fs.readFileSync(flags.context, 'utf8'));
  }
  let changeSet;
  try {
    changeSet = await collect({
      base,
      from: flags.head || null,
      offline: flags.offline === true || flags.offline === 'true',
      repoContext: context,
      cwd: repoRoot,
    });
  } catch (e) {
    if (e instanceof CollectError) fail(e.message);
    throw e;
  }
  const outPath = flags.out ? path.resolve(repoRoot, flags.out) : path.join(repoRoot, '.change-brief', 'change-set.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(changeSet, null, 2) + '\n');
  process.stdout.write(`Wrote ${rel(repoRoot, outPath)}\n`);
  if (changeSet.empty) process.stdout.write(`Note: ${changeSet.summaryHint}\n`);
  warnNotes(changeSet);
  return 0;
}

async function cmdRender(pos, flags, repoRoot) {
  const [modelPath] = pos;
  if (!modelPath) fail('usage: render <change-model.json> required', 2);
  const model = loadJson(modelPath, 'change-model');
  const changeSet = flags['change-set']
    ? loadJson(path.resolve(repoRoot, flags['change-set']), 'change-set')
    : null;

  const check = await checkModel(model, changeSet);
  if (!check.ok) {
    const first = check.violations[0];
    fail(`change-model invalid at ${first.path}: ${first.msg}`);
  }

  const html = renderChangeBrief(model, changeSet);
  const outPath = flags.out ? path.resolve(repoRoot, flags.out) : path.join(repoRoot, '.change-brief', 'change-brief.html');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  process.stdout.write(`Wrote ${rel(repoRoot, outPath)}\n`);
  if (!changeSet) {
    process.stdout.write('Note: no --change-set given; diff chart omitted. Add --change-set to include it.\n');
  }
  return 0;
}

async function cmdVerify(pos) {
  const [csPath, modelPath] = pos;
  if (!csPath || !modelPath) fail('usage: verify <change-set.json> <change-model.json>', 2);
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

async function cmdAll(pos, flags, repoRoot) {
  const [base] = pos;
  if (!base) fail('usage: all <base> required', 2);
  // Phase A
  let context = null;
  if (flags.context) {
    const v = validateJsonFile('repo-context', flags.context);
    if (!v.ok) {
      const first = v.violations[0];
      fail(`repo-context invalid at ${first.path}: ${first.msg}`);
    }
    context = JSON.parse(fs.readFileSync(flags.context, 'utf8'));
  }
  let changeSet;
  try {
    changeSet = await collect({
      base,
      from: flags.head || null,
      offline: flags.offline === true || flags.offline === 'true',
      repoContext: context,
      cwd: repoRoot,
    });
  } catch (e) {
    if (e instanceof CollectError) fail(e.message);
    throw e;
  }
  const csPath = path.join(repoRoot, '.change-brief', 'change-set.json');
  fs.mkdirSync(path.dirname(csPath), { recursive: true });
  fs.writeFileSync(csPath, JSON.stringify(changeSet, null, 2) + '\n');
  process.stdout.write(`Wrote ${rel(repoRoot, csPath)}\n`);
  if (changeSet.empty) process.stdout.write(`Note: ${changeSet.summaryHint}\n`);
  warnNotes(changeSet);

  // Phase B is the LLM step, external to this CLI.
  const modelPath = flags.model ? path.resolve(repoRoot, flags.model) : path.join(repoRoot, '.change-brief', 'change-model.json');
  const modelGiven = fs.existsSync(modelPath);
  process.stdout.write(
    `Run Phase B (LLM/chat) on ${rel(repoRoot, csPath)} → ${rel(repoRoot, modelPath)}, then:\n` +
    `  node bin/run.mjs render ${rel(repoRoot, modelPath)} --change-set ${rel(repoRoot, csPath)}\n`,
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
      ? path.resolve(repoRoot, flags.out)
      : path.join(repoRoot, '.change-brief', 'change-brief.html');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
    process.stdout.write(`Rendered ${rel(repoRoot, outPath)}\n`);
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
  const cwd = process.cwd();
  const repoRoot = cwd;

  switch (cmd) {
    case 'collect': return cmdCollect(pos, flags, repoRoot);
    case 'render': return cmdRender(pos, flags, repoRoot);
    case 'verify': return cmdVerify(pos);
    case 'all': return cmdAll(pos, flags, repoRoot);
    default:
      process.stderr.write(`${usage()}\n\n`);
      fail(`unknown command: ${cmd}`, 2);
  }
}

main().then((code) => process.exit(code)).catch((e) => {
  process.stderr.write(`Error: ${e.message}\n`);
  process.exit(1);
});
