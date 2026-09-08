# Change Brief

Turn git changes into a **one-page visual review brief** - what changed, the risks to check, concrete test ideas. The only network call is `git fetch`, nothing is uploaded. Requires Node ≥ 18.


```text
branch A ──┐
           ├──▶ change-brief.html
branch B ──┘
```

Every request runs in three phases:

| | **Phase A** · collect | **Phase B** · model | **Phase C** · render |
|---|---|---|---|
| What it does | `collect` git diff & snapshot | LLM **analyzes** `change-set.json` | `render` HTML brief |
| Input | branch/ref A vs B | `change-set.json` | `change-model.json` |
| Output | `change-set.json` | `change-model.json` | `change-brief.html` |
| Done by | CLI (`collect`) | an LLM | CLI (`render`) |

---

## Use cases

In a bare terminal, `review` stops after Phase A — the model step needs an
LLM. `collect`, `verify`, `render` are available separately for scripts.

| You say | review runs |
|---|---|
| "Review the current branch vs `main`" | `review main` |
| "Compare `feat/x` with `main`" | `review main --head feat/x` |
| "Compare `feat/x` vs tag `v2.0`" | `review v2.0 --head feat/x` |
| "What changed in this branch?" | `review main` |
| "Give me test ideas for this change" | `review main` |
| "Review the current branch of `/path/to/repo` vs `main`" | `review main --repo /path/to/repo` |
| "Compare `feat/x` vs `main` in `/path/to/repo`" | `review main --head feat/x --repo /path/to/repo` |

---

More scenarios, implementation details: see `docs/DESIGN.md`.
