# Change Brief

Turn any git change into a **one-page visual review brief** — what changed, the
risks to check, concrete test ideas. Local, no upload, no dependencies.

The underlying command is:

```bash
node <path>/bin/run.mjs review main --head feat/x
```

It compares ref A (default: current branch) vs B, collects the diff, and hands
off to an LLM step that turns the data into a model before the final render of
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

Just tell an LLM agent what you want — it runs `review`, does the model step,
and renders the HTML:

| You say | What runs under the hood |
|---|---|
| "Review my current branch vs `main`" | `review main` |
| "Compare `feat/x` with `main`" | `review main --head feat/x` |
| "Compare `feat/x` against tag `v2.0`" | `review v2.0 --head feat/x` |
| "Review repo at `/path/to/repo`" | `review main --head feat/x --repo /path/to/repo` |
| "What changed in this branch?" | `review main` → Summary section |
| "Give me test ideas / edge cases for this change" | `review main` → Test ideas section |

Each row runs the full pipeline: `review` collects the git data (Phase A), then
the agent builds the model from the prompts (Phase B) and renders the HTML
(Phase C). No LLM is involved until you bring the request to a chat/agent — a
bare terminal `review` stops after Phase A and prints the next steps.

Under the hood, `review` = `collect` (git → change-set.json) + model step +
`render` (model → HTML). `verify` (model ↔ change-set check) and `collect` are
available separately for scripts. Refs resolve locally first, then from origin;
a missing ref aborts with a clear message. Requires Node ≥ 18 and git.

---

Questions, scenarios, implementation details: see `docs/DESIGN.md`.
