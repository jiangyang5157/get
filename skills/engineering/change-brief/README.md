# Change Brief

Turn any git change into a **one-page visual review brief** — what changed, the
risks to check, concrete test ideas. Local, no upload, no dependencies.

```bash
node <path>/bin/run.mjs review main --head feat/x
```

One command: compares ref A (default: current branch) vs B, collects the diff,
prints two chat prompts that turn it into a model, and renders
`change-brief.html` (Summary · What changed · Risks with `file:line` evidence ·
Test ideas). A or B can be any branch / tag / sha / `origin/x`.

```text
branch A ──┐
           ├──▶ change-brief.html
branch B ──┘
```

Artifacts land in `<repo>/.change-brief/` — add it to `.gitignore`. Hand-edit
the model JSON and re-render anytime. Only network call: `git fetch`. Nothing
is uploaded.

---

## Use cases

### From a terminal

| What you want | Command |
|---|---|
| Review the current branch vs `main` | `node bin/run.mjs review main` |
| Review a specific branch vs `main` | `node bin/run.mjs review main --head feat/x` |
| Compare against a tag / any ref | `node bin/run.mjs review v2.0 --head feat/x` |
| Review a repo you're not inside | `node bin/run.mjs review main --head feat/x --repo /path/to/repo` |

`review` is the full pipeline in one command. The other commands are its parts:
`collect` (git → change-set.json) · `render` (model → HTML) · `verify`
(model ↔ change-set check) — for manual or scripted control.

Refs resolve locally first, then from origin; a missing one aborts with a clear
message. Requires Node ≥ 18 and git.

### In chat (with an LLM agent)

The CLI never calls an LLM — say one of these and the agent runs `review`, does
the model step from the prompts, and renders the HTML:

| You say | The agent does |
|---|---|
| "Review my current branch vs main" | `review main` → Phase B → HTML |
| "Compare `feat/x` with `main`" | `review main --head feat/x` → Phase B → HTML |
| "What changed in this branch?" | `review main` → opens the Summary |
| "Give me test ideas / edge cases for this change" | `review` → fills the Test ideas section |

In a plain terminal, `review` stops after Phase A and prints what to do next —
Phase B (the LLM step) is yours to run from the printed prompts.

---

Questions, scenarios, implementation details: see `docs/DESIGN.md`.
