/**
 * Two suites, two runtimes, one command.
 *
 *   data       plain Node + better-sqlite3. The Drizzle `sqlite-core` schema and the migrations are
 *              the same ones the phone runs, so these tests prove real behaviour — and they cost
 *              microseconds, which is the only reason TDD actually happens here.
 *   components jest-expo's native preset + React Native Testing Library, for anything that renders.
 *
 *   npx jest                            both
 *   npx jest --selectProjects data      just the fast one — what you want in a red-green loop
 *   npx jest --selectProjects components
 *
 * Owner: qa-engineer.
 */

/**
 * The repo has no `babel.config.js` (Expo does not need one — Metro falls back to
 * `babel-preset-expo` internally), but `jest-expo`'s platform presets pass only a `caller` to
 * `babel-jest` and rely on the project supplying the preset itself. Without this, every `import`
 * in every test file is a `SyntaxError`. Supplying it here rather than adding a root
 * `babel.config.js` keeps the fix inside the file this agent owns.
 */
const babelTransform = (caller) => [
  'babel-jest',
  { presets: [require.resolve('expo/internal/babel-preset')], babelrc: false, configFile: false, caller },
];

/**
 * Agent worktrees live at `<repo>/.worktrees/<branch>/` — inside `rootDir`. Without this, jest walks
 * into every other branch's checkout and runs its in-progress tests, so the local gate fails on
 * `main` with someone else's red suite and blames the wrong person. CI never sees it (a fresh clone
 * has no `.worktrees/`), which is exactly what makes it expensive to diagnose.
 *
 * `modulePathIgnorePatterns` matters as much as `testPathIgnorePatterns`: without it, haste finds
 * duplicate copies of every module and the resolver picks between branches at random.
 *
 * The `<rootDir>/` anchor is load-bearing and the reason this is not simply `/\.worktrees/`. These
 * patterns are matched against **absolute** paths, and an agent's own checkout *is*
 * `<repo>/.worktrees/<branch>/` — so the unanchored form matches every file the agent is working
 * on and jest reports "No tests found" for their entire suite. Anchoring means "a `.worktrees`
 * directory belonging to *this* checkout", which is nested worktrees only: correct from the main
 * checkout, and a no-op from inside a worktree, where no such directory exists.
 *
 * `.dependency-cruiser.cjs` already excludes `.worktrees`; this brings jest in line.
 */
const ignoreWorktrees = {
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/\\.worktrees/'],
  modulePathIgnorePatterns: ['<rootDir>/\\.worktrees/'],
};

/** Tests that must not touch React Native: the data layer, sync, and the harness itself. */
const dataTestMatch = [
  '<rootDir>/test/**/*.test.ts',
  '<rootDir>/src/db/**/*.test.ts',
  '<rootDir>/src/sync/**/*.test.ts',
  '<rootDir>/src/lib/**/*.test.ts',
];

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      ...ignoreWorktrees,
      displayName: { name: 'data', color: 'cyan' },
      preset: 'jest-expo/node',
      testEnvironment: 'node',
      testMatch: dataTestMatch,
      setupFilesAfterEnv: ['<rootDir>/test/setup/node.ts'],
      transform: {
        '\\.[jt]sx?$': babelTransform({ name: 'metro', bundler: 'metro', platform: 'web', isServer: true }),
      },
      clearMocks: true,
      restoreMocks: true,
    },
    {
      ...ignoreWorktrees,
      displayName: { name: 'components', color: 'magenta' },
      preset: 'jest-expo/ios',
      // `test/**/*.test.tsx` is the harness's own smoke test for this project — it is what proves
      // the native preset, the frozen clock and the custom matchers work here too, before any
      // screen exists to test.
      testMatch: [
        '<rootDir>/app/**/*.test.tsx',
        '<rootDir>/src/**/*.test.tsx',
        '<rootDir>/test/**/*.test.tsx',
      ],
      setupFilesAfterEnv: ['<rootDir>/test/setup/native.ts'],
      transform: {
        '\\.[jt]sx?$': babelTransform({ name: 'metro', bundler: 'metro', platform: 'ios' }),
      },
      clearMocks: true,
      restoreMocks: true,
      /**
       * The default 5000 ms per-test budget is a laptop number. On the hosted CI runner (2 vCPUs,
       * `--coverage`, and Jest's own `maxWorkers` therefore pinned to 1) every `components` suite
       * runs strictly sequentially in one process — there is no free core for a second file to
       * overlap into. Istanbul's instrumentation and the GC sweep that follows a heavy full-screen
       * render (`app/(tabs)/index.test.tsx`, which now drives a real log → undo → fade-out cycle
       * through fake timers) can burn a real, wall-clock second or more right as the *next* queued
       * file starts mounting its own tree — and Jest's timeout is wall-clock, not the frozen clock,
       * so it fires regardless of `jest.useFakeTimers()`. Locally, with 6+ idle cores, Jest overlaps
       * files across workers and this pause never lands in the same process as another suite's
       * first render, which is exactly why this was 100% green on every local run (single test,
       * full suite, `--coverage`, `--coverage --runInBand`) and 100% red on CI's single worker.
       * 20 s buys back that margin without hiding a genuinely hanging test — anything actually stuck
       * (an unresolved promise, a `waitFor` with nothing to wait for) still fails, just later.
       */
      testTimeout: 20000,
    },
  ],

  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'test/**/*.{ts,tsx}',
    // Other agents' in-progress branches are not this checkout's source. See `ignoreWorktrees`.
    '!.worktrees/**',
    '!src/**/*.d.ts',
    '!test/**/*.d.ts',
    // Test files themselves are never "covered" by another file — collecting them just dilutes the
    // number with 0%s that mean nothing. `src/db/**/*.test.ts` needs the same exclusion `test/**`
    // always had, now that db-engineer's tests live there too.
    '!**/*.test.{ts,tsx}',
    // jest plumbing — no coverage signal of its own.
    '!test/setup/**',
  ],
  coverageReporters: ['text-summary', 'lcov'],
  coverageThreshold: {
    global: { statements: 80, branches: 70, functions: 80, lines: 80 },
  },
};
