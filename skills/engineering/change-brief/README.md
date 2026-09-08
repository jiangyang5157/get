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

```
branch A ──┐
           ├──▶ change-brief.html     (open in a browser)
branch B ──┘
```

Artifacts land in `<repo>/.change-brief/` — add it to `.gitignore`. Hand-edit
the model JSON and re-render anytime. Only network call: `git fetch`. Nothing
is uploaded.

---

## Use cases

| What you want | Command |
|---|---|
| Review the current branch vs `main` | `node bin/run.mjs review main` |
| Review a specific branch vs `main` | `node bin/run.mjs review main --head feat/x` |
| Compare against a tag / any ref | `node bin/run.mjs review v2.0 --head feat/x` |
| Review a repo you're not inside | `node bin/run.mjs review main --head feat/x --repo /path/to/repo` |

Refs resolve locally first, then from origin; a missing one aborts with a clear
message. Requires Node ≥ 18 and git.

---

Questions, scenarios, implementation details: see `docs/DESIGN.md`.
