// Combined validation for change-model.json:
//  1) structural schema -> schemas/change-model.schema.json
//  2) vocabulary        -> the engineering domain vocabulary
//  3) evidence cross-check against change-set.json when provided (deterministic gate)
import { validateObject, validateModelVocab } from './validator.mjs';
import domain from './engineering.mjs';

export function checkModel(model, changeSet = null) {
  const violations = validateObject('change-model', model).violations;
  violations.push(...validateModelVocab(model, domain));
  if (violations.length === 0 && changeSet) {
    violations.push(...checkEvidence(model, changeSet));
  }
  return { ok: violations.length === 0, violations };
}

/** Evidence must point at lines that exist as changed lines in the change set.
 *  A line is "changed" when it falls inside a range in changedLines[path].ranges
 *  (ranges are COMPLETE anchors — never truncated — so evidence may cite any
 *  changed line, even beyond the capped visible text). */
export function checkEvidence(model, changeSet) {
  const out = [];
  const inRanges = (ranges, line) =>
    Array.isArray(ranges) && ranges.some((r) => line >= r.start && line <= r.start + r.count - 1);
  for (const [ri, r] of (model.risks || []).entries()) {
    for (const [ei, ev] of (r.evidence || []).entries()) {
      const file = (changeSet.files || []).find((f) => f.path === ev.path);
      if (!file) {
        out.push({ path: `risks[${ri}].evidence[${ei}].path`, msg: `"${ev.path}" is not in the change set` });
        continue;
      }
      const rec = (changeSet.changedLines || {})[ev.path];
      const ok = rec
        ? inRanges(ev.deleted ? rec.ranges?.deleted : rec.ranges?.added, ev.line)
        : false;
      if (!ok) {
        out.push({
          path: `risks[${ri}].evidence[${ei}].line`,
          msg: `${ev.path}:${ev.line}${ev.deleted ? ' (deleted)' : ''} is not a changed line in the change set`,
        });
      }
    }
  }
  return out;
}
