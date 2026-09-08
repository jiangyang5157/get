// Phase C — pure renderer. change-model.json (+ optional change-set.json for
// deterministic diff chart / file stats / KPI) -> single self-contained HTML.
// No fs, no network.

const SEV_ORDER = { high: 0, medium: 1, low: 2 };
const VISIBLE_RISKS = 8;
const VISIBLE_EDGES = 8;
const FILES_PER_DIR = 12;
const MAX_DIRS = 12;

/** Plain-language hints for category chips (hover). */
const CATEGORY_HINTS = {
  config: 'config/env files — verify values and that no secrets are committed',
  db: 'database, migrations, schema, SQL — check destructive changes, locking, data loss',
  security: 'auth / authorization / roles / crypto / tokens — check for privilege bypass',
  dependency: 'dependency or lock files — supply chain and version compatibility',
  logging: 'logging code — check sensitive values are not written to logs',
  secrets: 'secret-like files (.env, keys, certs) — values must never be exposed',
  pii: 'personally identifiable information (names, IDs, phone, card…) — privacy/compliance',
  exceptions: 'error handling — new failure paths must not be swallowed or unguarded',
  behavior: 'general logic/behavior change — rounding, flows, edge behaviour',
  authorization: 'access-control edge — who may do this, privilege escalation',
  concurrency: 'race / ordering / lock edge',
  precision: 'numeric precision, rounding, overflow edge',
  timezone: 'timezone / DST / date edge',
  boundary: 'boundary / length / limit edge',
  nullEmpty: 'null / empty / optional edge',
  idempotency: 'duplicates / repeated call edge',
  rollback: 'rollback / atomicity across deploy window',
  volume: 'data volume / performance edge',
};
const catHint = (c) => (CATEGORY_HINTS[c] ? `${c}: ${CATEGORY_HINTS[c]}` : undefined);

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const sevClass = (sev) => (sev === 'high' ? 'sev-high' : sev === 'medium' ? 'sev-med' : 'sev-low');
const sevLabel = (sev) => String(sev).toUpperCase();

function chip(text, cls, title) {
  return `<span class="chip ${cls}"${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(text)}</span>`;
}

function evidenceChip(ev) {
  const txt = `${ev.path}:${ev.line}${ev.deleted ? ' (deleted)' : ''}`;
  return `<span class="chip evidence" title="click to select">${escapeHtml(txt)}</span>`;
}

function detailsRow(summary, body, open = false) {
  return `<details${open ? ' open' : ''}><summary>${summary}</summary>${body}</details>`;
}

function riskRow(r) {
  return `<li class="row">
  <div class="row-head">
    ${chip(r.id, 'chip-id')}
    ${chip(sevLabel(r.severity), sevClass(r.severity))}
    ${chip(r.category, 'chip-cat', catHint(r.category))}
    <span class="row-title">${escapeHtml(r.title)}</span>
  </div>
  <div class="row-body">
    <p>${escapeHtml(r.rationale)}</p>
    ${r.evidence && r.evidence.length ? `<p class="row-evidence">${r.evidence.map(evidenceChip).join(' ')}</p>` : ''}
  </div>
</li>`;
}

function edgeRow(e) {
  return `<li class="row">
  <div class="row-head">
    ${chip(e.id, 'chip-id')}
    ${chip(sevLabel(e.severity), sevClass(e.severity))}
    ${chip(e.category, 'chip-cat', catHint(e.category))}
    ${chip(e.level, 'chip-lvl')}
    <span class="row-title">${escapeHtml(e.scenario)}</span>
  </div>
  <div class="row-body">
    <p><span class="lbl">Why:</span> ${escapeHtml(e.whyConcern)}</p>
    <p><span class="lbl">Assert:</span> ${escapeHtml(e.assertion)}</p>
    ${e.focusFile ? `<p class="row-evidence">${chip(e.focusFile, 'evidence')}</p>` : ''}
  </div>
</li>`;
}

function happyRow(t) {
  return `<li class="row">
  <div class="row-head">
    ${chip(t.id, 'chip-id')}
    ${chip(t.level, 'chip-lvl')}
    <span class="row-title">${escapeHtml(t.scenario)}</span>
  </div>
  <div class="row-body">
    <p><span class="lbl">Input:</span> <span class="mono">${escapeHtml(t.input)}</span></p>
    <p><span class="lbl">Expected:</span> ${escapeHtml(t.expected)}</p>
  </div>
</li>`;
}

function fileRow(f, note) {
  const stat = f.binary
    ? chip('binary', 'chip-lvl')
    : `<span class="mono dim">+${f.added} −${f.deleted}</span>`;
  const stChip = chip(f.status, `chip-st ${statusCls(f.status)}`);
  return `<li class="file-row">
    <span class="mono">${escapeHtml(f.path)}</span> ${stat} ${stChip}
    ${note ? `<div class="file-note">${escapeHtml(note)}</div>` : ''}
  </li>`;
}

function dirOf(p) {
  const seg = String(p).split('/');
  return seg.length > 1 ? seg.slice(0, -1).join('/') : '(root)';
}

const STATUS_ORDER = ['A', 'M', 'D', 'R', 'C', 'T', 'B'];

/** Per-status semantic colour class (light theme). */
const statusCls = (s) => ({ A: 'st-A', M: 'st-M', D: 'st-D', R: 'st-R', C: 'st-C', T: 'st-T', B: 'st-B' })[s] || 'st-T';

/** Colored status mix per directory, e.g. "3A 2M 1D 1R" — only non-zero counts. */
function statusMix(files) {
  const counts = {};
  for (const f of files) counts[f.status] = (counts[f.status] || 0) + 1;
  return STATUS_ORDER.filter((s) => counts[s])
    .map((s) => `<span class="st ${statusCls(s)}">${counts[s]}${s}</span>`)
    .join(' ');
}

/**
 * Render full curated HTML brief.
 * @param {object} model validated change-model
 * @param {object|null} changeSet optional validated change-set (deterministic sections)
 */
export function renderChangeBrief(model, changeSet = null) {
  const perFileNotes = new Map((model.summary?.perFile || []).map((n) => [n.path, n.note]));
  const filesByDir = new Map();
  for (const f of changeSet?.files || []) {
    const d = dirOf(f.path);
    if (!filesByDir.has(d)) filesByDir.set(d, []);
    filesByDir.get(d).push(f);
  }

  // ---- header -------------------------------------------------------------
  // warnings only — the numeric KPI strip was dropped (low value on top of the chart)
  const warnBits = [];
  if (changeSet?.baseAheadCount > 0) {
    warnBits.push(chip(`base ahead by ${changeSet.baseAheadCount}`, 'warn-chip', 'merge/rebase before review?'));
  }
  if (changeSet?.baseLocalNote) {
    warnBits.push(chip('local base may be stale', 'warn-chip', changeSet.baseLocalNote));
  }
  if (changeSet?.workingTreeDirty) {
    warnBits.push(chip('dirty working tree', 'warn-chip', 'HEAD diff does not include uncommitted edits'));
  }

  const short = (s) => (s ? String(s).slice(0, 8) : '');
  const metaBits = [`${escapeHtml(model.head)} → ${escapeHtml(model.base)}`];
  if (changeSet) {
    const hs = short(changeSet.headSha);
    const bs = short(changeSet.baseSha);
    if (hs && bs) metaBits.push(`<span class="mono">${escapeHtml(hs)}… → ${escapeHtml(bs)}…</span>`);
  }
  if (warnBits.length) metaBits.push(`<span>${warnBits.join(' ')}</span>`);

  // ---- What changed --------------------------------------------------------
  let changedSection = '';
  if (changeSet) {
    // sort dirs by path so nested directories sit adjacent (not by size)
    const dirs = (changeSet.topDirs || [])
      .slice(0, MAX_DIRS)
      .sort((a, b) => a.dir.localeCompare(b.dir, 'en', { sensitivity: 'base' }));
    const moreDirs = (changeSet.topDirs || []).length - dirs.length;
    const blocks = dirs
      .map((d) => {
        const files = (filesByDir.get(d.dir) || []).slice().sort((a, b) => b.added + b.deleted - (a.added + a.deleted));
        const visible = files.slice(0, FILES_PER_DIR);
        const rest = files.slice(FILES_PER_DIR);
        const listHtml = visible.map((f) => fileRow(f, perFileNotes.get(f.path))).join('');
        const restHtml = rest.length
          ? detailsRow(`Show ${rest.length} more file(s)`, `<ul class="file-list">${rest.map((f) => fileRow(f, perFileNotes.get(f.path))).join('')}</ul>`)
          : '';
        const noText = files.every((f) => f.binary);
        return `<details class="dir">
          <summary class="dir-summary" title="${escapeHtml(`${d.added} added · ${d.deleted} deleted across ${d.fileCount} file(s)`)}">
            <span class="dir-name">${escapeHtml(d.dir)}</span>
            <span class="dir-mix" title="A added · M modified · D deleted · R renamed">${statusMix(files)}</span>
            <span class="dir-num">+${d.added}/−${d.deleted}</span>
            <span class="dir-chev" aria-hidden="true">▸</span>
          </summary>
          ${noText ? '<p class="dim">(binary changes only — no text lines)</p>' : `<ul class="file-list">${listHtml}</ul>${restHtml}`}
        </details>`;
      })
      .join('');
    changedSection = `<section>
      <h2>What changed</h2>
      ${blocks}
      ${moreDirs > 0 ? `<p class="dim">… ${moreDirs} more director${moreDirs === 1 ? 'y' : 'ies'} with smaller changes</p>` : ''}
    </section>`;
  }

  // ---- Summary --------------------------------------------------------------
  const summarySection = `<section>
    <h2>Summary</h2>
    <p class="summary-head">${escapeHtml(model.summary?.headline || '')}</p>
    <p class="summary-body">${escapeHtml(model.summary?.why || '')}</p>
  </section>`;

  // ---- Risks ------------------------------------------------------------------
  const risks = (model.risks || []).slice().sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
  const visibleRisks = risks.slice(0, VISIBLE_RISKS);
  const hiddenRisks = risks.slice(VISIBLE_RISKS);
  const scanned = model.scannedCategories || [];
  const assessedCats = new Set([...scanned, ...risks.map((r) => r.category)]);
  // deterministic backstop: categories the *collector* tagged on changed paths
  // (sensitiveTouch) but the model neither listed as checked nor raised a risk
  const missed = new Map(); // tag -> example path
  for (const [p, tags] of Object.entries(changeSet?.sensitiveTouch || {})) {
    for (const t of tags) {
      if (!assessedCats.has(t) && !missed.has(t)) missed.set(t, p);
    }
  }
  const missedHtml = missed.size
    ? `<p class="missed">⚠ category not assessed: ${[...missed.entries()].map(([t, p]) => chip(`${t} (${p})`, 'warn-chip')).join(' ')}</p>`
    : '';
  const riskSection = `<section>
    <h2>Risks</h2>
    ${risks.length === 0 ? `<p class="empty">No risks flagged.</p>` : `<ul class="rows">${visibleRisks.map(riskRow).join('')}</ul>`}
    ${hiddenRisks.length ? detailsRow(`Show all ${risks.length} risks`, `<ul class="rows">${hiddenRisks.map(riskRow).join('')}</ul>`) : ''}
    ${missedHtml}
    ${scanned.length ? `<p class="dim checked">Checked: ${scanned.map((c) => chip(c, 'chip-cat', catHint(c))).join(' ')}</p>` : ''}
  </section>`;

  // ---- Tests -------------------------------------------------------------------
  const happy = (model.tests?.happyPath || []).slice(0, 6);
  const happyAll = model.tests?.happyPath || [];
  const happyRest = happyAll.length - happy.length;
  const edges = (model.tests?.edgeCases || []).slice().sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
  const visibleEdges = edges.slice(0, VISIBLE_EDGES);
  const hiddenEdges = edges.slice(VISIBLE_EDGES);

  const testsSection = `<section>
    <h2>Test ideas</h2>
    ${happyAll.length ? `<h3 class="sub">Happy path</h3><ul class="rows">${happy.map(happyRow).join('')}</ul>${happyRest > 0 ? detailsRow(`Show ${happyRest} more`, `<ul class="rows">${happyAll.slice(6).map(happyRow).join('')}</ul>`) : ''}` : ''}
    ${edges.length ? `<h3 class="sub">Edge cases</h3><ul class="rows">${visibleEdges.map(edgeRow).join('')}</ul>` : ''}
    ${hiddenEdges.length ? detailsRow(`Show all ${edges.length} edge cases`, `<ul class="rows">${hiddenEdges.map(edgeRow).join('')}</ul>`) : ''}
  </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model.title || 'Change Brief')} · ${escapeHtml(model.head)} → ${escapeHtml(model.base)}</title>
<style>
:root{--ink:#1c2430;--mut:#5c6b7a;--line:#e2e8ee;--add:#1a7f37;--del:#c62828;--amber:#b45309;--chip:#eef2f6;--chipline:#d8e0e8;}
*{box-sizing:border-box}
body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;color:var(--ink);background:#fff;padding:0 0 48px}
.wrap{max-width:960px;margin:0 auto;padding:0 20px}
header.top{padding:16px 0 2px}
.meta{font-size:12px;color:var(--mut);display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:6px}
.meta .chip{margin:0}
.doc-title{font-size:20px;font-weight:700;margin:0 0 0;line-height:1.3}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--mut);margin:14px 0 6px;padding-top:14px;border-top:1px solid var(--line)}
h3.sub{font-size:13px;font-weight:600;margin:14px 0 4px}
.summary-head{font-size:14px;font-weight:600;margin:0 0 6px}
.summary-body{font-size:14px;margin:0;color:#2b3644}
.chip{display:inline-block;border-radius:999px;padding:0 8px;font-size:11px;line-height:1.7;margin:1px 2px;background:var(--chip);border:1px solid var(--chipline);-webkit-user-select:all;user-select:all;white-space:nowrap}
.chip.evidence{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f1f6fb;border-color:#c9d9ea}
.chip-id{background:#fff;color:var(--mut)}
.chip-cat{background:#eef6ef}
.chip-st{background:#f4f1ff;border-color:#ddd6f3}
.st{font-weight:700}
.dir-mix .st{margin-right:4px}
.st-A{color:#1a7f37}
.st-M{color:#2563eb}
.st-D{color:#c62828}
.st-R{color:#7c3aed}
.st-C{color:#7c3aed}
.st-T{color:#6b7280}
.st-B{color:#6b7280}
.chip.st-A{background:#e9f7ee;border-color:#b7e2c6;color:#1a7f37}
.chip.st-M{background:#eaf1fe;border-color:#b9cdf3;color:#2563eb}
.chip.st-D{background:#fdecec;border-color:#f0b8b8;color:#c62828}
.chip.st-R{background:#f3edfd;border-color:#d4c3f4;color:#7c3aed}
.chip.st-C{background:#f3edfd;border-color:#d4c3f4;color:#7c3aed}
.chip.st-T{background:#f1f3f5;border-color:#d3d9de;color:#6b7280}
.chip.st-B{background:#f1f3f5;border-color:#d3d9de;color:#6b7280}
.chip-lvl{background:#f4f1f1}
.sev-high{background:#fdecec;border-color:#f2b8b8;color:var(--del);font-weight:600}
.sev-med{background:#fdf3e3;border-color:#ecd9a8;color:var(--amber);font-weight:600}
.sev-low{background:#e8f6ec;border-color:#bfe3c9;color:#1a7f37;font-weight:600}
.warn-chip{background:#fff8e6;border-color:#ead9a8;color:#7c4a03}
details.dir{margin:0 0 3px}
details.dir summary{list-style:none;display:flex;align-items:center;gap:10px;cursor:pointer;padding:4px 6px;border-radius:6px;font-size:13px;color:var(--ink)}
details.dir summary::-webkit-details-marker{display:none}
details.dir summary:hover{background:#f4f7fa}
details.dir[open] summary{border-bottom:1px solid var(--line)}
.dir-name{flex:1 1 auto;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.dir-mix{flex:0 0 auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--mut);white-space:nowrap}
.dir-num{flex:0 0 auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;white-space:nowrap}
.dir-chev{flex:0 0 12px;font-size:10px;color:#b6c2ce;transition:transform .12s;text-align:center}
details.dir[open] .dir-chev{color:var(--mut);transform:rotate(90deg)}
details.dir summary:hover .dir-chev{color:var(--mut)}
details.dir .file-list{margin:2px 0 4px;padding-left:30px;border-left:2px solid var(--line);margin-left:12px}
.rows{list-style:none;padding:0;margin:6px 0}
.row{padding:8px 10px;border:1px solid var(--line);border-radius:6px;margin:6px 0;background:#fbfcfd}
.row-head{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.row-title{font-size:13px;font-weight:600;margin-left:2px}
.row-body{margin:4px 0 0 2px;font-size:12px;color:#2b3644}
.row-body p{margin:3px 0}
.row-evidence{margin-top:4px!important}
.lbl{font-weight:600;color:var(--mut)}
.file-list{list-style:none;padding:0;margin:4px 0}
.file-row{padding:3px 0;font-size:12px}
.file-note{color:var(--mut);font-size:11px;margin:1px 0 2px 12px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.dim{color:var(--mut);font-size:11px}
.checked{margin-top:8px}
.missed{margin:8px 0 0;font-size:12px}
.missed .chip{margin-left:0}
.empty{color:var(--add);font-weight:600}
details{margin:4px 0}
summary{cursor:pointer;font-size:12px;color:#2b4c7e;padding:2px 0}
footer.foot{margin-top:36px;padding-top:10px;border-top:1px solid var(--line);font-size:11px;color:var(--mut);letter-spacing:.03em}
@media print{-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <h1 class="doc-title">${escapeHtml(model.title || '')}</h1>
  <div class="meta">${metaBits.join('<span class="dim">·</span>')}</div>
</header>
${summarySection}
${changedSection}
${riskSection}
${testsSection}
<footer class="foot">Change Brief · schema v${escapeHtml(String(model.schemaVersion))}</footer>
</div>
</body>
</html>
`;
}
