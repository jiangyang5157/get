---
name: change-brief
description: Produce a local, visual code-review brief (summary, risks, test suggestions) comparing branch/ref A against required branch B. Both refs resolve locally first, then from origin (--offline uses local only); a missing ref aborts. A defaults to the current HEAD and can be overridden with --head (any local branch, tag, sha, or origin/x; no checkout needed). B may also be a tag or local branch; a stale local B is flagged. Use when the user asks to review/preview what a branch changes before a PR/CR, compare two branches/refs, or wants structured test ideas for a branch diff. Runs three phases (git collect → LLM model → HTML render); the CLI never calls an LLM.
disable-model-invocation: true
---

# Change Brief

A local-only, zero-dependency tool that turns a git feature-branch diff into a
curated HTML review artifact with three sections of different audiences:

1. **What changed + Risks** → for code reviewers (`file:line` evidence chips).
2. **Test suggestions** → for the author/testers, to save analysis effort.
3. **Markdown PR description** → short paste-ready text for a PR/review description.

It deliberately mimics a good reviewer, not a test-automation engine: e2e test
suggestions are behaviour-level (Given/When/Then with state + error codes) and
never invent screens/accounts/IDs — app-specific nouns stay `{PLACEHOLDER}`.

## When to use

The user wants to understand or review what one branch/ref changes against
another before opening/commenting a PR/CR, or wants a structured list of edge
cases to test for that change. The tool can run from **any** directory: the
target repo defaults to the cwd (when it is a git repo) or is given explicitly
with `--repo /path/to/repo` (required when the cwd is not a git repo).

## Workflow

The skill compares **A** (source, defaults to current HEAD) vs **B** (target,
required). Both resolve locally first, then from origin; a local branch B that
differs from `origin/<B>` is flagged as possibly stale:

```bash
# A = current branch (default), B = main — run inside the repo
node <this-skill-dir>/bin/run.mjs all main
# A = specific branch/ref (no checkout needed) — from anywhere, repo explicit
node <this-skill-dir>/bin/run.mjs all main --head feat/x --repo /path/to/repo
# artifacts outside the repo + versioned run dir (history)
node <this-skill-dir>/bin/run.mjs all main --head feat/x --repo /path/to/repo \
     --out-dir /somewhere --run-id auto
```
Artifacts go to `<out-dir>[/<run-id>]/` (default `<repo>/.change-brief`).
Diff direction is B...A (what A adds over its fork with B).

- **Phase A** is deterministic git collection (no LLM). Do it first.
- **Phase B** is the LLM step — do it in this conversation:
  1. Read `.change-brief/change-set.json` (created by Phase A; never invent
     files/lines not in it).
  2. Run `prompts/summarize.md`, then `prompts/tests.md` (same conversation);
     take the final single JSON and write it to
     `.change-brief/change-model.json`. You may hand-edit it and re-render.
- **Phase C** is deterministic:
  ```bash
  node <this-skill-dir>/bin/run.mjs render .change-brief/change-model.json \
       --change-set .change-brief/change-set.json
  ```
  Then open `.change-brief/change-brief.html`.

## Guardrails for Phase B (the LLM sections)

- Evidence must be exact `path:line` from `change-set.json` `changedLines`
  (deleted lines suffixed "(deleted)"). Never guess line numbers.
- Risk vocabulary, severities, and test levels must come from the engineering
  profile (`lib/profiles/engineering.mjs`). The CLI's `verify` command enforces
  schema + vocabulary + evidence cross-checks and will reject violations.
- e2e suggestions stay behaviour-level; placeholders `{…}` for app specifics.
- Never echo secret values/PII — locations only.
- `empty: true` in the change-set → the empty-branch model (see summarize.md).

## Notes

- Requires Node ≥ 18, git, network for `git fetch origin` (or `--offline`).
- Outputs land in `.change-brief/` (gitignore it). Everything stays local;
  the CLI never calls an LLM and never uploads.
- See README.md in this directory for the full CLI, design rationale, and the
  level × specificity contract for test suggestions.
