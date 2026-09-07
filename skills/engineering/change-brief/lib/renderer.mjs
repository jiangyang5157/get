// Phase C — pure renderer. change-model.json (+ optional change-set.json for
// deterministic diff chart / commit timeline / KPI) -> HTML string.
// Also renders the short markdown CR/PR paste block. No fs, no network.

const SEV_ORDER = { high: 0, medium: 1, low: 2 };

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
  return `<li class="risk-row">
  <span class="risk-head">
    ${chip(r.id, 'chip-id')}
    ${chip(sevLabel(r.severity), sevClass(r.severity))}
    ${chip(r.category, 'chip-cat')}
    <span class="risk-title">${escapeHtml(r.title)}</span>
  </span>
  <div class="risk-body">
    <p class="risk-rationale">${escapeHtml(r.rationale)}</p>
    ${r.evidence && r.evidence.length ? `<p class="risk-evidence">${r.evidence.map(evidenceChip).join(' ')}</p>` : ''}
  </div>
</li>`;
}

function edgeRow(e) {
  return `<li class="edge-row">
  <span class="risk-head">
    ${chip(e.id, 'chip-id')}
    ${chip(sevLabel(e.severity), sevClass(e.severity))}
    ${chip(e.category, 'chip-cat')}
    ${chip(e.level, 'chip-lvl')}
    <span class="risk-title">${escapeHtml(e.scenario)}</span>
  </span>
  <div class="risk-body">
    <p><strong>Why:</strong> ${escapeHtml(e.whyConcern)}</p>
    <p><strong>Assert:</strong> ${escapeHtml(e.assertion)}</p>
    ${e.focusFile ? `<p class="risk-evidence">${chip(e.focusFile, 'evidence')}</p>` : ''}
  </div>
</li>`;
}

const VISIBLE_RISKS = 8;
const VISIBLE_EDGES = 8;
const VISIBLE_HAPPY = 6;
const VISIBLE_FILES = 25;

/**
 * Render full curated HTML brief.
 * @param {object} model validated change-model
 * @param {object|null} changeSet optional validated change-set (deterministic sections)
 */
export function renderChangeBrief(model, changeSet = null) {
  const perFileNotes = new Map((model.summary?.perFile || []).map((n) => [n.path, n.note]));
  const byPath = new Map((changeSet?.files || []).map((f) => [f.path, f]));

  // ---- header / KPI strip ------------------------------------------------
  const kpiBits = [];
  if (changeSet) {
    const nFiles = changeSet.files.length;
    const nCommits = changeSet.commits.length;
    kpiBits.push(`<span class="kpi"><b>${nFiles}</b> file${nFiles === 1 ? '' : 's'}</span>`);
    kpiBits.push(`<span class="kpi diff-add">+${changeSet.totalAdded}</span>`);
    kpiBits.push(`<span class="kpi diff-del">−${changeSet.totalDeleted}</span>`);
    kpiBits.push(`<span class="kpi"><b>${nCommits}</b> commit${nCommits === 1 ? '' : 's'}</span>`);
    if (changeSet.baseAheadCount > 0) {
      kpiBits.push(chip(`base ahead by ${changeSet.baseAheadCount}`, 'warn-chip', 'merge/rebase before review?'));
    }
    if (changeSet.workingTreeDirty) {
      kpiBits.push(chip('dirty working tree', 'warn-chip', 'HEAD diff does not include uncommitted edits'));
    }
  }
  const risky = (model.risks || []).filter((r) => r.severity === 'high').length;
  if (risky > 0) kpiBits.push(chip(`${risky} high-risk`, 'sev-high'));

  const headerMeta = `${escapeHtml(model.head)} → ${escapeHtml(model.base)}`;
  const shortSha = (s) => (s ? escapeHtml(String(s).slice(0, 8)) : '');

  // ---- module diff bars ---------------------------------------------------
  let diffSection = '';
  if (changeSet) {
    const dirs = (changeSet.topDirs || []).slice(0, 12);
    const maxTotal = Math.max(1, ...dirs.map((d) => d.added + d.deleted));
    const bars = dirs
      .map((d) => {
        const wAdd = Math.round((d.added / maxTotal) * 100);
        const wDel = Math.round((d.deleted / maxTotal) * 100);
        const filesIn = changeSet.files.filter((f) => {
          const seg = f.path.split('/');
          const dir = seg.length > 1 ? seg.slice(0, -1).join('/') : '(root)';
          return dir === d.dir;
        });
        const sample = filesIn.slice(0, 3).map((f) => f.path).join(', ');
        const more = filesIn.length > 3 ? ` … +${filesIn.length - 3}` : '';
        return `<div class="bar-row">
          <span class="bar-label">${escapeHtml(d.dir)}<span class="bar-sub">${filesIn.length} file${filesIn.length === 1 ? '' : 's'} · ${escapeHtml(sample)}${more}</span></span>
          <span class="bar-track">
            <span class="bar-add" style="width:${wAdd}%"></span>
            <span class="bar-del" style="width:${wDel}%"></span>
          </span>
          <span class="bar-num">+${d.added}/−${d.deleted}</span>
        </div>`;
      })
      .join('');
    const total = changeSet.files.length;
    const moreFiles = total > VISIBLE_FILES ? ` <span class="dim">… ${total - VISIBLE_FILES} more file(s)</span>` : '';
    const fileRows = (changeSet.files || [])
      .slice()
      .sort((a, b) => b.added + b.deleted - (a.added + a.deleted))
      .slice(0, VISIBLE_FILES)
      .map((f) => {
        const note = perFileNotes.get(f.path);
        const statChip = f.binary
          ? chip('binary', 'chip-lvl')
          : `<span class="mono dim">+${f.added} −${f.deleted}</span>`;
        return `<li><span class="mono">${escapeHtml(f.path)}</span> ${statChip} ${chip(f.status, 'chip-st')}${note ? `<div class="file-note">${escapeHtml(note)}</div>` : ''}</li>`;
      })
      .join('');
    diffSection = `<section>
      <h2>What changed</h2>
      ${bars}
      ${moreFiles}
      ${detailsRow('Per-file detail', `<ul class="file-list">${fileRows}</ul>`)}
    </section>`;
  }

  // ---- commit timeline ------------------------------------------------------
  let commitSection = '';
  if (changeSet && changeSet.commits.length) {
    const commits = changeSet.commits.slice(0, 12);
    const items = commits
      .map((c) => {
        const d = c.dateIso ? new Date(c.dateIso) : null;
        const dateStr = d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
        return `<li class="commit-item">
          <span class="mono">${escapeHtml(String(c.hash).slice(0, 8))}</span>
          <span class="commit-subject">${escapeHtml(c.subject)}</span>
          <span class="dim">${escapeHtml(c.author)}${dateStr ? ` · ${dateStr}` : ''}</span>
        </li>`;
      })
      .join('');
    const rest = changeSet.commits.length - commits.length;
    commitSection = `<section>
      <h2>Commits</h2>
      <ol class="commit-list">${items}</ol>
      ${rest > 0 ? `<span class="dim">… ${rest} more</span>` : ''}
    </section>`;
  }

  // ---- summary card ---------------------------------------------------------
  const perFileList = (model.summary?.perFile || [])
    .map((n) => `<li><span class="mono">${escapeHtml(n.path)}</span><div class="file-note">${escapeHtml(n.note)}</div></li>`)
    .join('');
  const summarySection = `<section>
    <h2>Summary</h2>
    <h3 class="headline">${escapeHtml(model.title)}</h3>
    <p class="lede">${escapeHtml(model.summary?.headline || '')}</p>
    <p>${escapeHtml(model.summary?.why || '')}</p>
    ${perFileList ? detailsRow('Why each file changed', `<ul class="file-list">${perFileList}</ul>`) : ''}
  </section>`;

  // ---- risk board ------------------------------------------------------------
  const risks = (model.risks || []).slice().sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
  const visibleRisks = risks.slice(0, VISIBLE_RISKS);
  const hiddenRisks = risks.slice(VISIBLE_RISKS);
  const scanned = model.scannedCategories || [];
  const riskSection = `<section>
    <h2>Risks</h2>
    <p class="callout">${escapeHtml('For reviewers. Evidence points at file:line in the change — select to copy.')}</p>
    ${risks.length === 0 ? `<p class="empty">No risks flagged.</p>` : `<ul class="risk-list">${visibleRisks.map(riskRow).join('')}</ul>`}
    ${hiddenRisks.length ? detailsRow(`All ${risks.length} risks`, `<ul class="risk-list">${hiddenRisks.map(riskRow).join('')}</ul>`) : ''}
    ${scanned.length ? `<p class="dim">Scanned categories: ${scanned.map((c) => chip(c, 'chip-cat')).join(' ')}</p>` : ''}
  </section>`;

  // ---- tests section -----------------------------------------------------------
  const happy = (model.tests?.happyPath || []).slice(0, VISIBLE_HAPPY);
  const happyAll = model.tests?.happyPath || [];
  const happyRows = happy
    .map(
      (t) => `<tr><td>${chip(t.id, 'chip-id')}</td><td>${escapeHtml(t.scenario)}</td><td class="mono small">${escapeHtml(t.input)}</td><td>${escapeHtml(t.expected)}</td><td>${chip(t.level, 'chip-lvl')}</td></tr>`,
    )
    .join('');
  const happyRest = happyAll.length - happy.length;

  const edges = (model.tests?.edgeCases || []).slice().sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
  const visibleEdges = edges.slice(0, VISIBLE_EDGES);
  const hiddenEdges = edges.slice(VISIBLE_EDGES);
  const focusFiles = (model.tests?.focusFiles || []).slice(0, 12);

  const testsSection = `<section>
    <h2>Test suggestions</h2>
    <p class="callout">${escapeHtml('For the author and testers. Unit/integration cases are concrete; e2e cases are behaviour-level — replace {PLACEHOLDERS} with real app flows.')}</p>
    ${happyRows ? `<h3>Happy path</h3><table class="tbl"><thead><tr><th>id</th><th>scenario</th><th>input</th><th>expected</th><th>level</th></tr></thead><tbody>${happyRows}</tbody></table>` : ''}
    ${happyRest > 0 ? `<span class="dim">… ${happyRest} more happy-path case(s)</span>` : ''}
    ${visibleEdges.length ? `<h3>Edge cases</h3><ul class="risk-list">${visibleEdges.map(edgeRow).join('')}</ul>` : ''}
    ${hiddenEdges.length ? detailsRow(`All ${edges.length} edge cases`, `<ul class="risk-list">${hiddenEdges.map(edgeRow).join('')}</ul>`) : ''}
    ${focusFiles.length ? `<p class="dim">Focus files: ${focusFiles.map((f) => chip(f, 'evidence')).join(' ')}</p>` : ''}
  </section>`;

  // ---- CR copy block -----------------------------------------------------------
  const cr = model.crDraft;
  let crSection = '';
  if (cr) {
    const lines = [];
    lines.push(`Systems affected: ${(cr.affectedSystems || []).join(', ') || '—'}`);
    if (cr.rollbackNote) lines.push(`Rollback: ${cr.rollbackNote}`);
    if (cr.testEvidenceNote) lines.push(`Test evidence: ${cr.testEvidenceNote}`);
    for (const n of cr.reviewerNotes || []) lines.push(`Reviewer note: ${n}`);
    crSection = `<section>
      <h2>CR / PR summary</h2>
      <pre class="copyblock">${escapeHtml(lines.join('\n'))}</pre>
      <p class="dim">Plain text — select all to copy.</p>
    </section>`;
  }

  // ---- footer -------------------------------------------------------------------
  const footer = `<footer class="dim">${escapeHtml('Change Brief · local-only · no code uploaded')} · schemaVersion ${escapeHtml(String(model.schemaVersion))}</footer>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Change Brief · ${escapeHtml(model.head)} → ${escapeHtml(model.base)}</title>
<style>
:root{--ink:#1c2430;--mut:#5c6b7a;--line:#e2e8ee;--add:#1a7f37;--del:#c62828;--amber:#b45309;--bg:#ffffff;}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;color:var(--ink);background:var(--bg);line-height:1.45;padding:0 0 40px}
.wrap{max-width:980px;margin:0 auto;padding:0 20px}
header.top{padding:22px 0 6px;border-bottom:2px solid var(--line);margin-bottom:18px}
h1{font-size:20px;margin:0 0 4px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:26px 0 8px;padding-top:14px;border-top:1px solid var(--line)}
h3{font-size:15px;margin:14px 0 6px}
.headline{font-size:17px;margin:2px 0 6px}
.lede{font-size:15px;font-weight:600}
.meta{font-size:12px;color:var(--mut)}
.kpi{display:inline-block;margin:0 12px 0 0;font-size:13px}
.kpi b{font-size:15px}
.diff-add{color:var(--add);font-weight:600}
.diff-del{color:var(--del);font-weight:600}
.chip{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11px;line-height:1.6;margin:1px 2px;background:#eef2f6;border:1px solid #d8e0e8;-webkit-user-select:all;user-select:all;white-space:nowrap}
.chip.evidence{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f1f6fb;border-color:#c9d9ea}
.chip-id{background:#fff;color:var(--mut);border-color:#d8e0e8}
.chip-cat{background:#eef6ef}
.chip-st{background:#f4f1ff;border-color:#ddd6f3}
.chip-lvl{background:#f4f1f1}
.sev-high{background:#fdecec;border-color:#f2b8b8;color:var(--del);font-weight:600}
.sev-med{background:#fdf3e3;border-color:#ecd9a8;color:var(--amber);font-weight:600}
.sev-low{background:#e8f6ec;border-color:#bfe3c9;color:#1a7f37;font-weight:600}
.warn-chip{background:#fff8e6;border-color:#ead9a8;color:#7c4a03}
.bar-row{display:flex;align-items:center;gap:10px;margin:5px 0}
.bar-label{flex:0 0 200px;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-sub{display:block;color:var(--mut);font-size:10px}
.bar-track{flex:1;display:flex;height:14px;border-radius:3px;overflow:hidden;background:#f2f5f8}
.bar-add{background:var(--add);height:100%}
.bar-del{background:var(--del);height:100%}
.bar-num{flex:0 0 74px;text-align:right;font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.risk-head{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.risk-title{font-size:13px;font-weight:600;margin-left:2px}
.risk-body{margin:4px 0 2px 4px;font-size:12px;color:#2b3644}
.risk-body p{margin:3px 0}
.risk-list,.file-list,.commit-list{list-style:none;padding:0;margin:8px 0}
.risk-row,.edge-row{padding:8px 10px;border:1px solid var(--line);border-radius:6px;margin:6px 0;background:#fbfcfd}
.file-list li{padding:3px 0;font-size:12px}
.file-note{color:var(--mut);font-size:11px;margin:1px 0 2px 16px}
.commit-list li{padding:2px 0;font-size:12px;display:flex;gap:8px;flex-wrap:wrap}
.commit-subject{flex:1}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.small{font-size:11px}
.dim{color:var(--mut);font-size:11px}
.callout{background:#f0f7ff;border-left:3px solid #7fb0e0;padding:6px 10px;font-size:12px;color:#23405e;border-radius:2px}
.empty{color:var(--add);font-weight:600;font-size:13px}
.copyblock{background:#f6f8fa;border:1px solid var(--line);border-radius:6px;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;-webkit-user-select:all;user-select:all}
table.tbl{width:100%;border-collapse:collapse;font-size:12px}
table.tbl th,table.tbl td{text-align:left;padding:4px 6px;border-bottom:1px solid var(--line);vertical-align:top}
table.tbl th{color:var(--mut);font-weight:600}
details{margin:8px 0}
summary{cursor:pointer;font-size:12px;color:#2b4c7e}
footer{margin-top:30px;padding-top:10px;border-top:1px solid var(--line);font-size:11px}
@media print{-webkit-print-color-adjust:exact;print-color-adjust:exact;body{font-size:11px}}
</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <h1>Change Brief</h1>
  <div class="meta">${headerMeta}${shortSha(model.base) ? ` · <span class="mono">${shortSha(model.head)}…</span> → <span class="mono">${shortSha(model.base)}…</span>` : ''}</div>
  <div class="kpis" style="margin-top:8px">${kpiBits.join('')}</div>
</header>
${diffSection}
${commitSection}
${summarySection}
${riskSection}
${testsSection}
${crSection}
${footer}
</div>
</body>
</html>
`;
}

/** Short markdown CR/PR paste block derived from the model. */
export function renderMarkdown(model) {
  const L = [];
  L.push(`## Change Brief — ${model.head} → ${model.base}`);
  L.push('');
  L.push(`**${model.title}**`);
  L.push('');
  if (model.summary?.headline) L.push(`${model.summary.headline}`);
  if (model.summary?.why) L.push('');
  if (model.summary?.why) L.push(model.summary.why);
  const risks = (model.risks || []).slice().sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
  if (risks.length) {
    L.push('');
    L.push('### Risks');
    for (const r of risks.slice(0, 10)) {
      const ev = (r.evidence || []).map((e) => `${e.path}:${e.line}${e.deleted ? ' (deleted)' : ''}`).join(', ');
      L.push(`- **[${r.severity}] ${r.category}** ${r.title}${ev ? ` — ${ev}` : ''}`);
    }
  }
  const tests = model.tests || {};
  if ((tests.edgeCases || []).length) {
    L.push('');
    L.push('### Test focus');
    for (const e of tests.edgeCases.slice(0, 5)) L.push(`- [${e.severity}] ${e.scenario}`);
  }
  if (model.crDraft) {
    const cr = model.crDraft;
    L.push('');
    L.push('### CR notes');
    if (cr.affectedSystems?.length) L.push(`- Systems affected: ${cr.affectedSystems.join(', ')}`);
    if (cr.rollbackNote) L.push(`- Rollback: ${cr.rollbackNote}`);
    if (cr.testEvidenceNote) L.push(`- Test evidence: ${cr.testEvidenceNote}`);
    for (const n of cr.reviewerNotes || []) L.push(`- Reviewer note: ${n}`);
  }
  return L.join('\n');
}
