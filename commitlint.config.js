module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'build', 'ci', 'chore', 'revert'],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'api', 'worker', 'migrate', 'engine', 'db', 'auth', 'account', 'catalogue',
        'projects', 'versions', 'assessments', 'results', 'dashboard', 'reports', 'jobs',
        'admin', 'audit', 'export', 'web', 'ui', 'i18n', 'contracts', 'deploy', 'ci', 'e2e',
        'repo',
      ],
    ],
    'scope-empty': [2, 'never'],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 72],
    // Dependabot bodies carry long release-note URLs and dependency lists
    // that cannot be wrapped, so line length is not checked in body or
    // footer. The header limit above still applies.
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    // Footers such as `Refs: IO-<n>` are allowed; keep config-conventional's
    // footer rules (blank line before footer) and do not restrict footer content.
  },
};
