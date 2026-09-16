/**
 * Regression guard for issue #108.
 *
 * Jest 29 validates each entry of `projects[]` against a *narrower* schema than the root config —
 * `testTimeout` is not in it (see `jest-config`'s `initialProjectOptions`, which the per-project
 * `normalize()` call validates against). Setting `testTimeout` inside a project entry does not
 * error; Jest logs an "Unknown option" warning and silently drops it. Worse, `groupOptions()` (in
 * `jest-config/build/index.js`) only reads `testTimeout` off the *global* config, and the global
 * config used for a run is the one produced from the **root** `jest.config.js`, before its
 * `projects` array is expanded — so even the per-project object's own normalized `testTimeout`
 * never reaches the test scheduler. There is no supported way to give one project in `projects[]`
 * its own `testTimeout`; the real fix lives in `test/setup/native.ts` via `jest.setTimeout()`.
 *
 * This test does not run Jest end-to-end (that would cost the very seconds this harness is built
 * to avoid) — it inspects the actual config object Jest will load, so it fails the instant anyone
 * reintroduces `testTimeout` inside a `projects[]` entry, which would silently do nothing.
 */
import config from '../jest.config';

describe('jest.config.js', () => {
  it('declares no `testTimeout` inside any projects[] entry — Jest 29 ignores it there', () => {
    const projects = config.projects as Record<string, unknown>[];
    expect(projects.length).toBeGreaterThan(0);

    const offenders = projects
      .filter((project) => Object.prototype.hasOwnProperty.call(project, 'testTimeout'))
      .map((project) => (project.displayName as { name?: string } | string | undefined) ?? project);

    expect(offenders).toEqual([]);
  });
});
