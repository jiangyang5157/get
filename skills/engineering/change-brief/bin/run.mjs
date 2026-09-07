#!/usr/bin/env node
// change-brief CLI — entry point: arg parsing + phase dispatch.
//   collect <base>  -> change-set.json        (Phase A, deterministic)
//   render  <model> -> change-brief.html      (Phase C, deterministic; --change-set for chart)
//   verify  <change-set> <model>              (validate model schema+vocab+evidence)
//   all     <base>  -> collect then instruct Phase B; render if --model valid
//   selftest [--update-golden]                (regenerate golden + assertions)
// Exit codes: 0 ok · 1 abort/validation · 2 usage
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collect, CollectError } from '../lib/git-collect.mjs';
import { renderChangeBrief, renderMarkdown } from '../lib/renderer.mjs';
import { checkModel } from '../lib/check-model.mjs';
import { validateJsonFile, validateObject } from '../lib/validator.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function usage() {
  return `Usage:
  node bin/run.mjs collect <base> [--out change-set.json] [--offline] [--context repo-context.json]
  node bin/run.mjs render  <change-model.json> [--out change-brief.html] [--markdown] [--change-set change-set.json]
  node bin/run.mjs verify  <change-set.json> <change-model.json>
  node bin/run.mjs all     <base> [--model change-model.json] [--out change-brief.html] [--markdown] [--offline] [--context repo-context.json]
  node bin/run.mjs selftest [--update-golden]

Exit codes: 0 success · 1 abort/validation failure · 2 usage error`;
}

function fail(msg, code = 1) {
  process.stderr.write(`${msg}\n`);
  process.exit(code);
}

function parseFlags(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
      const val = eq >= 0 ? a.slice(eq + 1) : argv[++i];
      flags[key] = val === undefined ? true : val;
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

  const out = flags.markdown ? renderMarkdown(model) : renderChangeBrief(model, changeSet);
  const outPath = flags.out
    ? path.resolve(repoRoot, flags.out)
    : path.join(repoRoot, '.change-brief', flags.markdown ? 'change-brief.md' : 'change-brief.html');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out);
  process.stdout.write(`Wrote ${rel(repoRoot, outPath)}\n`);
  if (!flags.markdown && !changeSet) {
    process.stdout.write('Note: no --change-set given; diff chart/commit timeline omitted. Add --change-set to include them.\n');
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

// ---------------- selftest ----------------
async function cmdSelftest(flags) {
  const fixture = (n) => path.join(root, 'fixtures', n);
  const goldenPath = fixture('change-brief.sample.html');
  const model = loadJson(fixture('change-model.sample.json'), 'change-model');
  const changeSet = loadJson(fixture('change-set.sample.json'), 'change-set');

  // 1. fixtures validate
  for (const [name, p] of [['change-set', fixture('change-set.sample.json')], ['change-model', fixture('change-model.sample.json')]]) {
    const v = validateJsonFile(name, p);
    if (!v.ok) {
      const first = v.violations[0];
      fail(`selftest: ${name} fixture invalid at ${first.path}: ${first.msg}`);
    }
  }
  const check = await checkModel(model, changeSet);
  if (!check.ok) {
    const first = check.violations[0];
    fail(`selftest: sample model fails check at ${first.path}: ${first.msg}`);
  }

  // 2. golden regeneration / byte compare
  const html = renderChangeBrief(model, changeSet);
  if (flags['update-golden']) {
    fs.writeFileSync(goldenPath, html);
    process.stdout.write(`Golden updated: ${path.relative(root, goldenPath)}\n`);
    return 0;
  }
  const stored = fs.existsSync(goldenPath) ? fs.readFileSync(goldenPath, 'utf8') : null;
  if (stored === null) {
    fs.writeFileSync(goldenPath, html);
    process.stdout.write(`Golden missing — wrote ${path.relative(root, goldenPath)}. Rerun selftest to compare.\n`);
    return 0;
  }
  if (stored !== html) {
    const golden = path.relative(root, goldenPath);
    fail(`selftest: render differs from golden ${golden}. Use "selftest --update-golden" only for intentional renderer changes.`);
  }

  // 3. negative fixtures must be rejected
  const negativesDir = fixture('negative');
  for (const f of fs.readdirSync(negativesDir).filter((x) => x.endsWith('.json'))) {
    const neg = JSON.parse(fs.readFileSync(path.join(negativesDir, f), 'utf8'));
    const checkNeg = await checkModel(neg, changeSet);
    if (checkNeg.ok) fail(`selftest: negative fixture ${f} unexpectedly passed`);
  }

  // 3b. installed profile must satisfy profile.schema.json
  {
    const profMod = await import(pathToFileURL(path.join(root, 'lib', 'profiles', 'engineering.mjs')).href);
    const vp = validateObject('profile', profMod.default);
    if (!vp.ok) {
      const first = vp.violations[0];
      fail(`selftest: engineering profile invalid at ${first.path}: ${first.msg}`);
    }
  }

  // 4. escape smoke: renderer must escape HTML metachars in user strings
  const evil = renderChangeBrief({
    schemaVersion: '1', profile: 'engineering', head: 'a<b', base: 'main', title: '<script>alert(1)</script>',
    summary: { headline: '"quoted" & <x>', why: 'x', perFile: [] },
    risks: [{ id: 'R1', category: 'secrets', severity: 'high', title: '<img src=x onerror=1>', rationale: '&', evidence: [{ path: 'a', line: 1, deleted: false }] }],
    scannedCategories: [], tests: { focusFiles: [], happyPath: [], edgeCases: [] }, crDraft: null,
  });
  if (evil.includes('<script>alert(1)</script>') || evil.includes('<img src=x')) {
    fail('selftest: escapeHtml failed');
  }

  process.stdout.write('selftest: OK (fixtures validate, golden matches, negatives rejected, escaping works)\n');
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
    case 'selftest': return cmdSelftest(flags);
    default:
      process.stderr.write(`${usage()}\n\n`);
      fail(`unknown command: ${cmd}`, 2);
  }
}

main().then((code) => process.exit(code)).catch((e) => {
  process.stderr.write(`Error: ${e.message}\n`);
  process.exit(1);
});
