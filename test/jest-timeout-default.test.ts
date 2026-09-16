/**
 * The `data` project needs no timeout budget beyond Jest's own default — every test here runs in
 * milliseconds (`test/harness-speed.test.ts`). The fix for issue #108 must not paper over that by
 * raising the timeout everywhere just because it is awkward to scope: this test fails if the 20s
 * `components` budget (`test/jest-timeout-budget.test.tsx`) ever leaks into this project, e.g. by
 * moving it to the root config's `testTimeout` instead of `test/setup/native.ts`.
 */
const TEST_TIMEOUT_SYMBOL = Symbol.for('TEST_TIMEOUT_SYMBOL');

test('the data project keeps Jest’s default timeout — the 20s budget is not extended here', () => {
  const override = (globalThis as Record<symbol, unknown>)[TEST_TIMEOUT_SYMBOL];
  expect(override).toBeUndefined();
});
