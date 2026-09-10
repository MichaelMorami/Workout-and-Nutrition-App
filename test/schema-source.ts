/**
 * Where the harness gets its schema and migrations from.
 *
 * `src/db/**` is `db-engineer`'s path and does not exist yet, so this resolves at *runtime*:
 * the moment `src/db/schema.ts` and its generated migrations land, every existing test in the repo
 * starts running against the real schema with no edit to `test/**` — which matters, because
 * `db-engineer` cannot write to `test/**`.
 *
 * For type safety, pass the schema explicitly instead — that is the intended day-to-day usage:
 *
 *   import * as schema from '@/src/db/schema';
 *   const { db } = makeTestDb({ schema });   // db is fully typed against the real schema
 */
import fs from 'node:fs';
import path from 'node:path';

/** Repo root: `test/` always sits directly under it. */
export const REPO_ROOT: string = path.resolve(__dirname, '..');

/** Candidate schema modules, most specific first. */
const SCHEMA_CANDIDATES = ['src/db/schema.ts', 'src/db/schema/index.ts', 'src/db/index.ts'];

/** Candidate drizzle-kit output folders, most specific first. */
const MIGRATION_CANDIDATES = ['src/db/migrations', 'src/db/drizzle', 'drizzle'];

const FIXTURE_SCHEMA = 'test/fixtures/schema.ts';
const FIXTURE_MIGRATIONS = 'test/fixtures/migrations';

export interface SchemaSource {
  /** The drizzle table objects, keyed by export name. */
  schema: Record<string, unknown>;
  /** drizzle-kit output folder containing `meta/_journal.json`, or `undefined` if none exists yet. */
  migrationsFolder: string | undefined;
  /** `true` while the app schema does not exist and the throwaway fixture is standing in. */
  isFixture: boolean;
  /** Human-readable source, for error messages and the timing report. */
  label: string;
}

function firstExisting(candidates: readonly string[]): string | undefined {
  return candidates.map((rel) => path.join(REPO_ROOT, rel)).find((abs) => fs.existsSync(abs));
}

function hasJournal(folder: string): boolean {
  return fs.existsSync(path.join(folder, 'meta', '_journal.json'));
}

/**
 * `require` through a variable so TypeScript does not try to resolve a module that will not exist
 * until Sprint 1. Under Jest this goes through Jest's registry, so the module is transformed and
 * cached like any other import.
 */
function loadModule(absPath: string): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod: unknown = require(absPath);
  if (typeof mod !== 'object' || mod === null) {
    throw new Error(`${absPath} did not export an object`);
  }
  return mod as Record<string, unknown>;
}

let cached: SchemaSource | undefined;

/** Resolve the schema + migrations the harness should use. Cached per process. */
export function resolveSchemaSource(): SchemaSource {
  if (cached) return cached;

  const realSchemaPath = firstExisting(SCHEMA_CANDIDATES);
  if (realSchemaPath) {
    const migrations = firstExisting(MIGRATION_CANDIDATES);
    cached = {
      schema: loadModule(realSchemaPath),
      migrationsFolder: migrations && hasJournal(migrations) ? migrations : undefined,
      isFixture: false,
      label: path.relative(REPO_ROOT, realSchemaPath),
    };
    return cached;
  }

  cached = {
    schema: loadModule(path.join(REPO_ROOT, FIXTURE_SCHEMA)),
    migrationsFolder: path.join(REPO_ROOT, FIXTURE_MIGRATIONS),
    isFixture: true,
    label: `${FIXTURE_SCHEMA} (fixture — the app schema does not exist yet)`,
  };
  return cached;
}

/** Test-only: forget the cached resolution. */
export function resetSchemaSource(): void {
  cached = undefined;
}

/** The drizzle-kit output folder for a given schema module path, if one exists. */
export function findMigrationsFolder(): string | undefined {
  const folder = firstExisting(MIGRATION_CANDIDATES) ?? path.join(REPO_ROOT, FIXTURE_MIGRATIONS);
  return hasJournal(folder) ? folder : undefined;
}
