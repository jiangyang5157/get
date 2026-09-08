# Phase B — Prompt 1/2: Summary + Risks (for code reviewers)

You are analyzing a git change for code review. You have ONE input: `change-set.json`.

## Hard rules (never violate)

1. READ ONLY `change-set.json`. Never invent files, commits, lines, or code that are
   not present in it.
2. Evidence must be EXACT: cite `path:line` only for lines covered by
   `changedLines[path].ranges.added` (a line falls in a range when
   `start <= line <= start+count-1`; for deletions use `.ranges.deleted` and
   append "(deleted)"). Ranges are COMPLETE anchors and are never truncated.
   Never guess a line number. If a file has no `changedLines` entry, do not cite it.
3. **Content vs anchors**: `changedLines[path].text` holds the actual line text
   you may read, but it is CAPPED (`truncated: true` means not all text is shown).
   Ranges may extend beyond the visible text: you may cite such a line by number,
   but never describe or quote content you could not read. If a file is truncated,
   prefer evidence from lines whose text you actually saw.
4. If `change-set.json` has `empty: true`, output the empty-branch model described
   at the end of this prompt and stop.
5. Never include secret values or PII — locations only.
6. `contentOmitted` paths had their text redacted for security: do not fabricate
   their content; if relevant, flag a risk without quoting code.

## Input summary

- `headBranch` → `baseBranch` (`baseRef`, `baseSha`, `mergeBaseSha`)
- `files`: path/status/added/deleted/binary per file (binary files have no text)
- `commits`: hash/author/date/subject
- `changedLines[path]`:
  - `.ranges.added/.deleted`: COMPLETE line-number anchors `{start, count}` —
    these define every citeable changed line, uncapped even for large diffs;
  - `.text.added/.deleted`: the actual line text you can read, capped
    (`truncated: true` = only part of the text is shown);
- `sensitiveTouch[path]`: tags such as config/db/security/dependency/logging
- `topDirs`: aggregated change size per directory
- `repoContext` (optional): author-provided app/test context

## Work file-by-file

For each file, combine: its diff stats, its status, its visible changed lines, and
the commit subjects that explain it. Prefer commit subjects + added lines; treat
deleted lines as removals to call out, not code to describe at length.

## Output

Produce a COMPLETE change-model.json object (valid against the schema described in
`../schemas/change-model.schema.json`). Fill every field EXCEPT `tests`, which you
set to `{ "happyPath": [], "edgeCases": [] }` — prompt 2 fills it.

```jsonc
{
  "schemaVersion": "1",
  "head": "<change-set.headBranch>",
  "base": "<change-set.baseBranch>",
  "title": "Concise review/PR title from the change",
  "summary": {
    "headline": "One sentence: what this branch does.",
    "why": "2-4 sentences from diff + commit subjects.",
    "perFile": [ { "path": "...", "note": "why this file changed (1-2 lines)" } ]
  },
  "risks": [
    {
      "id": "R1", "category": "...", "severity": "high|medium|low",
      "title": "short risk statement",
      "rationale": "why risky + what could break",
      "evidence": [ { "path": "...", "line": 12, "deleted": false } ]
    }
  ],
  "scannedCategories": [ "categories you considered and why N/A" ],
  "tests": { "happyPath": [], "edgeCases": [] }
}
```

### Risk category vocabulary
config · db · security · dependency · logging · secrets · pii · exceptions · behavior

Severity must be one of: high | medium | low. Risk `id`s are R1, R2, …
Reference risk evidence ONLY from visible `changedLines`.

### Empty branch rule
If `change-set.empty` is true, output exactly:
```json
{ "schemaVersion": "1", "head": "...", "base": "...",
  "title": "No committed changes",
  "summary": { "headline": "No committed changes vs <base>.", "why": "…", "perFile": [] },
  "risks": [], "scannedCategories": [],
  "tests": { "happyPath": [], "edgeCases": [] } }
```

Output ONLY the JSON object — no commentary before or after.
