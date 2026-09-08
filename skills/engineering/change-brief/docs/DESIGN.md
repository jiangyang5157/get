# Design notes (for maintainers — not for end users)

Everything here is *why/how* the tool works. Users only need the README.

## Three phases & JSON contracts

- Phase A `collect` (deterministic git) → `change-set.json`
- Phase B (LLM/chat, NOT the CLI) → `change-model.json` — run prompts
  `prompts/summarize.md` then `prompts/tests.md` in one conversation
- Phase C `render` (deterministic) → `change-brief.html` (default next to the
  model file; `--change-set` adds the diff rows and cross-checks evidence)

Separation exists so a human/agent can edit `change-model.json` between B and C
and re-render. The CLI never calls an LLM.

## changedLines: ranges (complete anchors) + text (capped content)

`changedLines[path]` in change-set.json:

- `.ranges.added/.deleted` — COMPLETE line-number anchors as merged runs
  `{start, count}`; never truncated, so even a 10k-line rewrite keeps every
  changed line citeable, and range lists stay tiny (merged runs → small JSON).
- `.text.added/.deleted` — the actual line text the LLM may read; capped per
  file (added 400 / deleted 200) and per run (6000 lines total);
  `truncated: true` when capped.
- Evidence validation (`verify`, `render --change-set`) checks `.ranges`
  (complete), so reviewers can cite any real changed line. The prompts forbid
  describing content the model could not read — the model cannot invent
  `file:line` outside the ranges.

## Evidence gate & anti-hallucination

`render --change-set` and `verify` reject models whose risk evidence does not
point at a real changed line (checked against `ranges`). Vocabulary
(category/severity/level/verify) is validated at runtime against the declared
domain vocabulary (`lib/engineering.mjs`). JSON schemas validate structure only.

## Test-ideas contract (level × specificity)

- `unit` → code-level & concrete (real function, real inputs);
- `integration` → module-level behavior;
- `e2e` → behaviour-level only: Given/When/Then with state and error codes.
  The model never invents screens/menus/IDs/accounts; unknown app-specific
  nouns are `{PLACEHOLDER}` for the author to fill. With `--context`, real flows
  from `repoContext` may be referenced, nothing beyond it may be invented.

## Ref resolution & staleness

Both A and B resolve **locally first, then origin** (local branch / tag / sha /
`origin/x` as-is; absent locally → fetched; absent everywhere → abort
`Branch "<ref>" does not exist on origin.`, exit 1). Diff direction is
`B...A` — what A adds over its fork with B.

When B resolves to a local branch that differs from `origin/<B>` (behind /
ahead / diverged), `baseLocalNote` is set: printed on stderr and surfaced as a
"local base may be stale" chip in the HTML. Renames use git's own detection
(`-M`); renamed files appear once with the final path and status `R`.

## Sensitive files & git quirks

Filenames matching `.env` / `*.pem` / credential-style patterns have their text
blanked in `change-set.json` (`contentOmitted`); artifacts never contain values
— locations only. Handled: `core.quotepath=false` + quoted-path unquoting
(non-ASCII/space paths round-trip), detached-HEAD detection. Limitation:
filenames containing TAB/newline bytes may not parse correctly. Uncommitted
changes are never part of a brief (committed refs only); a dirty tree when
A is the working HEAD is flagged (`workingTreeDirty`, `dirtyCount`, stderr note
+ HTML chip). A ≠ HEAD skips the dirty check (edits are irrelevant to that A).

## CLI surface reference

```
collect <base> [--head <A>] [--repo <p>] [--out-dir <p>] [--run-id <n|auto>] [--context f.json]
render  <change-model.json> [--change-set <f>] [--out-dir <p>]
verify  <change-set.json> <change-model.json> | verify [--repo <p>] [--run-id <n|auto>]
review  <base>  (same flags as collect)
```

`review` is the everyday one-shot: it runs `collect` (Phase A) and prints the
two prompts plus the render command for Phase B — then, if a
`change-model.json` already exists next to the change-set, it validates and
renders it immediately (Phase C). Manual flow below shows the same steps by
hand.

Path model: `--repo` = target git repo (default cwd, required if not a repo);
`--out-dir` = artifact root (default `<repo>/.change-brief`); `--run-id`
subfolder for run history, `auto` = `<A8>_<B8>_<ts>` (timestamp keeps re-runs
distinct). Exit codes: 0 success · 1 abort/validation · 2 usage.

What `review` does under the hood (also available as separate steps):

```bash
node bin/run.mjs collect main --head feat/x   # git → change-set.json
# run prompts/summarize.md then prompts/tests.md → change-model.json
node bin/run.mjs render change-model.json --change-set change-set.json
```

## File layout

```
bin/run.mjs            CLI (collect · render · verify · review)
lib/                   collector · renderer · validator · check-model
lib/engineering.mjs     domain vocabulary & tag rules
prompts/               the two chat prompts for the model step
schemas/               JSON schemas of the artifacts
docs/DESIGN.md         this file
```

## Non-goals

PR/ticket enrichment, CI/PR posting, aggregation across branches, token/cost
tracking, an in-CLI LLM client — all out of scope by design.
