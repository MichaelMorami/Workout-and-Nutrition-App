/**
 * Setup for the **component** project: everything the data project has, plus React Native.
 *
 * `@testing-library/react-native` auto-cleans between tests as of v12, so there is nothing to add
 * here beyond the shared harness — but component tests get the same frozen clock, the same
 * timezone and the same matchers, so a screen test and a query test agree about what day it is.
 */
import './common';

/**
 * Replaces `@react-native/jest-preset/jest/mocks/Modal.js` with a mock that performs the same
 * `ScrollView.Context` reset the real `Modal` does (`react-native/Libraries/Modal/Modal.js:352-360`).
 * Without this, any suite that renders a `FlatList` as a genuine descendant of a real `ScrollView`
 * with only a `Modal` between them trips the dev-mode nesting guard in
 * `@react-native/virtualized-lists/Lists/VirtualizedList.js` purely because the mock — not the
 * app, and not the device — omits that reset. See `test/setup/mocks/Modal.tsx` and issue #245.
 *
 * This has to be a `jest.mock` override here, not an edit to `node_modules`: it replaces the
 * module registration the preset's own `setupFiles` entry (`@react-native/jest-preset/jest/setup.js`)
 * makes for this exact path, and `setupFilesAfterEnv` runs after `setupFiles`, so the override wins.
 *
 * `jest.mock`'s factory is hoisted above this file's own imports (babel-plugin-jest-hoist), so it
 * cannot close over a top-level `import` of `./mocks/Modal` — only a `require` inside the factory
 * itself, resolved lazily when jest actually calls it, works here (same pattern as
 * `src/components/form/FormFrame.test.tsx`'s `reanimated-mock`).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native/Libraries/Modal/Modal', () => require('./mocks/Modal'));

/**
 * The default 5000 ms per-test budget is a laptop number. On the hosted CI runner (2 vCPUs,
 * `--coverage`, and Jest's own `maxWorkers` therefore pinned to 1) every `components` suite runs
 * strictly sequentially in one process — there is no free core for a second file to overlap into.
 * Istanbul's instrumentation and the GC sweep that follows a heavy full-screen render
 * (`app/(tabs)/index.test.tsx`, which drives a real log → undo → fade-out cycle through fake
 * timers) can burn a real, wall-clock second or more right as the *next* queued file starts
 * mounting its own tree — and Jest's timeout is wall-clock, not the frozen clock, so it fires
 * regardless of `jest.useFakeTimers()`. Locally, with 6+ idle cores, Jest overlaps files across
 * workers and this pause never lands in the same process as another suite's first render, which
 * is exactly why this was 100% green on every local run and 100% red on CI's single worker.
 * 20 s buys back that margin without hiding a genuinely hanging test — anything actually stuck
 * (an unresolved promise, a `waitFor` with nothing to wait for) still fails, just later.
 *
 * This has to be `jest.setTimeout()`, not `testTimeout` on the project entry in `jest.config.js`.
 * Jest 29 validates each `projects[]` entry against a narrower schema that does not include
 * `testTimeout` (see `test/jest-config-projects.test.ts`), and even a value that passed
 * validation would never reach the test scheduler: `groupOptions()` reads `testTimeout` off the
 * one *global* config shared by the whole run, not off any per-project config. `jest.setTimeout`
 * sidesteps all of that — it writes straight to the global the scheduler actually reads, and,
 * called from `setupFilesAfterEnv`, applies only to test files in *this* project, exactly as
 * `test/jest-timeout-default.test.ts` requires for the `data` project.
 */
jest.setTimeout(20000);
