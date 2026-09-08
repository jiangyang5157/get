# Phase B — Prompt 2/2: Test ideas (for the author and testers)

Continue the SAME conversation as Prompt 1. The change-model.json you produced is
the current draft. Your job now: fill its `tests` section. Do NOT change any other
field (`summary`, `risks`, `title`, `head`, `base`, `schemaVersion`).

## Input

- The change-model.json draft from Prompt 1.
- `change-set.json` (the same one): `files`, `changedLines`, `sensitiveTouch`,
  `repoContext` (optional), commit subjects.

## Hard rules

1. Never invent files, functions, screens, menus, element ids, test accounts, or
   frameworks that are not in the inputs.
2. Evidence line numbers must come from `changedLines` as in Prompt 1.
3. No secret values or PII — locations only.
4. If `change-set.empty` is true, keep `tests` as the empty arrays already set.

## Level × specificity contract (critical)

Each suggested test declares a `level` and a `verify` method:

| level | how concrete you may be |
|---|---|
| `unit` | CODE-level: name the real function/symbol visible in `changedLines`, give real input values and expected output. Fully concrete. |
| `integration` | MODULE-level: describe the layer/behavior changed; test-environment setup details can be left to the author. |
| `e2e` | BEHAVIOUR-level only: describe Given/When/Then in terms of state, roles, and error codes. NEVER invent screens/menus/IDs/accounts. Put unknown app-specific nouns in `{PLACEHOLDERS}`. |

`verify` ∈ { `run`, `read`, `probe`, `golden` }:
- `run` — executed by a test runner (unit/integration).
- `probe` — executed by the author/tester against the running app (behaviour e2e).
- `read` — verified by reading code/docs (e.g. a migration check).
- `golden` — byte-compare snapshot/regression.

When `repoContext` exists you MAY reference its real `affectedFlows`,
`relatedTestFiles`, `testFramework`, `testCommand`, and `authInTests` — but still
never invent beyond what it states.

## Edge-case categories to consider (only include plausible ones)

authorization · concurrency · precision · timezone · boundary · nullEmpty ·
idempotency · rollback · security · dependency · volume

Do NOT force all categories — only ones the change plausibly touches. Each edge
case gets: concrete `scenario`, `whyConcern` (what could break), `assertion`
(the check a test should make), `level`, `verify`, and `focusFile` when clear.

Happy-path cases derive from the change's intent — what the new code is supposed
to do in normal use.

## Output

Return the COMPLETE updated change-model.json (same object as before, but with
`tests` filled):

```jsonc
"tests": {
  "happyPath": [
    { "id": "H1", "scenario": "...", "input": "...", "expected": "...",
      "level": "unit|integration|e2e", "verify": "run|read|probe|golden" }
  ],
  "edgeCases": [
    { "id": "E1", "category": "...", "severity": "high|medium|low",
      "scenario": "...", "whyConcern": "...", "assertion": "...",
      "level": "unit|integration|e2e", "verify": "...", "focusFile": "path | null" }
  ]
}
```

Examples:
- unit / run: `applyTax(amount, rate)` from `src/calc.js` — input `applyTax(100, 0.1)`
  → expected exact rounding; plus boundary input `applyTax(0, 0)`, huge amount.
- e2e / probe (repoContext absent): "Given a signed-in user with an expired saved
  card; When the user proceeds through {checkout flow} using that card; Then the
  payment is rejected with code E-42 and no order is created."
- e2e / probe (repoContext present): reference `authInTests` (e.g. mock server)
  and the real flow name from `affectedFlows`.

Output ONLY the JSON object — no commentary before or after.
