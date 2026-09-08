# Change Brief

Turn any git branch/ref change into a **one-page visual review brief**: what
changed, the risks to check, and concrete test ideas — generated locally, no
upload, no dependencies.

```
       branch A ──┐
                  ├──▶ change-brief.html
       branch B ──┘

  Summary · What changed · Risks (file:line evidence) · Test ideas
```

- **Local & safe** — runs on your machine; the only network call is `git fetch`.
  Nothing is uploaded.
- **Read the brief, not the diff** — evidence is exact `file:line`.
- **Zero setup** — Node ≥ 18, git. No install.

---

## Quick start

```bash
node <path>/bin/run.mjs review main --head feat/x
```

`review` compares branch/ref A (default: current branch) against B, runs the
git collection, prints the two chat prompts that turn the data into a model,
and renders once `change-model.json` exists. Any ref works for A or B — branch,
tag, sha, `origin/x`.

Prefer to drive the phases yourself?

```bash
node <path>/bin/run.mjs collect main --head feat/x   # git → change-set.json
# …run prompts/summarize.md then prompts/tests.md to create change-model.json…
node <path>/bin/run.mjs render change-model.json --change-set change-set.json
```

Outputs land in `<repo>/.change-brief/`: `change-set.json` · `change-model.json`
· `change-brief.html` (add `.change-brief/` to `.gitignore`). Hand-edit the
model and re-render anytime.

---

## Common scenarios

| What you want | Command |
|---|---|
| Review the current branch vs `main` | `node bin/run.mjs review main` |
| Review a specific branch vs `main` | `node bin/run.mjs review main --head feat/x` |
| Compare against a tag / any ref | `node bin/run.mjs review v2.0 --head feat/x` |
| Review from outside the repo | `node bin/run.mjs review main --repo /path/to/repo` |
| Offline (no network) | add `--offline` (needs refs already local) |

A or B that doesn't exist anywhere prints a clear abort message.

---

## Files

```
bin/run.mjs      the CLI you call
lib/             collector · renderer · validation
prompts/         the two chat prompts for the model step
schemas/         JSON schemas of the artifacts
lib/profiles/    risk/test vocabulary (engineering)
```

Design rationale and internals: `docs/DESIGN.md`.
