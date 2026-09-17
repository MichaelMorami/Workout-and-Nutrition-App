/**
 * Issue #114 — the remote contract, checked as SQL.
 *
 * There is no hosted Supabase project (#127 applies this file to one), so these tests read
 * `supabase/migrations/**` and prove the contract by parsing, not by pushing. That covers three
 * things a later `supabase db push` cannot give back if they are wrong:
 *
 *   1. the remote columns match the local Drizzle schema #86 landed, column for column;
 *   2. every CHECK the phone enforces locally is enforced remotely too;
 *   3. RLS is enabled, forced and per-user — in the *same migration that creates the table*, so a
 *      rebuild can never drop the policies and leave the table readable.
 *
 * The live two-user isolation test needs a real Postgres and lands with #127.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { foodLog, foods } from '@/src/db';
import { parseSql } from './sql';
import type { ParsedSql, PolicyCommand } from './sql';

const MIGRATIONS = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations');

const files = (): string[] =>
  fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();

const read = (file: string): string => fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');

/** The one migration that defines the contract, parsed once. */
const contractFile = (): string => {
  const found = files().find((f) => read(f).includes('create table public.foods'));
  if (!found) throw new Error(`no migration in ${MIGRATIONS} creates public.foods`);
  return found;
};

const parsed = (): ParsedSql => parseSql(read(contractFile()));

describe('the migrations are valid SQL', () => {
  it('has at least one migration', () => {
    expect(files().length).toBeGreaterThan(0);
  });

  it.each(files())('%s parses', (file) => {
    expect(() => parseSql(read(file))).not.toThrow();
  });

  it.each(files())('%s is named <timestamp>_<slug>.sql, so ordering is total', (file) => {
    expect(file).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });
});

interface ExpectedColumn {
  readonly name: string;
  readonly type: string;
  readonly notNull: boolean;
  readonly default?: string;
}

const SYNC_COLUMNS: readonly ExpectedColumn[] = [
  { name: 'id', type: 'uuid', notNull: true },
  { name: 'user_id', type: 'uuid', notNull: true },
  // bigint, not timestamptz: the local source of truth stores a ms epoch, and a type change on the
  // way out is a rounding bug waiting for a leap second. No DEFAULT and no trigger — see below.
  { name: 'updated_at', type: 'bigint', notNull: true },
  { name: 'deleted', type: 'smallint', notNull: true, default: '0' },
];

const FOODS_COLUMNS: readonly ExpectedColumn[] = [
  ...SYNC_COLUMNS,
  { name: 'name', type: 'text', notNull: true },
  { name: 'brand', type: 'text', notNull: false },
  { name: 'basis', type: 'text', notNull: true },
  { name: 'serving_label', type: 'text', notNull: true },
  { name: 'serving_amount', type: 'double precision', notNull: true },
  { name: 'kcal_per_100', type: 'double precision', notNull: true },
  { name: 'protein_per_100', type: 'double precision', notNull: true },
  { name: 'archived', type: 'smallint', notNull: true, default: '0' },
];

const FOOD_LOG_COLUMNS: readonly ExpectedColumn[] = [
  ...SYNC_COLUMNS,
  { name: 'logged_at', type: 'bigint', notNull: true },
  { name: 'local_date', type: 'text', notNull: true },
  { name: 'local_minute', type: 'integer', notNull: true },
  { name: 'food_id', type: 'uuid', notNull: false },
  { name: 'meal_id', type: 'uuid', notNull: false },
  { name: 'qty', type: 'double precision', notNull: true, default: '1' },
  { name: 'grams', type: 'double precision', notNull: false },
  { name: 'ml', type: 'double precision', notNull: false },
  { name: 'kcal', type: 'double precision', notNull: true },
  { name: 'protein', type: 'double precision', notNull: true },
  { name: 'slot', type: 'text', notNull: true },
];

/** `it.each` tuples must be mutable for jest's overloads — hence the explicit type, not `as const`. */
const TABLES: [string, readonly ExpectedColumn[]][] = [
  ['foods', FOODS_COLUMNS],
  ['food_log', FOOD_LOG_COLUMNS],
];

describe.each(TABLES)('public.%s', (name, expected) => {
  it('exists in the public schema with id as its primary key', () => {
    const table = parsed().tables.get(name);
    expect(table?.schema).toBe('public');
    expect(table?.primaryKey).toEqual(['id']);
  });

  it('has exactly the contract columns, in order', () => {
    expect(parsed().tables.get(name)?.columns.map((c) => c.name)).toEqual(expected.map((c) => c.name));
  });

  it.each(expected)('$name is $type', (column) => {
    const actual = parsed().tables.get(name)?.column(column.name);
    expect(actual?.type).toBe(column.type);
    expect(actual?.notNull).toBe(column.notNull);
    expect(actual?.default).toBe(column.default ?? null);
  });

  it('keys every row to a user, cascading when the account goes', () => {
    expect(parsed().tables.get(name)?.column('user_id')?.references).toBe('auth.users (id)');
  });

  it('never defaults or rewrites updated_at — the device clock that made the edit owns it', () => {
    const table = parsed().tables.get(name);
    expect(table?.column('updated_at')?.default).toBeNull();
    // Asserted on statements, not on the file text, so a prose comment about triggers cannot
    // accidentally satisfy — or accidentally break — the check.
    expect(parsed().statements.filter((s) => /^create\s+trigger\b/i.test(s))).toEqual([]);
  });
});

describe('the CHECK constraints the phone enforces are enforced remotely too', () => {
  /** Guards the device-local usage cache, which has no remote column to constrain. */
  const DEVICE_LOCAL_CHECKS = ['foods_use_count_check'];

  const localChecks = (table: typeof foods | typeof foodLog): string[] =>
    getTableConfig(table)
      .checks.map((c) => c.name)
      .filter((name) => !DEVICE_LOCAL_CHECKS.includes(name))
      .sort();

  const LOCAL_TABLES: [string, typeof foods | typeof foodLog][] = [
    ['foods', foods],
    ['food_log', foodLog],
  ];

  it.each(LOCAL_TABLES)('%s carries every local CHECK by name', (name, table) => {
    const remote = parsed().tables.get(name)?.checks.map((c) => c.name) ?? [];
    for (const check of localChecks(table)) expect(remote).toContain(check);
  });

  it('foods pins basis to the closed set', () => {
    expect(parsed().tables.get('foods')?.check('foods_basis_check')?.expression).toBe(
      "basis in ('weight', 'volume')",
    );
  });

  it('foods keeps a serving above zero and nutrition non-negative', () => {
    const table = parsed().tables.get('foods');
    expect(table?.check('foods_serving_amount_check')?.expression).toBe('serving_amount > 0');
    expect(table?.check('foods_kcal_check')?.expression).toBe('kcal_per_100 >= 0');
    expect(table?.check('foods_protein_check')?.expression).toBe('protein_per_100 >= 0');
  });

  it('food_log keeps grams and ml mutually exclusive', () => {
    expect(parsed().tables.get('food_log')?.check('food_log_amount_check')?.expression).toBe(
      'grams is null or ml is null',
    );
  });

  it('food_log rejects a local_date that is not YYYY-MM-DD, so a UTC-derived day cannot land', () => {
    const expression = parsed().tables.get('food_log')?.check('food_log_local_date_check')?.expression;
    expect(expression).toContain('local_date ~');
    expect(expression).toContain('[0-9]{4}-[0-1][0-9]-[0-3][0-9]');
    expect(expression).toContain('$'); // anchored: '2025-03-10T06:55:00Z' must not match
  });

  it('food_log keeps local_minute inside the day', () => {
    expect(parsed().tables.get('food_log')?.check('food_log_local_minute_check')?.expression).toBe(
      'local_minute between 0 and 1439',
    );
  });

  it.each(['foods', 'food_log'])('%s pins deleted to 0 or 1', (name) => {
    expect(parsed().tables.get(name)?.check(`${name}_deleted_check`)?.expression).toBe(
      'deleted in (0, 1)',
    );
  });
});

describe('the remote shape mirrors the local Drizzle schema', () => {
  /** Derived, device-local, recomputed from `food_log` on every write. It has no business remotely. */
  const DEVICE_LOCAL = ['use_count', 'last_used_at', 'hour_histogram', 'search_text'];

  const localColumns = (table: typeof foods | typeof foodLog): string[] =>
    getTableConfig(table).columns.map((c) => c.name);

  it('foods = the local columns, minus the usage cache, plus user_id', () => {
    const expected = [...localColumns(foods).filter((c) => !DEVICE_LOCAL.includes(c)), 'user_id'];
    expect(parsed().tables.get('foods')?.columns.map((c) => c.name).sort()).toEqual(expected.sort());
  });

  it('food_log = the local columns, plus user_id — every one of them is history', () => {
    const expected = [...localColumns(foodLog), 'user_id'];
    expect(parsed().tables.get('food_log')?.columns.map((c) => c.name).sort()).toEqual(expected.sort());
  });

  it('stores no per-serving values — they are derived from per-100 (#86)', () => {
    const columns = parsed().tables.get('foods')?.columns.map((c) => c.name) ?? [];
    expect(columns).not.toContain('kcal_per_serving');
    expect(columns).not.toContain('protein_per_serving');
    expect(columns).toContain('kcal_per_100');
  });

  it('carries no foreign key from food_log to foods or meals', () => {
    // Sync arrives out of order: a log can reach the server before the food it names. A foreign key
    // would reject a valid row and cost the user a meal; the local database already holds the
    // referential truth.
    const table = parsed().tables.get('food_log');
    expect(table?.column('food_id')?.references).toBeNull();
    expect(table?.column('meal_id')?.references).toBeNull();
  });
});

describe('row level security', () => {
  it.each(['foods', 'food_log'])('%s enables and forces RLS', (name) => {
    expect(parsed().rlsEnabled.has(name)).toBe(true);
    // FORCE covers the table owner too, so a future SECURITY DEFINER function cannot read across users.
    expect(parsed().rlsForced.has(name)).toBe(true);
  });

  it.each(['foods', 'food_log'])('%s declares RLS in the same migration that creates it', (name) => {
    // A separate migration is a window where the table exists and is world-readable, and a rebuild
    // silently drops policies. Same file, or it is not enforced.
    const sql = read(contractFile());
    expect(sql).toContain(`create table public.${name}`);
    expect(sql).toContain(`alter table public.${name} enable row level security`);
  });

  const POLICY_CASES: [string, PolicyCommand][] = [
    ['foods', 'select'],
    ['foods', 'insert'],
    ['foods', 'update'],
    ['food_log', 'select'],
    ['food_log', 'insert'],
    ['food_log', 'update'],
  ];

  it.each(POLICY_CASES)('%s allows %s only for the owning user', (name, command) => {
    const policy = parsed().policyFor(name, command);
    expect(policy).toBeDefined();
    expect(policy?.roles).toEqual(['authenticated']);
    const predicate = command === 'insert' ? policy?.withCheck : policy?.using;
    expect(predicate).toBe('user_id = (select auth.uid())');
  });

  it.each(['foods', 'food_log'])('%s update cannot move a row to another user', (name) => {
    expect(parsed().policyFor(name, 'update')?.withCheck).toBe('user_id = (select auth.uid())');
  });

  it.each(['foods', 'food_log'])('%s grants no DELETE — deletes are tombstones', (name) => {
    expect(parsed().policyFor(name, 'delete')).toBeUndefined();
    expect(parsed().policyFor(name, 'all')).toBeUndefined();
    expect(read(contractFile())).toContain(`revoke delete on public.${name} from authenticated`);
  });

  it('grants nothing to anon', () => {
    for (const policy of parsed().policies) expect(policy.roles).not.toContain('anon');
  });

  it('has no policy that omits a role, which would apply to public', () => {
    for (const policy of parsed().policies) expect(policy.roles.length).toBeGreaterThan(0);
  });
});

describe('no secret is checked in', () => {
  const sources = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? sources(path.join(dir, entry.name))
          : [path.join(dir, entry.name)],
      );

  it('supabase/** holds no service-role key, JWT or project URL', () => {
    const root = path.join(MIGRATIONS, '..');
    for (const file of sources(root)) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text).not.toMatch(/service_role/);
      expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/); // a JWT
      expect(text).not.toMatch(/https:\/\/[a-z0-9]{20}\.supabase\.co/);
    }
  });
});
