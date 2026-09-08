---
name: change-brief
description: Produce a local, visual code-review brief (summary, risks, test ideas) comparing branch/ref A against required branch B. Both refs resolve locally first, then from origin; a missing ref aborts. A defaults to the current HEAD and can be overridden with --head (any local branch, tag, sha, or origin/x; no checkout needed). B may also be a tag or local branch; a stale local B is flagged. Use when the user asks to review/preview what a branch changes before a PR/CR, compare two branches/refs, or wants structured test ideas for a branch diff. Runs three phases (git collect → LLM model → HTML render); the CLI never calls an LLM.
disable-model-invocation: true
---

# Change Brief

Produces an HTML review brief (Summary · What changed · Risks with `file:line`
evidence · Test ideas) for any git branch/ref change. Three phases: git
collection, an LLM model step, a deterministic render. The CLI never calls an
LLM.

## When to use

The user wants to understand/review what one branch/ref changes against another
before a PR/CR, compare two branches/refs, or get test/edge-case ideas for a
change. Runs from any directory (`--repo <path>` when not inside the target).

## Workflow

Compare **A** (source, defaults to current HEAD) vs **B** (target, required).
Both resolve locally first, then from origin. Diff direction is `B...A`.

```bash
# B (the target, after `review`) is required and can be any ref — main is just
# the common example; use a branch, tag, or sha there as needed.
# A = current branch (default), B = main
node <this-skill-dir>/bin/run.mjs review main
# A = a specific ref, B = main, repo explicit — no checkout needed
node <this-skill-dir>/bin/run.mjs review main --head feat/x --repo /path/to/repo
# e.g. B = a tag, A = a branch
node <this-skill-dir>/bin/run.mjs review v2.0 --head feat/x
```
`review` runs Phase A, prints the Phase B instructions, and renders if a model
already exists. Artifacts: `change-set.json` · `change-model.json` ·
`change-brief.html` in `<out-dir>[/<run-id>]/` (default `<repo>/.change-brief/`).

**Locating the files**: when you run `review`/`collect` yourself you cannot see
its terminal output — find the artifacts on disk instead. Default location is
`<repo>/.change-brief/`; with `--run-id` they move to
`<repo>/.change-brief/<run-id>/`; with `--repo` use that path as `<repo>`.
If unsure, run `ls` under `.change-brief/` to confirm the actual files.

1. **Phase A** — deterministic, no LLM. Run `review`/`collect`, then read the
   produced `change-set.json` (locate it as above).
2. **Phase B** — the LLM step, done in this same session: read that
   `change-set.json`; run `prompts/summarize.md`, then `prompts/tests.md`;
   write the single final JSON as `change-model.json` next to the change-set.
   Hand-edits allowed; re-render afterwards.
3. **Phase C** — deterministic. Run
   `render <change-model.json> --change-set <change-set.json>`, then open the
   produced HTML.

## Limits

- Compares **committed** content only — uncommitted working-tree edits are
  never part of the brief (a dirty tree is flagged when A is the checked-out
  HEAD). If the user asks to review uncommitted work, say so and suggest
  committing or stashing first.
- Not a full-repo analysis: only the A-vs-B change is examined.
- B (and A when given) must resolve locally or on origin; if a ref does not
  exist anywhere the run aborts with a clear message.

## Guardrails for Phase B

Work from the actual `change-set.json` you located above — never invent
files/lines that are not in it.

- Evidence must be exact `path:line` covered by
  `change-set.json` → `changedLines[path].ranges` (deleted lines cite
  `.ranges.deleted` and are suffixed "(deleted)"). Never guess line numbers.
- **Content vs anchors**: only describe code whose text you actually read in
  `changedLines[path].text`. `text` may be truncated (`truncated: true`) —
  ranges stay complete so a line may be citeable but not readable; do not
  fabricate its content.
- Vocabulary (risk category / severity / level / verify) must come from the
  domain vocabulary (`lib/engineering.mjs`). The CLI `verify` command
  enforces schema + vocabulary + evidence; violations are rejected.
- e2e suggestions stay behaviour-level with `{PLACEHOLDER}` for app specifics.
- Never echo secret values or PII — locations only.
- `change-set.empty: true` → output the empty-branch model (see
  `prompts/summarize.md`).
