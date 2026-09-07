# Change Brief

Turn any git branch/ref change into a **one-page visual review brief**: what
changed, the risks a reviewer should check, and concrete test suggestions —
generated locally, no upload, no dependencies.

```
              A (source, default: current branch)  vs  B (target, e.g. main)
                    │  node ... review main --head feat/x
                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│  change-brief.html — open in a browser:                              │
│    Summary            what & why (headline + context)                │
│    What changed       per-directory churn, files expandable          │
│    Risks              severity/category + file:line evidence chips   │
│    Test               suggested happy-path & edge cases              │
└──────────────────────────────────────────────────────────────────────┘
        Summary & Risks  → for reviewers     Test → for authors/testers
```

- **Local & safe**: runs on your machine; the only network call is `git fetch`.
  No code is ever uploaded.
- **Zero setup**: Node ≥ 18, git. No `npm install`.
- **Reviewers read the brief, not 1000 lines of diff.** Evidence points to
  exact `file:line`; test ideas are behaviour-level, never invented UI steps.

---

## Quick start

```bash
# 1. Collect (git, deterministic)
node <path>/bin/run.mjs collect main --head feat/x

# 2. Model (LLM — in chat, guided by prompts/summarize.md + tests.md)
#    → produces change-model.json

# 3. Render (deterministic)
node <path>/bin/run.mjs render change-model.json --change-set change-set.json
```

**Or in one command** (collect + instructions; renders automatically if a model
already exists):

```bash
node <path>/bin/run.mjs review main --head feat/x     # 'review' = 'all'
```

Outputs go to `<repo>/.change-brief/`:
`change-set.json` · `change-model.json` · `change-brief.html`
(add `.change-brief/` to the repo's `.gitignore`).

---

## Common scenarios

| What you want | Command |
|---|---|
| Review the current branch vs `main` | `node bin/run.mjs review main` |
| Review a specific branch vs `main` | `node bin/run.mjs review main --head feat/x` |
| Compare any two refs (branch/tag/sha) | `node bin/run.mjs collect <B> --head <A>` |
| Review from outside the repo | add `--repo /path/to/repo` |
| Compare against a release tag | `node bin/run.mjs review main --head v2.0` |
| Run offline (no network) | add `--offline` |
| Ground e2e tests in real app flows | add `--context repo-context.json` |
| Only collect, then do Phase B yourself | `node bin/run.mjs collect main --head feat/x` |
| Verify a previous run | `node bin/run.mjs verify --repo <path> --run-id <name>` |

**Anything vs anything** — A is the source (default: current branch), B is the
target. Both resolve locally first, then from origin (e.g. `origin/feat/x`).
If a branch doesn't exist anywhere, you get a clear abort message.

---

## Commands

```
collect <base>          Phase A — gather git data into change-set.json
review <base>  (a.k.a. all)
                        collect + instructions for Phase B; render if model exists
render  <model>         Phase C — build the HTML brief
verify  <cs> <model>    validate model against change-set (schema + evidence)
```

Options worth knowing: `--head <A>` source branch · `--repo <path>` target repo
· `--run-id <name|auto>` separate runs into folders · `--out-dir <path>`
put artifacts elsewhere · `--offline` no fetching.

> The CLI never calls an LLM. Phase B happens in chat with the two prompts in
> `prompts/` — you can hand-edit `change-model.json` and re-render anytime.

---

## What to notice in the brief

- **Warning chips** in the header tell you when the inputs need a second look:
  `dirty working tree` (uncommitted edits excluded), `base ahead by N`
  (target has commits your branch lacks), `local base may be stale`
  (base resolved to a local branch behind/ahead of `origin/<base>`).
- **Risks carry evidence chips** (`src/calc.js:12`) — select to copy.
  Findings never quote secret values, only locations.
- **Test suggestions follow a level contract**: `unit` = concrete code-level
  cases; `e2e` = behaviour-level scenarios with `{PLACEHOLDER}`s you fill in —
  the tool never fabricates screens, accounts, or flows it can't see.
- Reviewing a **large release diff** is fine: the brief stays compact (per-file
  stats + complete line anchors), so reviewers can cite any changed line.

---

## Files

```
bin/run.mjs          CLI
lib/                 collector · renderer · validator · check-model
prompts/             Phase B prompts (summarize → tests)
schemas/             JSON schemas for the artifacts
lib/profiles/        risk/test vocabulary (engineering)
```

Maintainers: see `docs/DESIGN.md` for the internals. `node bin/run.mjs help`
lists the full CLI.
