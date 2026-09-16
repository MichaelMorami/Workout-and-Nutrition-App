/**
 * Setup for the **component** project: everything the data project has, plus React Native.
 *
 * `@testing-library/react-native` auto-cleans between tests as of v12, so there is nothing to add
 * here beyond the shared harness — but component tests get the same frozen clock, the same
 * timezone and the same matchers, so a screen test and a query test agree about what day it is.
 */
import './common';

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
