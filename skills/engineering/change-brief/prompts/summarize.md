# Phase B — Prompt 1/2: Summary + Risks (for code reviewers)

You are analyzing a git change for code review. You have ONE input: `change-set.json`.

## Hard rules (never violate)

1. READ ONLY `change-set.json`. Never invent files, commits, lines, or code that are
   not present in it.
2. Evidence must be EXACT: cite `path:line` only for lines present in
   `changedLines[path].added` (or `.deleted` — then append "(deleted)").
   Never guess a line number. If a file has no `changedLines` entry, do not cite it.
3. If `change-set.json` has `empty: true`, output the empty-branch model described
   at the end of this prompt and stop.
4. Never include secret values or PII — locations only.
5. `contentOmitted` paths had their text redacted for security: do not fabricate
   their content; if relevant, flag a risk without quoting code.

## Input summary

- `headBranch` → `baseBranch` (`baseRef`, `baseSha`, `mergeBaseSha`)
- `files`: path/status/added/deleted/binary per file (binary files have no text)
- `commits`: hash/author/date/subject
- `changedLines[path]`: actual changed lines (numbers + text), capped/truncated
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
set to `{ "focusFiles": [], "happyPath": [], "edgeCases": [] }` — prompt 2 fills it.

```jsonc
{
  "schemaVersion": "1",
  "profile": "<value of change-set.profile>",
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
  "tests": { "focusFiles": [], "happyPath": [], "edgeCases": [] },
  "crDraft": {
    "affectedSystems": ["module/area names derived from topDirs + paths"],
    "rollbackNote": "one-liner or null",
    "testEvidenceNote": "one-liner or null",
    "reviewerNotes": ["what reviewers should pay attention to"]
  }
}
```

### Risk category vocabulary (profile: engineering)
config · db · security · dependency · logging · secrets · pii · exceptions · behavior

Severity must be one of: high | medium | low. Risk `id`s are R1, R2, …
Reference risk evidence ONLY from visible `changedLines`.

### Empty branch rule
If `change-set.empty` is true, output exactly:
```json
{ "schemaVersion": "1", "profile": "...", "head": "...", "base": "...",
  "title": "No committed changes",
  "summary": { "headline": "No committed changes vs <base>.", "why": "…", "perFile": [] },
  "risks": [], "scannedCategories": [],
  "tests": { "focusFiles": [], "happyPath": [], "edgeCases": [] },
  "crDraft": null }
```

Output ONLY the JSON object — no commentary before or after.
