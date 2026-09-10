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
    },
  ],

  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'test/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!test/**/*.test.{ts,tsx}',
    '!test/**/*.d.ts',
    // drizzle-kit output and jest plumbing — deleted once src/db/schema.ts exists.
    '!test/fixtures/**',
    '!test/setup/**',
  ],
  coverageReporters: ['text-summary', 'lcov'],
  coverageThreshold: {
    global: { statements: 80, branches: 70, functions: 80, lines: 80 },
  },
};
