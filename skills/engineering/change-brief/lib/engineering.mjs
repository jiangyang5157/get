// Engineering domain vocabulary + tag rules (risk/test words, sensitive-touch
// path heuristics). Single domain — kept as one plain module, imported by the
// collector and the model checker.
export default {
  riskCategories: [
    'config', 'db', 'security', 'dependency', 'logging',
    'secrets', 'pii', 'exceptions', 'behavior',
  ],
  severities: ['high', 'medium', 'low'],
  testLevels: ['unit', 'integration', 'e2e'],
  verifyMethods: ['run', 'read', 'probe', 'golden'],
  edgeCategories: [
    'authorization', 'concurrency', 'precision', 'timezone', 'boundary',
    'nullEmpty', 'idempotency', 'rollback', 'security', 'dependency', 'volume',
  ],
  // Path-match heuristics for sensitive-touch tagging (regex source strings,
  // matched against the changed path with /i).
  tagRules: {
    config: [
      '\\.config\\.[^.]+$', 'application[^/]*\\.(yml|yaml|properties)$',
      'application\\.(yml|yaml|properties)$', '^pom\\.xml$',
      '^build\\.gradle', '^package\\.json$', '\\.tf$', 'Dockerfile', 'helm',
    ],
    db: ['(^|/)(migration|schema|flyway|liquibase)(/|$)', '\\.sql$'],
    security: [
      '(^|/)(auth|security|permission|role|crypto|token)(/|$)', '\\.env', '\\.pem',
      'secret', 'credential',
    ],
    dependency: [
      '^package-lock\\.json$', '^yarn\\.lock$', '^poetry\\.lock$', '^go\\.sum$',
      '^pom\\.xml$', '^build\\.gradle', '^requirements.*\\.txt$',
    ],
    logging: ['(^|/)(log|logs)(/|$)', '\\.log$'],
  },
};
