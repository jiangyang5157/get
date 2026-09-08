# Change Brief

Turn any git change into a **one-page visual review brief** — what changed, the
risks to check, concrete test ideas. Local, no upload, no dependencies.

```text
branch A ──┐
           ├──▶ change-brief.html
branch B ──┘
```

Every brief is built in three phases:

| | **Phase A** · collect | **Phase B** · model | **Phase C** · render |
|---|---|---|---|
| What it does | reads the git diff & snapshot | an LLM reads the change-set and writes a model | builds the HTML brief |
| Input | branch/ref A vs B | `change-set.json` | `change-model.json` |
| Output | `change-set.json` | `change-model.json` | `change-brief.html` |
| LLM involved | no | **yes** (in chat) | no |
| Command | `collect` (also run by `review`) | the prompts in `prompts/` | `render` |

`review` chains all three. Run it yourself and it stops after Phase A, printing
exactly what to do next — or just ask an LLM agent (see below), which does the
Phase B step for you.

Artifacts land in `<repo>/.change-brief/` — add it to `.gitignore`. Hand-edit
the model JSON and re-render anytime. Only network call: `git fetch`. Nothing
is uploaded.

---

## Use cases

Say what you want — the agent runs Phase A, fills the model in Phase B, and
renders in Phase C:

| You say | Phase A — command | Phase B — model | Phase C — HTML |
|---|---|---|---|
| "Review my current branch vs `main`" | `review main` | summary · risks · test ideas | full brief |
| "Compare `feat/x` with `main`" | `review main --head feat/x` | summary · risks · test ideas | full brief |
| "Compare `feat/x` vs tag `v2.0`" | `review v2.0 --head feat/x` | summary · risks · test ideas | full brief |
| "Review `/path/to/repo`" | `review main --head feat/x --repo /path/to/repo` | summary · risks · test ideas | full brief |
| "What changed in this branch?" | `review main` | Summary / What changed | brief |
| "Give me test ideas for this change" | `review main` | Test ideas | brief |

In a bare terminal (no agent), `review` stops after Phase A and prints the
prompts + render command — the LLM step is yours. `verify` (model ↔ change-set
check) and `collect` are available separately for scripts.

Refs resolve locally first, then from origin; a missing ref aborts with a clear
message. Requires Node ≥ 18 and git.

---

Questions, scenarios, implementation details: see `docs/DESIGN.md`.
