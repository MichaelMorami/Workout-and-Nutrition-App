/**
 * Ambient types for the test suites.
 *
 * The repo has no `@types/jest` (jest-expo does not pin one) and `tsconfig.json` does not list
 * `node` in `types`, so `describe`/`it`/`expect`/`__dirname` would otherwise be untyped in every
 * test file. Rather than change the shared `tsconfig.json` — which nobody owns — the harness
 * declares them here, from the type definitions Jest already ships.
 *
 * This file also carries the type signatures of the custom matchers in `test/matchers.ts`, so
 * `expect(row).toBeOnLocalDate('2025-03-09')` type-checks everywhere.
 */

/// <reference types="node" />

import type { Jest } from '@jest/environment';
import type { JestExpect } from '@jest/expect';
import type { Global } from '@jest/types';
import type { DailyTotal, LocalDateOptions } from './matchers';

interface VitalsMatchers<R> {
  /**
   * Asserts a row (or every row of an array) carries the given `local_date` **and** that its UTC
   * timestamp genuinely falls on that calendar day in the given timezone. Invariant #1.
   */
  toBeOnLocalDate(expected: string, options?: LocalDateOptions): R;
  /**
   * Asserts the non-tombstoned rows for one `local_date` sum to the given totals. Invariant #2 —
   * it reads the literal `kcal`/`protein` on the log rows, never the catalogue.
   */
  toHaveDailyTotal(localDate: string, expected: DailyTotal): R;
}

declare module 'expect' {
  // The body must be empty and `T` must be declared: this is declaration merging into Jest's own
  // `Matchers`, so the shape has to match Jest's signature exactly, and the members come from
  // `VitalsMatchers`.
  /* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type */
  interface Matchers<R extends void | Promise<void>, T = unknown> extends VitalsMatchers<R> {}
  /* eslint-enable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type */
}

declare global {
  const expect: JestExpect;
  const it: Global.GlobalAdditions['it'];
  const test: Global.GlobalAdditions['test'];
  const fit: Global.GlobalAdditions['fit'];
  const xit: Global.GlobalAdditions['xit'];
  const xtest: Global.GlobalAdditions['xtest'];
  const describe: Global.GlobalAdditions['describe'];
  const xdescribe: Global.GlobalAdditions['xdescribe'];
  const fdescribe: Global.GlobalAdditions['fdescribe'];
  const beforeAll: Global.GlobalAdditions['beforeAll'];
  const beforeEach: Global.GlobalAdditions['beforeEach'];
  const afterEach: Global.GlobalAdditions['afterEach'];
  const afterAll: Global.GlobalAdditions['afterAll'];
  const jest: Jest;
}

export {};
