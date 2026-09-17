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
import { parseMigrations, parseSql } from './sql';
import type { MigrationSource, ParsedSql, PolicyCommand } from './sql';

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

/** Every migration, in the order `supabase db push` applies them. */
const migrationSet = (): MigrationSource[] => files().map((name) => ({ name, sql: read(name) }));

/**
 * The schema after **every** migration has run — not the contract file alone. RLS is a property of
 * the final schema: a later migration that disables it, drops a policy or adds a permissive one has
 * to turn this suite red (PR #128 review, hole 2).
 */
const parsed = (): ParsedSql => parseMigrations(migrationSet());

const SYNCED_TABLES = ['foods', 'food_log'] as const;
const OWNER = 'user_id = (select auth.uid())';

/**
 * Every RLS invariant as one pure check over a parsed migration set. The named tests below assert it
 * piece by piece against the real set; the regression tests feed it deliberately weakened sets, so
 * they prove this exact check — not a look-alike — catches each weakening.
 */
function rlsViolations(set: ParsedSql): string[] {
  const found: string[] = [];
  for (const name of SYNCED_TABLES) {
    const table = set.tables.get(name);
    const rls = set.rls.get(name);
    if (!table) found.push(`${name}: never created`);
    if (!set.rlsEnabled.has(name)) found.push(`${name}: RLS not enabled`);
    if (!set.rlsForced.has(name)) found.push(`${name}: RLS not forced`);
    if (table && rls?.enabledIn !== table.origin) {
      found.push(`${name}: RLS last set in ${rls?.enabledIn ?? 'no migration'}, not in ${table.origin}`);
    }
    for (const command of ['select', 'insert', 'update'] as const) {
      const policies = set.policiesFor(name, command);
      if (policies.length !== 1) found.push(`${name}: ${policies.length} ${command} policies`);
      for (const policy of policies) {
        if (policy.roles.join(',') !== 'authenticated') found.push(`${name}: ${policy.name} roles`);
        const predicate = command === 'insert' ? policy.withCheck : policy.using;
        if (predicate !== OWNER) found.push(`${name}: ${policy.name} is not owner-scoped`);
        if (command === 'update' && policy.withCheck !== OWNER) {
          found.push(`${name}: ${policy.name} can move a row to another user`);
        }
      }
    }
    // 'unstated' is not safe: Supabase's bootstrap grants broad privileges to authenticated, so only an
    // explicit revoke that no later grant undoes is a guarantee.
    if (set.privilegeState(name, 'authenticated', 'delete') !== 'revoked') {
      found.push(`${name}: DELETE is ${set.privilegeState(name, 'authenticated', 'delete')} for authenticated`);
    }
    for (const command of ['delete', 'all'] as const) {
      for (const policy of set.policiesFor(name, command)) {
        if (policy.permissive) found.push(`${name}: permissive ${command} policy ${policy.name}`);
      }
    }
  }
  for (const policy of set.policies) {
    if (policy.roles.length === 0) found.push(`${policy.table}: ${policy.name} applies to public`);
    if (policy.roles.includes('anon')) found.push(`${policy.table}: ${policy.name} grants anon`);
  }
  return found;
}

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
    // silently drops policies. Same file, or it is not enforced. Asserted on parsed statements.
    const set = parsed();
    expect(set.tables.get(name)?.origin).toBe(contractFile());
    expect(set.rls.get(name)?.enabledIn).toBe(contractFile());
  });

  it('holds every RLS invariant across the full migration set', () => {
    expect(rlsViolations(parsed())).toEqual([]);
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
    // More than one permissive policy ORs together, so "the" policy must be the only one.
    expect(parsed().policiesFor(name, command)).toHaveLength(1);
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
    expect(parsed().policiesFor(name, 'delete')).toEqual([]);
    expect(parsed().policiesFor(name, 'all')).toEqual([]);
    // Asserted on parsed statements over the full set, never on file text (PR #128 review, hole 1).
    expect(parsed().privilegeState(name, 'authenticated', 'delete')).toBe('revoked');
  });

  it('grants nothing to anon', () => {
    for (const policy of parsed().policies) expect(policy.roles).not.toContain('anon');
  });

  it('has no policy that omits a role, which would apply to public', () => {
    for (const policy of parsed().policies) expect(policy.roles.length).toBeGreaterThan(0);
  });
});

/**
 * Regression for PR #128 review, hole 2: the RLS assertions used to parse only the contract file, so
 * a second migration that disabled RLS and added a permissive DELETE policy left all of them green.
 * Each case appends one weakening migration after the real set and requires the suite's own check to
 * notice.
 */
describe('a later migration that weakens RLS turns the suite red', () => {
  const LATER = '99991231235959_later.sql';
  const withLater = (sql: string): ParsedSql =>
    parseMigrations([...migrationSet(), { name: LATER, sql }]);

  it('the real set, unmodified, has no violations', () => {
    expect(rlsViolations(withLater('create index noop_idx on public.foods (name);'))).toEqual([]);
  });

  it.each([
    ['disables RLS', 'alter table public.food_log disable row level security;', 'food_log: RLS not enabled'],
    ['un-forces RLS', 'alter table public.foods no force row level security;', 'foods: RLS not forced'],
    [
      're-enables RLS from another file',
      'alter table public.foods enable row level security;',
      `foods: RLS last set in ${LATER}`,
    ],
    [
      'adds a permissive DELETE policy',
      'create policy food_log_delete_any on public.food_log for delete to authenticated using (true);',
      'food_log: permissive delete policy food_log_delete_any',
    ],
    [
      'adds a permissive ALL policy',
      'create policy foods_all on public.foods to authenticated using (true);',
      'foods: permissive all policy foods_all',
    ],
    [
      'adds a second, wider SELECT policy',
      'create policy foods_read_all on public.foods for select to authenticated using (true);',
      'foods: 2 select policies',
    ],
    [
      'drops the owner SELECT policy',
      'drop policy food_log_select_own on public.food_log;',
      'food_log: 0 select policies',
    ],
    [
      'opens a table to anon',
      'create policy foods_anon on public.foods as restrictive for delete to anon using (true);',
      'foods: foods_anon grants anon',
    ],
  ])('%s', (_label, sql, violation) => {
    expect(rlsViolations(withLater(sql)).join('\n')).toContain(violation);
  });

  it.each([
    ['grants DELETE back', 'grant delete on public.food_log to authenticated;', 'food_log: DELETE is granted'],
    ['grants ALL', 'grant all privileges on public.foods to authenticated;', 'foods: DELETE is granted'],
  ])('%s', (_label, sql, violation) => {
    expect(rlsViolations(withLater(sql)).join('\n')).toContain(violation);
  });

  it('the reviewer\'s exact reproduction fails', () => {
    const set = withLater(`
      alter table public.food_log disable row level security;
      create policy food_log_delete_any on public.food_log for delete to authenticated using (true);
      grant delete on public.food_log to authenticated;
    `);
    expect(rlsViolations(set).length).toBeGreaterThan(0);
  });
});

/**
 * Regression for PR #128 review, hole 1: the DELETE revoke was asserted with `toContain` on the raw
 * file text, so commenting the statement out left the test green.
 */
describe('a missing DELETE revoke is noticed, even when its text is still in the file', () => {
  const REVOKE = 'revoke delete on public.food_log from authenticated;';

  it.each([
    ['commented out', `-- ${REVOKE}`],
    ['inside a block comment', `/* ${REVOKE} */`],
    ['deleted', ''],
  ])('the revoke %s', (_label, replacement) => {
    const sql = read(contractFile());
    expect(sql).toContain(REVOKE);
    const weakened = sql.replace(REVOKE, replacement);
    if (replacement) {
      // The old raw-text assertion would still have passed on this file.
      expect(weakened).toContain(REVOKE.slice(0, -1));
    }
    const set = parseMigrations([{ name: contractFile(), sql: weakened }]);
    expect(set.privilegeState('food_log', 'authenticated', 'delete')).toBe('unstated');
    expect(rlsViolations(set)).toContain('food_log: DELETE is unstated for authenticated');
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
