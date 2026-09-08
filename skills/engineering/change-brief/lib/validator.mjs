// Hand-rolled JSON-Schema-subset validator. No external deps (bank rule).
// Supports the small keyword subset used by schemas/:
//   type, properties, required, additionalProperties, items, enum, const,
//   pattern, minLength, minimum, maximum
// API:
//   validate(schema, value) -> [] | [violation...]   (violation = { path, msg })
//   validateFile(schemaPath, jsonPath)                (loads + validates)
//   loadSchema(name), validateModelVocab(model, domain)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const schemasDir = path.join(here, '..', 'schemas');

function esc(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Validate `value` against a schema object. Returns array of violations. */
export function validate(schema, value, at = '') {
  const out = [];
  const fail = (msg) => out.push({ path: at || '(root)', msg });

  if (schema == null || typeof schema !== 'object') return out;
  const { type } = schema;

  const typeOk = (v, t) => {
    if (t === 'string') return typeof v === 'string';
    if (t === 'integer') return Number.isInteger(v);
    if (t === 'number') return typeof v === 'number' && Number.isFinite(v);
    if (t === 'boolean') return typeof v === 'boolean';
    if (t === 'object') return v !== null && typeof v === 'object' && !Array.isArray(v);
    if (t === 'array') return Array.isArray(v);
    if (t === 'null') return v === null;
    return true;
  };

  if (type !== undefined) {
    const types = Array.isArray(type) ? type : [type];
    if (!types.some((t) => typeOk(value, t))) {
      fail(`expected type ${types.join('|')}, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`);
      return out; // type mismatch: nothing else meaningful to check
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    fail(`expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
    return out;
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    fail(`expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`);
    return out;
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      fail(`string shorter than minLength ${schema.minLength}`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      fail(`string does not match pattern ${schema.pattern}`);
    }
    return out;
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`above maximum ${schema.maximum}`);
    return out;
  }

  if (Array.isArray(value)) {
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        for (const v of validate(schema.items, value[i], `${at}[${i}]`)) out.push(v);
      }
    }
    return out;
  }

  if (value !== null && typeof value === 'object') {
    const props = schema.properties || {};
    const known = new Set(Object.keys(props));
    for (const key of Object.keys(value)) {
      if (!known.has(key) && schema.additionalProperties === false) {
        fail(`additional property "${key}" is not allowed`);
      }
    }
    for (const key of Object.keys(props)) {
      if (schema.required && schema.required.includes(key) && !(key in value)) {
        out.push({ path: at ? `${at}.${key}` : key, msg: 'is required' });
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in value) {
        for (const v of validate(sub, value[key], at ? `${at}.${key}` : key)) out.push(v);
      }
    }
  }
  return out;
}

export function loadSchema(name) {
  const p = path.join(schemasDir, `${name}.schema.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function validateJsonFile(schemaName, jsonPath) {
  const schema = loadSchema(schemaName);
  let raw;
  try {
    raw = fs.readFileSync(jsonPath, 'utf8');
  } catch {
    return { ok: false, violations: [{ path: '(file)', msg: `cannot read ${jsonPath}` }] };
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    return { ok: false, violations: [{ path: '(json)', msg: `invalid JSON: ${e.message}` }] };
  }
  const violations = validate(schema, value);
  return { ok: violations.length === 0, violations };
}

export function validateObject(schemaName, value) {
  const violations = validate(loadSchema(schemaName), value);
  return { ok: violations.length === 0, violations };
}

/** Validate model vocabulary (category/severity/level/verify/tags) against the domain vocabulary. */
export function validateModelVocab(model, domain) {
  const out = [];
  const allowed = (list) => new Set(list);
  const cats = allowed(domain.riskCategories);
  const sevs = allowed(domain.severities);
  const lvls = allowed(domain.testLevels);
  const verifs = allowed(domain.verifyMethods);
  const edgeCats = allowed(domain.edgeCategories);

  (model.risks || []).forEach((r, i) => {
    const at = `risks[${i}]`;
    if (!cats.has(r.category)) out.push({ path: `${at}.category`, msg: `category "${r.category}" not in domain vocabulary` });
    if (!sevs.has(r.severity)) out.push({ path: `${at}.severity`, msg: `severity "${r.severity}" not in domain vocabulary` });
  });
  const happy = model.tests?.happyPath || [];
  happy.forEach((t, i) => {
    if (!lvls.has(t.level)) out.push({ path: `tests.happyPath[${i}].level`, msg: `level "${t.level}" not in domain vocabulary` });
    if (!verifs.has(t.verify)) out.push({ path: `tests.happyPath[${i}].verify`, msg: `verify "${t.verify}" not in domain vocabulary` });
  });
  const edges = model.tests?.edgeCases || [];
  edges.forEach((e, i) => {
    if (!edgeCats.has(e.category)) out.push({ path: `tests.edgeCases[${i}].category`, msg: `category "${e.category}" not in domain vocabulary` });
    if (!sevs.has(e.severity)) out.push({ path: `tests.edgeCases[${i}].severity`, msg: `severity "${e.severity}" not in domain vocabulary` });
    if (!lvls.has(e.level)) out.push({ path: `tests.edgeCases[${i}].level`, msg: `level "${e.level}" not in domain vocabulary` });
    if (!verifs.has(e.verify)) out.push({ path: `tests.edgeCases[${i}].verify`, msg: `verify "${e.verify}" not in domain vocabulary` });
  });
  return out;
}
