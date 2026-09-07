// Combined validation for change-model.json:
//  1) structural schema  -> schemas/change-model.schema.json
//  2) vocabulary         -> the profile the model declares (lib/profiles/*.mjs)
//  3) evidence cross-check against change-set.json when provided (deterministic gate)
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateObject, validateModelVocab } from './validator.mjs';

const profilesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'profiles');
const profileCache = new Map();

async function loadProfile(id) {
  if (profileCache.has(id)) return profileCache.get(id);
  try {
    const mod = await import(pathToFileURL(path.join(profilesDir, `${id}.mjs`)).href);
    const profile = mod.default;
    profileCache.set(id, profile);
    return profile;
  } catch {
    profileCache.set(id, null);
    return null;
  }
}

export async function checkModel(model, changeSet = null) {
  const violations = validateObject('change-model', model).violations;
  const profile = model?.profile ? await loadProfile(model.profile) : null;
  if (model && profile == null) {
    violations.push({ path: 'profile', msg: `profile "${model.profile}" is not installed` });
  } else if (profile) {
    violations.push(...validateModelVocab(model, profile));
  }
  if (violations.length === 0 && changeSet) {
    violations.push(...checkEvidence(model, changeSet));
  }
  return { ok: violations.length === 0, violations };
}

/** Evidence must point at lines that exist as changed lines in the change set. */
export function checkEvidence(model, changeSet) {
  const out = [];
  for (const [ri, r] of (model.risks || []).entries()) {
    for (const [ei, ev] of (r.evidence || []).entries()) {
      const file = (changeSet.files || []).find((f) => f.path === ev.path);
      if (!file) {
        out.push({ path: `risks[${ri}].evidence[${ei}].path`, msg: `"${ev.path}" is not in the change set` });
        continue;
      }
      const rec = (changeSet.changedLines || {})[ev.path];
      const lines = rec ? (ev.deleted ? rec.deleted : rec.added) : [];
      if (!lines.some((l) => l.line === ev.line)) {
        out.push({
          path: `risks[${ri}].evidence[${ei}].line`,
          msg: `${ev.path}:${ev.line}${ev.deleted ? ' (deleted)' : ''} is not a changed line in the change set`,
        });
      }
    }
  }
  return out;
}
