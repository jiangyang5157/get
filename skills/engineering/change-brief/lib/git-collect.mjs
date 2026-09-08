// Phase A — deterministic git collection. No LLM.
// Runs ONLY read-only git (plus remote-tracking ref fetches) and writes
// change-set.json. Never modifies the working tree.
import { spawnSync } from 'node:child_process';
import domain from './engineering.mjs';

// Content snapshot budget (text lines embedded into change-set.json).
const PER_FILE_ADDED_CAP = 400;   // added text lines per file
const PER_FILE_DELETED_CAP = 200; // deleted text lines per file
const GLOBAL_TEXT_CAP = 6000;     // added+deleted text lines across all files
const COMMITS_CAP = 500;

const GIT_ENV = { ...process.env, LC_ALL: 'C' };

export class CollectError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CollectError';
  }
}

function runGit(args, { allowFail = false, cwd = process.cwd() } = {}) {
  const res = spawnSync('git', args, { encoding: 'utf8', env: GIT_ENV, cwd, maxBuffer: 512 * 1024 * 1024 });
  if (res.error) throw new CollectError(`git failed to start: ${res.error.message}`);
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function gitOk(args, cwd) {
  return runGit(args, { cwd }).status === 0;
}

/** True when cwd is inside a git work tree. */
export function isGitRepo(cwd = process.cwd()) {
  const r = runGit(['rev-parse', '--is-inside-work-tree'], { allowFail: true, cwd });
  return r.status === 0 && r.stdout.trim() === 'true';
}

/** Parse `@@ -o[,oc] +n[,nc] @@`; returns {oldStart,newStart} or null. */
function parseHunkHeader(line) {
  const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (!m) return null;
  return { oldStart: Number(m[1]), newStart: Number(m[3]) };
}

/** Minimal unquote for git C-style quoted pathnames. */
function gitUnquote(s) {
  if (!s || !s.startsWith('"')) return s;
  let out = '';
  for (let i = 1; i < s.length - 1; i++) {
    const ch = s[i];
    if (ch === '\\') {
      const nxt = s[i + 1];
      const map = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' };
      if (map[nxt]) { out += map[nxt]; i++; }
      else if (/^[0-7]{3}$/.test(s.slice(i + 1, i + 4))) {
        out += String.fromCharCode(parseInt(s.slice(i + 1, i + 4), 8)); i += 3;
      } else { out += nxt; i++; }
    } else out += ch;
  }
  return out;
}

function afterPrefix(line, prefix) {
  if (!line.startsWith(prefix)) return null;
  return gitUnquote(line.slice(prefix.length).trim());
}

/** strip the leading "a/" or "b/" diff prefix, when present */
function stripDiffPrefix(p) {
  if (p === null) return null;
  return p.replace(/^[ab]\//, '');
}

/** Tag a changed path into sensitive-touch categories per domain tagRules. */
export function tagPath(domain, p) {
  const tags = [];
  for (const [tag, patterns] of Object.entries(domain.tagRules || {})) {
    if (patterns.some((re) => new RegExp(re, 'i').test(p))) tags.push(tag);
  }
  return tags;
}

/** Filenames whose content must never be embedded in change-set.json. */
function isSensitiveFilename(p) {
  const base = p.split('/').pop();
  return (
    /(^|[._-])(env|secret|credential|token)([._-]|$)/i.test(base) ||
    /\.(pem|p12|pfx|jks|key)$/i.test(base)
  );
}

/**
 * Phase A collector.
 * @param {object} opts {
 *   base: string           — target branch B (resolved as origin/<base>)
 *   from?: string|null     — source branch/ref A; defaults to current HEAD
 *   dirtyExclude?: string|null — pathspec to exclude from the dirty check
 *                                (e.g. ".change-brief" or ".out/foo"); relative
 *                                to the repo root. null/"" = no exclusion.
 *   repoContext?, cwd?
 * }
 * @returns {Promise<object>} change-set object (caller persists it)
 */
export async function collect({ base, from = null, dirtyExclude = null, repoContext = null, cwd = process.cwd() }) {
  if (!isGitRepo(cwd)) throw new CollectError('Not a git repository');

  const headRef = from || 'HEAD'; // A — any git-resolvable ref (branch/tag/origin/x/sha)
  const headIsWorkingHead = headRef === 'HEAD';
  const out = {
    schemaVersion: '1',
    generator: 'change-brief-collect',
    headSpec: headRef,
    headBranch: null, headSha: null, detachedHead: false,
    baseBranch: base, baseRef: null, baseSha: null, mergeBaseSha: null,
    baseLocalNote: null,
    baseAheadCount: 0,
    workingTreeDirty: false,
    dirtyCount: 0,
    empty: false,
    summaryHint: null,
    totalAdded: 0, totalDeleted: 0,
    files: [], topDirs: [], commits: [], changedLines: {}, sensitiveTouch: {},
    contentOmitted: {}, repoContext,
  };

  // 1. head identity — resolve A's sha + display name (no checkout needed when
  //    A != HEAD; every git call below is ref-based). A is tried locally first;
  //    if absent, origin/<A> is consulted after the base fetch below.
  let headResolved = false;
  if (headIsWorkingHead) {
    const sym = runGit(['symbolic-ref', '-q', '--short', 'HEAD'], { allowFail: true, cwd });
    out.detachedHead = sym.status !== 0 || sym.stdout.trim() === '';
    out.headBranch = out.detachedHead
      ? `HEAD (${runGit(['rev-parse', 'HEAD'], { cwd }).stdout.trim().slice(0, 12)})`
      : sym.stdout.trim();
    out.headSha = runGit(['rev-parse', 'HEAD'], { cwd }).stdout.trim();
    headResolved = true;
  } else {
    const rev = runGit(['rev-parse', '--verify', '--quiet', `${headRef}^{commit}`], { allowFail: true, cwd });
    if (rev.status === 0 && rev.stdout.trim()) {
      out.headBranch = headRef;
      out.headSha = rev.stdout.trim();
      headResolved = true;
    }
    // not resolved → try origin/<A> after the shared fetch in step 3.
  }

  // 2. dirty snapshot — only meaningful when A is the checked-out HEAD
  //    (uncommitted edits sit on top of A; when A is another ref they are
  //    irrelevant to the A-vs-B comparison). Exclude the tool's own output
  //    directory (relative pathspec), so a previous run is not counted dirty.
  if (headIsWorkingHead) {
    const args = ['status', '--porcelain'];
    if (dirtyExclude) args.push('--', '.', `:(exclude)${dirtyExclude}`);
    const porcelain = runGit(args, { cwd }).stdout;
    const dirtyEntries = porcelain.split('\n').filter((l) => l.trim() !== '');
    out.workingTreeDirty = dirtyEntries.length > 0;
    out.dirtyCount = dirtyEntries.length;
  }

  // 3.-4. resolve B: local-first, then origin (mirrors A). When a local branch
  //    shadows origin/<B>, note the staleness so the brief is not misleading.
  let baseRef; // ref string actually usable in git commands below
  let baseLocalNote = null;
  const localBase = runGit(['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { allowFail: true, cwd });
  if (localBase.status === 0 && localBase.stdout.trim()) {
    baseRef = base; // resolvable locally: branch, tag, origin/x or sha
    out.baseSha = localBase.stdout.trim();
    // is it a *local branch* (not tag/sha)? if so it can be stale vs origin
    const isLocalBranch = gitOk(['rev-parse', '--verify', '--quiet', `refs/heads/${base}`], cwd);
    if (isLocalBranch) {
      // refresh origin once so the staleness check is honest
      const fetch = runGit(['fetch', 'origin', '--prune'], { allowFail: true, cwd });
      if (fetch.status === 0) {
        const o = runGit(['rev-parse', '--verify', '--quiet', `origin/${base}`], { allowFail: true, cwd });
        if (o.status === 0 && o.stdout.trim() && o.stdout.trim() !== out.baseSha) {
          const behind = Number(
            runGit(['rev-list', '--count', `${out.baseSha}..${o.stdout.trim()}`], { allowFail: true, cwd }).stdout.trim() || 0,
          );
          const ahead = Number(
            runGit(['rev-list', '--count', `${o.stdout.trim()}..${out.baseSha}`], { allowFail: true, cwd }).stdout.trim() || 0,
          );
          const rel =
            behind > 0 && ahead === 0
              ? `${behind} commit${behind === 1 ? '' : 's'} behind`
              : ahead > 0 && behind === 0
                ? `${ahead} commit${ahead === 1 ? '' : 's'} ahead of`
                : `diverged from`;
          baseLocalNote =
            `local branch "${base}" is ${rel} origin/${base}; using the local ref — ` +
            `pass "origin/${base}" for the remote one`;
        }
      }
    }
  } else {
    // local miss → origin fallback
    const fetch = runGit(['fetch', 'origin', '--prune'], { allowFail: true, cwd });
    if (fetch.status !== 0) {
      throw new CollectError(fetch.stderr.trim() || `git fetch origin --prune failed (exit ${fetch.status})`);
    }
    const ls = runGit(['ls-remote', '--heads', 'origin', base], { allowFail: true, cwd });
    if (ls.status !== 0 || ls.stdout.trim() === '') {
      throw new CollectError(`Branch "${base}" does not exist on origin. Ending skill.`);
    }
    const one = runGit(['fetch', 'origin', `${base}:refs/remotes/origin/${base}`], { allowFail: true, cwd });
    if (one.status !== 0) {
      throw new CollectError(`Branch "${base}" does not exist on origin. Ending skill.`);
    }
    baseRef = `origin/${base}`;
  }
  out.baseRef = baseRef;
  out.baseLocalNote = baseLocalNote;

  // 4b. resolve A if it was not found locally — fall back to origin/<A>
  //     (local-first, origin fallback). Same abort style as B when absent.
  let headGitRef = headRef; // the ref actually usable in git commands
  if (!headResolved) {
    const remoteHead = `refs/remotes/origin/${headRef}`;
    const lsA = runGit(['ls-remote', '--heads', 'origin', headRef], { allowFail: true, cwd });
    if (lsA.status !== 0 || lsA.stdout.trim() === '') {
      throw new CollectError(`Branch "${headRef}" does not exist on origin. Ending skill.`);
    }
    const fetchA = runGit(['fetch', 'origin', `${headRef}:${remoteHead}`], { allowFail: true, cwd });
    if (fetchA.status !== 0) {
      throw new CollectError(`Branch "${headRef}" does not exist on origin. Ending skill.`);
    }
    out.headBranch = `origin/${headRef}`;
    out.headSha = runGit(['rev-parse', remoteHead], { cwd }).stdout.trim();
    headGitRef = remoteHead;
    headResolved = true;
  }

  // 5. base sha + merge base + ahead count (A side = headGitRef)
  out.baseSha = runGit(['rev-parse', baseRef], { cwd }).stdout.trim();
  out.mergeBaseSha = runGit(['merge-base', headGitRef, baseRef], { cwd }).stdout.trim();
  out.baseAheadCount = Number(
    runGit(['rev-list', '--count', `${headGitRef}..${baseRef}`], { cwd }).stdout.trim() || 0,
  );

  // 6./7. per-file stats (numstat) + statuses (name-status), rename-aware (-M).
  const statDiff = ['-c', 'core.quotepath=false', 'diff', '-M', `${baseRef}...${headGitRef}`];
  const numstatLines = runGit([...statDiff, '--numstat'], { cwd }).stdout.split('\n').filter(Boolean);
  const nameStatusLines = runGit([...statDiff, '--name-status'], { cwd }).stdout.split('\n').filter(Boolean);

  // name-status first: status per path (R/C carries two paths; use the new path)
  const nameByPath = new Map();
  for (const line of nameStatusLines) {
    const m = /^([A-Z])(\d*)\t(.*)$/.exec(line);
    if (!m) continue;
    const [, status, , rest] = m;
    let p = rest;
    if (status === 'R' || status === 'C') p = rest.split('\t').pop(); // new path
    const pathName = gitUnquote(p);
    if (!nameByPath.has(pathName)) nameByPath.set(pathName, status);
  }

  // numstat rows: added<TAB>deleted<TAB>path ; renames print "{old => new}".
  const files = [];
  const seen = new Set();
  for (const line of numstatLines) {
    const m = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(line);
    if (!m) continue;
    const [, a, d, pRaw] = m;
    const binary = a === '-' || d === '-';
    const added = binary ? 0 : Number(a);
    const deleted = binary ? 0 : Number(d);
    let p = gitUnquote(pRaw.trim());
    const brace = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(p);
    if (brace) p = brace[1] + brace[3] + brace[4]; // keep new path
    if (seen.has(p)) continue;
    seen.add(p);
    files.push({
      path: p,
      status: nameByPath.get(p) || (binary ? 'B' : 'M'),
      added, deleted, binary,
    });
  }
  // name-status-only entries (e.g. pure deletions listed without numstat? keep all)
  for (const [p, status] of nameByPath) {
    if (!seen.has(p)) {
      seen.add(p);
      files.push({ path: p, status, added: 0, deleted: 0, binary: false });
    }
  }
  out.files = files;

  out.totalAdded = files.reduce((s, f) => s + (f.binary ? 0 : f.added), 0);
  out.totalDeleted = files.reduce((s, f) => s + (f.binary ? 0 : f.deleted), 0);

  // 8. commits between merge-base and A (capped)
  const logRaw = runGit(
    ['log', `${out.mergeBaseSha}..${headGitRef}`, '--format=%H%x09%an%x09%aI%x09%s', '--max-count', String(COMMITS_CAP + 1)],
    { cwd },
  ).stdout;
  const commitLines = logRaw.split('\n').filter(Boolean);
  out.commits = commitLines.slice(0, COMMITS_CAP).map((l) => {
    const [hash, author, dateIso, ...rest] = l.split('\t');
    return { hash, author, dateIso, subject: rest.join('\t') };
  });

  // 9. line-level content snapshot (single source for anchors + visible text)
  const diffU0 = runGit([...statDiff, '-U0'], { cwd }).stdout;
  const changedLines = buildChangedLines(diffU0);
  out.changedLines = changedLines;

  // 10. sensitive-touch tags + redact sensitive file content
  for (const f of files) {
    const tags = tagPath(domain, f.path);
    if (tags.length) out.sensitiveTouch[f.path] = tags;
    if (isSensitiveFilename(f.path)) {
      out.contentOmitted[f.path] = 'sensitive-filename';
      const rec = changedLines[f.path];
      if (rec) {
        for (const l of rec.text.added) l.text = '';
        for (const l of rec.text.deleted) l.text = '';
      }
    }
  }

  // top-level directory rollup
  const dirAgg = new Map();
  for (const f of files) {
    const seg = f.path.split('/');
    const dir = seg.length > 1 ? seg.slice(0, -1).join('/') : '(root)';
    const e = dirAgg.get(dir) ?? { dir, fileCount: 0, added: 0, deleted: 0 };
    e.fileCount += 1;
    e.added += f.binary ? 0 : f.added;
    e.deleted += f.binary ? 0 : f.deleted;
    dirAgg.set(dir, e);
  }
  out.topDirs = [...dirAgg.values()].sort((x, y) => (y.added + y.deleted) - (x.added + x.deleted));

  out.empty = out.totalAdded + out.totalDeleted === 0 && out.commits.length === 0;
  if (out.empty) out.summaryHint = `No committed changes in ${out.headBranch} vs ${base}`;

  return out;
}

/**
 * Parse `git diff -U0` text into per-path change snapshot:
 *   { ranges: {added:[{start,count}], deleted:[...]},   — COMPLETE anchors, no cap
 *     text:   {added:[{line,text}], deleted:[...]},     — capped visible lines (Phase B)
 *     truncated: bool }                                  — true when text was capped
 * Ranges are merged runs of changed line numbers (tiny even for huge diffs),
 * text is capped so change-set.json stays small; anchors stay complete so
 * evidence can cite any changed line, not just the first N.
 */
function buildChangedLines(diffText) {
  const result = {};
  let globalText = 0;
  let curPath = null;
  let hunk = null;

  const recFor = (p) =>
    result[p] ??
    (result[p] = {
      ranges: { added: [], deleted: [] },
      text: { added: [], deleted: [] },
      truncated: false,
    });

  // open runs being aggregated per file (for range compression)
  const openRun = { added: null, deleted: null }; // {path, start, last} per kind

  const closeRun = (kind) => {
    const r = openRun[kind];
    if (r && r.count > 0) result[r.path].ranges[kind].push({ start: r.start, count: r.count });
    openRun[kind] = null;
  };
  const extendRun = (kind, path, line) => {
    const r = openRun[kind];
    if (r && r.path === path && line === r.last + 1) {
      r.count += 1;
      r.last = line;
      return;
    }
    closeRun(kind);
    openRun[kind] = { path, start: line, last: line, count: 1 };
  };

  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      curPath = null;
      hunk = null;
      closeRun('added');
      closeRun('deleted');
      continue;
    }
    // "--- a/x" / "+++ b/x" give exact (possibly space-containing) paths
    if (line.startsWith('--- ')) {
      const p = stripDiffPrefix(afterPrefix(line, '--- '));
      if (p !== null && p !== '/dev/null') curPath = p;
      continue;
    }
    if (line.startsWith('+++ ')) {
      const p = stripDiffPrefix(afterPrefix(line, '+++ '));
      if (p !== null && p !== '/dev/null') curPath = p;
      continue;
    }
    if (curPath === null) continue;
    if (line.startsWith('@@ ')) {
      const hh = parseHunkHeader(line);
      hunk = hh ? { addedLine: hh.newStart, deletedLine: hh.oldStart } : null;
      continue;
    }
    if (hunk === null) continue;
    const rec = recFor(curPath);
    if (line.startsWith('+') && !line.startsWith('+++')) {
      // always extend the complete anchor range…
      extendRun('added', curPath, hunk.addedLine);
      // …and only keep text within budget
      const textFull = rec.text.added.length >= PER_FILE_ADDED_CAP || globalText >= GLOBAL_TEXT_CAP;
      if (textFull) rec.truncated = true;
      else {
        rec.text.added.push({ line: hunk.addedLine, text: line.slice(1) });
        globalText++;
      }
      hunk.addedLine++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      extendRun('deleted', curPath, hunk.deletedLine);
      const textFull = rec.text.deleted.length >= PER_FILE_DELETED_CAP || globalText >= GLOBAL_TEXT_CAP;
      if (textFull) rec.truncated = true;
      else {
        rec.text.deleted.push({ line: hunk.deletedLine, text: line.slice(1) });
        globalText++;
      }
      hunk.deletedLine++;
    }
  }
  closeRun('added');
  closeRun('deleted');
  for (const k of Object.keys(result)) {
    const r = result[k];
    const emptyText = r.text.added.length === 0 && r.text.deleted.length === 0;
    const emptyRange = r.ranges.added.length === 0 && r.ranges.deleted.length === 0;
    if (emptyText && emptyRange) delete result[k];
  }
  return result;
}
