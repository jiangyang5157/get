---
name: change-brief
description: Produce a local, visual code-review brief (summary, risks, test ideas) comparing branch/ref A against required branch B. Both refs resolve locally first, then from origin (--offline uses local only); a missing ref aborts. A defaults to the current HEAD and can be overridden with --head (any local branch, tag, sha, or origin/x; no checkout needed). B may also be a tag or local branch; a stale local B is flagged. Use when the user asks to review/preview what a branch changes before a PR/CR, compare two branches/refs, or wants structured test ideas for a branch diff. Runs three phases (git collect → LLM model → HTML render); the CLI never calls an LLM.
disable-model-invocation: true
---

# Change Brief

Local-only, zero-dependency tool that turns any git branch/ref change into a
curated HTML review brief. The HTML artifact has four sections:

1. **Summary** — what the change does and why.
2. **What changed** — per-directory churn rows (status mix + line counts),
   individual files expandable with the reason each file changed.
3. **Risks** — for reviewers, each with severity/category and copyable
   `file:line` evidence chips.
4. **Test ideas** — suggested happy-path and edge cases for authors/testers.

It mimics a good reviewer, not a test-automation engine: e2e suggestions are
behaviour-level (Given/When/Then) and never invent screens/accounts/IDs —
app-specific nouns stay `{PLACEHOLDER}` for the author to fill.

## When to use

The user wants to understand/review what one branch/ref changes against another
before opening or commenting on a PR/CR, compare two branches/refs, or get
structured edge-case ideas for a change. Works from any directory: the target
repo defaults to the cwd (when it is a git repo) or is passed explicitly with
`--repo /path/to/repo`.

## Workflow

Compare **A** (source, defaults to current HEAD) vs **B** (target, required).
Both resolve locally first, then from origin. Diff direction is `B...A`.

```bash
# A = current branch (default), B = main
node <this-skill-dir>/bin/run.mjs review main
# A = specific branch/ref from anywhere (no checkout needed)
node <this-skill-dir>/bin/run.mjs review main --head feat/x --repo /path/to/repo
# keep artifacts outside the repo and version each run
node <this-skill-dir>/bin/run.mjs review main --head feat/x --repo /path/to/repo \
     --out-dir /somewhere --run-id auto
```
`review` runs Phase A, prints Phase B instructions, and renders automatically
if a model already exists. Artifacts land in
`<out-dir>[/<run-id>]/` (default `<repo>/.change-brief/`):
`change-set.json`, `change-model.json`, `change-brief.html`.

- **Phase A** (deterministic, no LLM): run `review`/`collect`, then read the
  printed `change-set.json`.
- **Phase B** (LLM — do it in THIS conversation): read that `change-set.json`;
  run `prompts/summarize.md`, then `prompts/tests.md` (same conversation);
  write the single final JSON to the `change-model.json` path that `review`
  printed (default `.change-brief/change-model.json`). You may hand-edit it and
  re-render.
- **Phase C** (deterministic): `render <model> --change-set <change-set>`
  (the printed command is copy-paste ready), then open the HTML.

## Guardrails for Phase B

- Evidence must be exact `path:line` covered by
  `change-set.json` → `changedLines[path].ranges` (deleted lines cite
  `.ranges.deleted` and are suffixed "(deleted)"). Never guess line numbers.
- **Content vs anchors**: only describe code whose text you actually read in
  `changedLines[path].text`. `text` may be truncated (`truncated: true`) —
  ranges stay complete so a line may be citeable but not readable; do not
  fabricate its content.
- Vocabulary (risk category / severity / level / verify) must come from the
  declared profile (`lib/profiles/engineering.mjs`). The CLI `verify` command
  enforces schema + vocabulary + evidence; violations are rejected.
- e2e suggestions stay behaviour-level with `{PLACEHOLDER}` for app specifics.
- Never echo secret values or PII — locations only.
- `change-set.empty: true` → output the empty-branch model (see
  `prompts/summarize.md`).

## Notes

- Requires Node ≥ 18, git; network only for `git fetch origin` (or `--offline`).
- Everything stays local; the CLI never calls an LLM and never uploads.
- Add `.change-brief/` to `.gitignore` when artifacts live inside the repo.
- Full CLI and the level × specificity test contract: see README.md.
