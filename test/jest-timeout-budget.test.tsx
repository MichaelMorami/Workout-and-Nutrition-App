/**
 * Proves the `components` project actually gets the 20 s per-test budget it needs on CI's single
 * worker (see `test/setup/native.ts`), rather than just declaring a config value nobody reads.
 *
 * It does this without spending 20 real seconds: `jest.setTimeout()` — the only place Jest 29
 * honours a per-project timeout when `projects[]` entries are inline objects, see
 * `test/jest-config-projects.test.ts` for why `testTimeout` inside the entry itself does not work
 * — writes the effective budget straight onto the global Jest reads when it starts each test's
 * clock (`jest-runtime`'s `Symbol.for('TEST_TIMEOUT_SYMBOL')`). Reading that symbol back is a
 * config assertion, not a guess: it is the literal value `jest-circus` will use.
 */
const TEST_TIMEOUT_SYMBOL = Symbol.for('TEST_TIMEOUT_SYMBOL');

test('the components project runs with the 20s CI budget, not Jest’s 5s default', () => {
  const effectiveTimeout = (globalThis as Record<symbol, unknown>)[TEST_TIMEOUT_SYMBOL];
  expect(effectiveTimeout).toBe(20000);
});
