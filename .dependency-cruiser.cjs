/**
 * Encodes the ownership boundaries from CONTRIBUTING.md as build-failing rules.
 * `src/` does not exist yet (Sprint 1 creates src/db, src/sync, src/components/charts,
 * src/theme) — rules below match on path, so until those directories appear the rules
 * simply match nothing and pass cleanly.
 *
 * Run locally:   npm run boundaries
 * Run in CI:     scripts/check.sh (via the "boundaries" step) / .github/workflows/ci.yml
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'This introduces a circular dependency. Circular imports hide layering mistakes and make ' +
        'the module graph hard to reason about — extract the shared piece both sides need into ' +
        'its own module instead of importing each other.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'charts-no-sync-or-app',
      severity: 'error',
      comment:
        'src/components/charts/** (owned by charts-engineer) may not import from src/sync/** or ' +
        'app/**. Charts are a pure presentation layer — pass data in as typed props instead of ' +
        'reaching into sync state or screens.',
      from: { path: '^src/components/charts' },
      to: { path: '^(src/sync|app)' },
    },
    {
      name: 'db-no-app-components-sync',
      severity: 'error',
      comment:
        'src/db/** (owned by db-engineer) may not import from app/**, src/components/**, or ' +
        'src/sync/**. The data layer must not depend upward on UI or sync code — expose typed ' +
        'query functions and let callers import from src/db, not the other way round.',
      from: { path: '^src/db' },
      to: { path: '^(app|src/components|src/sync)' },
    },
    {
      name: 'theme-no-internal-deps',
      severity: 'error',
      comment:
        'src/theme/** (owned by design-lead) may not import from anything else in src/ or app/. ' +
        'Theme tokens must stay a dependency-free leaf so every layer can safely depend on them.',
      from: { path: '^src/theme' },
      to: { path: '^(src|app)', pathNot: '^src/theme' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: '^(node_modules|dist|coverage|\\.expo|\\.worktrees|docs/graph)',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      err: {
        // Default "err" reporter already prints each violated rule's `comment`, so a
        // failure explains what to fix, not just that something broke.
      },
    },
  },
};
