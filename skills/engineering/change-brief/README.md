# Change Brief

Local-only, zero-dependency git change brief: **feature branch diff → change model →
curated HTML review artifact** in three separable phases. Built for enterprise/bank
use: no upload, no API keys, no external npm dependencies, no build step — plain
Node.js ≥ 18.

```
Phase A (git, deterministic)      Phase B (LLM / chat)         Phase C (deterministic)
HEAD + base ──▶ change-set.json ──▶ change-model.json ──▶ change-brief.html
```

- Sections of the artifact about **summary & risks** are for **code reviewers**.
- The **test-suggestion** section is for the **author and testers** (saves them
  analysis effort — the tool mimics a good reviewer, not a test-automation engine).

## Requirements

- git (any recent version) and Node.js ≥ 18. No `npm install` needed.

## Quick start

Inside a git repo, with the feature branch you want to review checked out:

```bash
# 1. Phase A — deterministic collection (fetches origin/<base>)
node <path>/change-brief/bin/run.mjs collect main

# 2. Phase B — LLM step, done in chat (NOT by this CLI):
#    open .change-brief/change-set.json and run the two prompts in one
#    conversation: prompts/summarize.md then prompts/tests.md.
#    Save the single JSON output as .change-brief/change-model.json
#    (you may hand-edit it between B and C and re-render).

# 3. Phase C — deterministic render
node <path>/change-brief/bin/run.mjs render .change-brief/change-model.json \
     --change-set .change-brief/change-set.json

# one-command helper (collects, then prints Phase B instructions; renders if a
# valid --model already exists)
node <path>/change-brief/bin/run.mjs all main
```

All three files land in `.change-brief/` (add it to your repo's `.gitignore`):
`change-set.json` (process data), `change-model.json`, `change-brief.html`.

## CLI surface

```
node bin/run.mjs collect <base> [--out change-set.json] [--offline] [--context repo-context.json]
node bin/run.mjs render  <change-model.json> [--out change-brief.html] [--change-set change-set.json]
node bin/run.mjs verify  <change-set.json> <change-model.json>
node bin/run.mjs all     <base> [--model change-model.json] [--out change-brief.html] [--offline] [--context repo-context.json]
node bin/run.mjs selftest [--update-golden]
```

Exit codes: `0` success · `1` abort/validation failure · `2` usage error.

- `--offline`: skip fetching; use the local `origin/<base>` remote-tracking ref.
- `--context repo-context.json`: author-supplied app context that lets the LLM
  write more concrete e2e suggestions (see schema `schemas/repo-context.schema.json`).
- `--change-set`: pass the change-set so the render includes the deterministic
  per-directory file summary rows (status mix + line counts, files expandable) and
  cross-checks risk evidence line numbers.
- `selftest`: validates fixtures/schemas, rejects negative fixtures, and compares
  the render against the stored golden `fixtures/change-brief.sample.html`
  byte-for-byte. Use `selftest --update-golden` only for intentional renderer
  changes (then review the diff!).

## Design notes & deliberate deviations from a naive reading

- **Phases are separated by JSON contracts so a human or agent can edit
  `change-model.json` between B and C and re-render.** The CLI never calls an LLM.
- **`changedLines` is the single source for both content and evidence anchors.**
  Text is capped (per-file/per-run) and marked `truncated`; evidence validation
  only accepts lines that actually exist there, so the model cannot invent
  `file:line`.
- **Renames**: git's own rename detection (`-M`) drives both stats and status.
  Renamed files appear once with the final path and status `R`.
- **Evidence gate**: `render --change-set` and `verify` reject models whose risk
  evidence does not point at a real changed line. This is the deterministic
  anti-hallucination guard.
- **Vocabulary is double-checked**: JSON schemas validate structure only;
  category/level/verify words are validated at runtime against the declared
  profile (`lib/profiles/engineering.mjs`, itself validated by
  `schemas/profile.schema.json`). This keeps the door open for non-engineering
  profiles without a schema bump.
- **Level × specificity contract for test suggestions** (important):
  - `unit` → code-level and concrete (real function, real inputs);
  - `integration` → module-level behavior;
  - `e2e` → **behaviour-level only**: Given/When/Then with state and error codes.
    The model never invents screens/menus/IDs/accounts; unknown app-specific
    nouns are marked `{PLACEHOLDER}` for the author to fill.
  With `--context`, real flows from `repoContext` may be referenced but nothing
  beyond it may be invented.
- **Secrets**: filenames matching `.env`/`*.pem`/`credential`-style patterns have
  their line text blanked in `change-set.json` (`contentOmitted`); artifacts
  never contain values — locations only.
- **Git quirks handled**: `core.quotepath=false` + quoted-path unquoting so
  non-ASCII/space paths round-trip; detached-HEAD detection; `-z`-style parsing
  notes (see below); dirty-working-tree flag instead of silence.

## Known limitations

- Filenames containing TAB/newline bytes may not parse correctly (documented;
  enterprise code rarely has them). Non-ASCII and spaces are supported.
- `render` without `--change-set` omits the deterministic diff chart / file
  stats (those data live in the change-set, not the model).
- The quality ceiling of sections depends on the LLM used for Phase B; the
  deterministic gates stop *wrong* output, not *mediocre* output.

## Security & compliance (bank)

- Local-only: no network except `git fetch origin`. No upload, no keys, no deps.
- Working tree is never modified except remote-tracking refs via fetch; outputs
  are written only to the paths shown (`--out` or `.change-brief/`).
- Artifacts never echo secret values or PII — red-line findings point to
  `path:line` only.

## Smoke test (manual)

In a throwaway repo: `main` with `src/calc.js`; branch `feat/tax` adding
`applyTax(amount, rate)` with a rounding bug and a log line printing the raw
amount; commit and push; then run `collect main`, hand-write
`change-model.json` per the schema (include one high `precision` edge case and
one `pii/logging` medium risk with real line numbers), `render`, and confirm the
HTML shows the rounding test and the logging risk with correct
`src/calc.js:NN` evidence.

## Uncommitted working-tree changes

`collect` compares **committed** `HEAD` vs `origin/<base>` only — uncommitted
local edits are never part of the brief. If the working tree is dirty, the run
still succeeds (exit 0) but:

- `change-set.json` records `workingTreeDirty: true` + `dirtyCount`,
- the CLI prints a stderr note
  (`Note: N uncommitted changes are not included — commit or stash first.`),
- the HTML header shows a "dirty working tree" chip.

The tool's own output directory (`.change-brief/`) is excluded from that count.
Commit (or stash) before collecting if you want the brief to reflect your latest
work.

## Non-goals / later

PR/ticket enrichment, CI/PR posting, aggregation across branches, token/cost
tracking, watching uncommitted working-tree changes, and an in-CLI LLM client
are all out of scope. Phase B is performed by the LLM/chat, not the CLI.
