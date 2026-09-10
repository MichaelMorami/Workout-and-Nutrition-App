/**
 * Shared per-suite setup: frozen clock, fixed timezone, registered matchers, reset factories, and
 * a guarantee that no test leaks an open database.
 *
 * Both Jest projects load this. Nothing here is optional — a test that opts out of frozen time
 * opts out of being reproducible.
 *
 * The timezone is *forced*, not inherited. A suite that runs in `America/Los_Angeles` on a laptop
 * and `UTC` in CI is not one suite, and the `local_date` invariant is precisely the thing that
 * would differ. Set `VITALS_TEST_TZ` to relocate the whole suite deliberately.
 */
import { closeAllTestDbs } from '../db';
import { resetFactories } from '../factories';
import '../matchers';
import { DEFAULT_TEST_TZ, freezeTime, unfreezeTime } from '../time';

const originalTz = process.env.TZ;

beforeAll(() => {
  // Set before any test constructs a Date, so `local_date` defaults are the user's day, not UTC's.
  process.env.TZ = process.env.VITALS_TEST_TZ ?? DEFAULT_TEST_TZ;
});

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

beforeEach(() => {
  freezeTime();
  resetFactories();
});

afterEach(() => {
  closeAllTestDbs();
  unfreezeTime();
});
