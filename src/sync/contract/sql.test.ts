/**
 * The SQL reader that `schema.test.ts` uses to check the remote contract.
 *
 * It is a *lint*, not a Postgres. There is no hosted project and no `supabase db push` in this
 * issue (#114), so "valid SQL" has to be proven by reading the file. These tests pin the two things
 * that reading has to get right: statement splitting that respects strings, comments and dollar
 * quotes, and a hard error on anything unbalanced — a migration that fails to parse here must never
 * be reported as passing.
 */
import { parseMigrations, parseSql, splitStatements, SqlSyntaxError } from './sql';

/** The lexical layer. It will split a `select`; vouching for a statement is `parseSql`'s job. */
describe('splitting statements', () => {
  it('splits on top-level semicolons and drops blank statements', () => {
    expect(splitStatements('select 1; select 2;;')).toEqual(['select 1', 'select 2']);
  });

  it('keeps a semicolon inside a string literal', () => {
    expect(splitStatements(`select 'a;b'; select 2`)).toEqual([`select 'a;b'`, 'select 2']);
  });

  it('keeps a semicolon inside a quoted identifier', () => {
    expect(splitStatements(`select "a;b"; select 2`)).toEqual([`select "a;b"`, 'select 2']);
  });

  it('keeps a semicolon inside a dollar-quoted body', () => {
    const sql = `create function f() returns int as $fn$ begin; return 1; end $fn$ language plpgsql; select 2`;
    expect(splitStatements(sql)).toHaveLength(2);
  });

  it('strips line comments', () => {
    expect(splitStatements('select 1; -- select 2;\nselect 3')).toEqual(['select 1', 'select 3']);
  });

  it('strips block comments, including nested ones', () => {
    expect(splitStatements('select 1 /* a /* b */ c */; select 2')).toEqual(['select 1', 'select 2']);
  });

  it('does not treat a doubled quote as the end of a literal', () => {
    expect(splitStatements(`select 'it''s; fine'`)).toEqual([`select 'it''s; fine'`]);
  });
});

describe('rejecting malformed SQL', () => {
  it('throws on an unterminated string literal', () => {
    expect(() => splitStatements(`select 'oops`)).toThrow(SqlSyntaxError);
  });

  it('throws on an unterminated block comment', () => {
    expect(() => splitStatements('select 1 /* oops')).toThrow(SqlSyntaxError);
  });

  it('throws on unbalanced parentheses', () => {
    expect(() => splitStatements('create table t (a int;')).toThrow(SqlSyntaxError);
  });

  it('throws on a stray closing parenthesis', () => {
    expect(() => splitStatements('select 1);')).toThrow(SqlSyntaxError);
  });

  it('throws on a trailing statement with no terminator', () => {
    expect(() => splitStatements('select 1; select 2 /* unterminated')).toThrow(SqlSyntaxError);
  });
});

/**
 * Regression for PR #128 review, hole 3: the reader used to skip statements it did not recognise, so
 * a migration could hide anything behind an unknown verb and still pass. It must fail closed.
 */
describe('fail-closed: a statement outside the allowlist is an error, never skipped', () => {
  it.each([
    ['a query', 'select * from public.foods'],
    ['a table drop', 'drop table public.food_log'],
    ['a truncate', 'truncate public.food_log'],
    ['a data write', 'update public.foods set deleted = 1'],
    ['a policy alteration', 'alter policy foods_select_own on public.foods using (true)'],
    ['a trigger', 'create trigger t before update on public.foods for each row execute function f()'],
    ['a column change', 'alter table public.foods drop column basis'],
    ['a function', 'create function f() returns int as $fn$ select 1 $fn$ language sql'],
  ])('rejects %s', (_label, statement) => {
    expect(() => parseSql(`create index i on public.foods (id); ${statement};`)).toThrow(SqlSyntaxError);
  });

  it('names the offending statement in the error', () => {
    expect(() => parseSql('truncate public.food_log;')).toThrow(/unrecognised statement.*truncate/);
  });

  it.each([
    ['create index', 'create index foods_user_updated_idx on public.foods (user_id, updated_at)'],
    ['create unique index', 'create unique index u on public.foods (id)'],
    ['grant', 'grant select, insert on public.foods to authenticated'],
    ['revoke', 'revoke delete on public.foods from authenticated'],
    ['drop policy', 'drop policy if exists foods_select_own on public.foods'],
    ['disable row level security', 'alter table public.foods disable row level security'],
    ['no force row level security', 'alter table public.foods no force row level security'],
  ])('accounts for %s', (_label, statement) => {
    expect(() => parseSql(`${statement};`)).not.toThrow();
  });
});

describe('reading a create table', () => {
  const sql = `
    create table public.thing (
      id uuid primary key,
      user_id uuid not null references auth.users (id) on delete cascade,
      updated_at bigint not null,
      deleted smallint not null default 0,
      note text,
      constraint thing_deleted_check check (deleted in (0, 1)),
      constraint thing_note_check check (note is null or length(note) > 0)
    );
  `;

  it('keys tables by their unqualified name and records the schema', () => {
    const table = parseSql(sql).tables.get('thing');
    expect(table?.schema).toBe('public');
  });

  it('reads every column with its type, nullability and default', () => {
    const table = parseSql(sql).tables.get('thing');
    expect(table?.columns.map((c) => c.name)).toEqual([
      'id',
      'user_id',
      'updated_at',
      'deleted',
      'note',
    ]);
    expect(table?.column('deleted')).toMatchObject({
      type: 'smallint',
      notNull: true,
      default: '0',
    });
    expect(table?.column('note')).toMatchObject({ type: 'text', notNull: false, default: null });
  });

  it('does not mistake a constraint line for a column', () => {
    const table = parseSql(sql).tables.get('thing');
    expect(table?.column('constraint')).toBeUndefined();
  });

  it('records the primary key and the foreign keys', () => {
    const table = parseSql(sql).tables.get('thing');
    expect(table?.primaryKey).toEqual(['id']);
    expect(table?.column('user_id')?.references).toBe('auth.users (id)');
  });

  it('records named check constraints with their expressions', () => {
    const table = parseSql(sql).tables.get('thing');
    expect(table?.checks.map((c) => c.name)).toEqual(['thing_deleted_check', 'thing_note_check']);
    expect(table?.check('thing_deleted_check')?.expression).toBe('deleted in (0, 1)');
  });

  it('keeps a comma inside a check expression out of the column split', () => {
    const table = parseSql(sql).tables.get('thing');
    expect(table?.checks).toHaveLength(2);
  });
});

describe('reading row level security', () => {
  const sql = `
    alter table public.thing enable row level security;
    alter table public.thing force row level security;
    create policy thing_select_own on public.thing
      for select to authenticated
      using (user_id = (select auth.uid()));
    create policy thing_update_own on public.thing
      for update to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  `;

  it('records which tables enable and force RLS', () => {
    const parsed = parseSql(sql);
    expect(parsed.rlsEnabled.has('thing')).toBe(true);
    expect(parsed.rlsForced.has('thing')).toBe(true);
  });

  it('reads each policy: name, table, command, roles, using and with check', () => {
    const parsed = parseSql(sql);
    expect(parsed.policies.map((p) => p.name)).toEqual(['thing_select_own', 'thing_update_own']);
    expect(parsed.policyFor('thing', 'select')).toMatchObject({
      roles: ['authenticated'],
      using: 'user_id = (select auth.uid())',
      withCheck: null,
    });
    expect(parsed.policyFor('thing', 'update')).toMatchObject({
      using: 'user_id = (select auth.uid())',
      withCheck: 'user_id = (select auth.uid())',
    });
  });

  it('has no policy for a command the migration never granted', () => {
    expect(parseSql(sql).policyFor('thing', 'delete')).toBeUndefined();
  });
});

describe('reading grants and revokes, in order', () => {
  it('is unstated when no statement mentions the privilege', () => {
    expect(parseSql('create index i on public.t (id);').privilegeState('t', 'authenticated', 'delete')).toBe(
      'unstated',
    );
  });

  it('records a revoke for each role and privilege listed', () => {
    const set = parseSql('revoke delete, truncate on public.t from authenticated, anon;');
    expect(set.privilegeState('t', 'authenticated', 'delete')).toBe('revoked');
    expect(set.privilegeState('t', 'anon', 'truncate')).toBe('revoked');
    expect(set.privilegeState('t', 'authenticated', 'select')).toBe('unstated');
  });

  it('lets a later grant undo an earlier revoke, and vice versa', () => {
    expect(
      parseSql('revoke delete on public.t from authenticated; grant delete on public.t to authenticated;')
        .privilegeState('t', 'authenticated', 'delete'),
    ).toBe('granted');
    expect(
      parseSql('grant delete on public.t to authenticated; revoke delete on public.t from authenticated;')
        .privilegeState('t', 'authenticated', 'delete'),
    ).toBe('revoked');
  });

  it('expands ALL [PRIVILEGES] to every table privilege, including delete', () => {
    const set = parseSql('revoke delete on t from authenticated; grant all privileges on table t to authenticated;');
    expect(set.privilegeState('t', 'authenticated', 'delete')).toBe('granted');
  });

  it('folds across migration files in the order given', () => {
    const set = parseMigrations([
      { name: '1.sql', sql: 'revoke delete on public.t from authenticated;' },
      { name: '2.sql', sql: 'grant delete on public.t to authenticated;' },
    ]);
    expect(set.privilegeState('t', 'authenticated', 'delete')).toBe('granted');
  });
});

/**
 * #130: Postgres folds an unquoted identifier to lower case and keeps a quoted one as written. The
 * reader must key every table, schema, policy and role name the same way, or a mixed-case statement
 * lands under a key no check looks at.
 */
describe('identifier case, the way Postgres folds it', () => {
  it('lower-cases unquoted table and schema names', () => {
    const set = parseSql('create table PUBLIC.Thing (id uuid primary key);');
    expect(set.tables.get('thing')?.schema).toBe('public');
    expect(set.tables.has('Thing')).toBe(false);
  });

  it('keeps a quoted name as written', () => {
    const set = parseSql('create table "Public"."Thing" (id uuid primary key);');
    expect(set.tables.get('Thing')?.schema).toBe('Public');
    expect(set.tables.has('thing')).toBe(false);
  });

  it('reads a doubled quote inside a quoted name as one quote', () => {
    expect(parseSql('create table public."a""b" (id uuid primary key);').tables.has('a"b')).toBe(true);
  });

  it('folds RLS toggles onto the same table', () => {
    const set = parseSql(
      'alter table public.Thing enable row level security; ALTER TABLE PUBLIC.THING FORCE ROW LEVEL SECURITY;',
    );
    expect(set.rlsEnabled.has('thing')).toBe(true);
    expect(set.rlsForced.has('thing')).toBe(true);
  });

  it('folds policy names, tables and roles', () => {
    const set = parseSql('create policy Thing_Read on public.THING for select to AUTHENTICATED using (true);');
    expect(set.policyFor('thing', 'select')).toMatchObject({ name: 'thing_read', roles: ['authenticated'] });
  });

  it('drops a policy named in a different case', () => {
    const set = parseSql(
      'create policy p on public.thing for select to authenticated using (true); drop policy P on PUBLIC.Thing;',
    );
    expect(set.policies).toEqual([]);
  });

  it('reads a policy table name with whitespace around the dot as one name', () => {
    const set = parseSql('create policy p on public .\n thing for select to authenticated using (true);');
    expect(set.policyFor('thing', 'select')).toMatchObject({ name: 'p', table: 'thing' });
  });

  it.each([
    ['a word between the table name and its clauses', 'create policy p on public.thing junk for select using (true)'],
    ['a Unicode-escape table name', 'create policy p on U&"thing" for select using (true)'],
    ['a name that stops at a dot', 'create policy p on public. for select using (true)'],
  ])('throws on a policy with %s rather than keying it to part of a name', (_label, statement) => {
    expect(() => parseSql(`${statement};`)).toThrow(SqlSyntaxError);
  });

  it('keeps a quoted role as written, so "AUTHENTICATED" is not authenticated', () => {
    const set = parseSql('grant delete on public.t to "AUTHENTICATED";');
    expect(set.privilegeState('t', 'authenticated', 'delete')).toBe('unstated');
    expect(set.privilegeState('t', 'AUTHENTICATED', 'delete')).toBe('granted');
  });

  it('folds grants on a mixed-case table and role', () => {
    const set = parseSql('grant delete on Public.T to Authenticated;');
    expect(set.privilegeState('t', 'authenticated', 'delete')).toBe('granted');
  });
});

/** #131: every route by which a grant reaches a role is folded into `privilegeState`. */
describe('grants that reach a role by another route', () => {
  const deleteFor = (sql: string, role = 'authenticated'): string =>
    parseSql(sql).privilegeState('t', role, 'delete');

  it('treats a grant to public as a grant to every role', () => {
    const sql = 'revoke delete on public.t from authenticated; grant delete on public.t to public;';
    expect(deleteFor(sql)).toBe('granted');
    expect(deleteFor(sql, 'anon')).toBe('granted');
  });

  it('keeps a public grant in force when the role alone is revoked afterwards', () => {
    // Privileges are additive: revoking from authenticated does not take away what public holds.
    expect(deleteFor('grant delete on public.t to public; revoke delete on public.t from authenticated;')).toBe(
      'granted',
    );
  });

  it('does not let a revoke from public stand in for a revoke from the role', () => {
    expect(deleteFor('revoke delete on public.t from public;')).toBe('unstated');
  });

  it('is revoked once both public and the role are revoked', () => {
    expect(
      deleteFor(
        'grant delete on public.t to public; revoke delete on public.t from public; ' +
          'revoke delete on public.t from authenticated;',
      ),
    ).toBe('revoked');
  });

  it('reads the role list before granted by', () => {
    const sql = 'grant delete on public.t to authenticated, anon granted by postgres;';
    expect(deleteFor(sql)).toBe('granted');
    expect(deleteFor(sql, 'anon')).toBe('granted');
  });

  it('reads with grant option followed by granted by', () => {
    expect(deleteFor('grant delete on public.t to authenticated with grant option granted by current_user;')).toBe(
      'granted',
    );
  });

  it('reads a revoke that carries granted by', () => {
    expect(deleteFor('revoke delete on public.t from authenticated granted by postgres cascade;')).toBe('revoked');
  });

  it('reads the optional group keyword', () => {
    expect(deleteFor('grant delete on public.t to group authenticated;')).toBe('granted');
  });

  it.each([
    ['trailing words after the roles', 'grant delete on public.t to authenticated whatever'],
    ['a role that is not an identifier', 'grant delete on public.t to authenticated-ish'],
    ['an empty role in the list', 'grant delete on public.t to authenticated, , anon'],
    ['a granted by with no role', 'grant delete on public.t to authenticated granted by'],
  ])('throws on %s rather than guessing a role name', (_label, statement) => {
    expect(() => parseSql(`${statement};`)).toThrow(SqlSyntaxError);
  });
});
