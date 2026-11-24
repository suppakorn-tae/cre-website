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
    // Footers such as `Refs: IO-<n>` are allowed; keep config-conventional's
    // footer rules (blank line before footer) and do not restrict footer content.
  },
};
