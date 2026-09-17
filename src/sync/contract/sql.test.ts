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

/**
 * #133: Postgres's dollar-quote tag is a letter or underscore, then letters, digits or underscores.
 * The old pattern stopped at a digit, so `$a1$` was not a tag and the body split on its inner `;`.
 */
describe('dollar-quote tags, by the Postgres rule', () => {
  it('tokenises a DO $a1$ ... $a1$ block as one dollar-quoted body', () => {
    expect(splitStatements('do $a1$ begin; perform 1; end $a1$; select 2')).toEqual([
      'do $a1$ begin; perform 1; end $a1$',
      'select 2',
    ]);
  });

  it('reads a function body tagged $fn1$ whole', () => {
    const sql = 'create function f() returns int as $fn1$ begin; return 1; end $fn1$ language plpgsql; select 2';
    expect(splitStatements(sql)).toHaveLength(2);
  });

  it('accepts a tag that starts with an underscore and holds digits', () => {
    expect(splitStatements('do $_9x$ begin; end $_9x$')).toHaveLength(1);
  });

  it('does not take a tag that starts with a digit', () => {
    // `$1a$` is not a tag in Postgres, so the `;` between the two is a real boundary.
    expect(splitStatements('select $1a$; select 2 $1a$')).toHaveLength(2);
  });

  it('leaves positional parameters alone', () => {
    expect(splitStatements('select $1; select $2')).toEqual(['select $1', 'select $2']);
  });

  it('does not close a body on a longer tag that shares a prefix', () => {
    expect(splitStatements('do $a$ x $a1$; y $a$; select 2')).toHaveLength(2);
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
    ['a security definer function', 'create function f() returns int as $fn$ select 1 $fn$ language sql security definer'],
    ['a constraint added by alter table', 'alter table public.foods add constraint c check (true)'],
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

/**
 * #132: constructs a hosted-project migration (#127) is likely to carry. Each is accepted only in a
 * form that cannot change RLS or privileges; anything that could still throws.
 */
describe('statements that do not touch RLS or privileges', () => {
  const base = `
    create table public.t (id uuid primary key, user_id uuid not null);
    alter table public.t enable row level security;
    alter table public.t force row level security;
    create policy t_select_own on public.t for select to authenticated using (user_id = (select auth.uid()));
    revoke delete, truncate on public.t from authenticated, anon;
    grant select, insert, update on public.t to authenticated;
  `;

  const securityState = (sql: string): unknown => {
    const set = parseSql(sql);
    return {
      rls: [...set.rls],
      policies: set.policies,
      privileges: ['authenticated', 'anon', 'public'].flatMap((role) =>
        ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'].map(
          (privilege) => `${role}:${privilege}:${set.privilegeState('t', role, privilege)}`,
        ),
      ),
    };
  };

  it.each([
    ['alter table ... add column', 'alter table public.t add column note text'],
    ['alter table ... add column if not exists', 'alter table if exists public.t add column if not exists note text default null'],
    ['alter table ... add without the column keyword', 'alter table public.t add note text'],
    ['several add column actions', 'alter table public.t add column a int not null default 0, add column b numeric(10, 2)'],
    ['create function', 'create function public.f() returns int language sql as $fn$ select 1 $fn$'],
    [
      'create or replace function, plpgsql, security invoker, digit tag',
      'create or replace function public.touch(x int) returns int language plpgsql security invoker ' +
        "set search_path = '' as $fn1$ begin; return x + 1; end $fn1$",
    ],
    ['comment on table', "comment on table public.t is 'Food log rows; synced.'"],
    ['comment on column', "comment on column public.t.user_id is 'owner'"],
    ['comment on ... is null', 'comment on table public.t is null'],
    ['create extension', 'create extension if not exists pgcrypto with schema extensions'],
    ['create extension with a quoted name', 'create extension "uuid-ossp"'],
  ])('parses %s without changing RLS or privilege state', (_label, statement) => {
    const sql = `${base} ${statement};`;
    expect(() => parseSql(sql)).not.toThrow();
    expect(securityState(sql)).toEqual(securityState(base));
  });

  it('records an added column on the table', () => {
    const table = parseSql(`${base} alter table public.t add column Note text not null default '';`).tables.get('t');
    expect(table?.column('note')).toMatchObject({ type: 'text', notNull: true, default: "''" });
    expect(table?.columns.map((c) => c.name)).toEqual(['id', 'user_id', 'note']);
  });

  it('keeps an add column if not exists on an existing column a no-op', () => {
    const table = parseSql(`${base} alter table public.t add column if not exists user_id text;`).tables.get('t');
    expect(table?.column('user_id')?.type).toBe('uuid');
  });

  it.each([
    ['a security definer function', 'create function f() returns int language sql security definer as $$ select 1 $$'],
    ['a grant inside a function body', 'create function f() returns void language sql as $b$ grant delete on public.t to anon $b$'],
    ['a revoke inside a function body', 'create function f() returns void language sql as $b$ revoke select on public.t from anon $b$'],
    [
      'a policy change inside a function body',
      'create function f() returns void language plpgsql as $b$ begin create policy p on public.t using (true); end $b$',
    ],
    [
      'an RLS toggle inside a function body',
      'create function f() returns void language plpgsql as $b$ begin alter table public.t disable row level security; end $b$',
    ],
    [
      'dynamic SQL inside a function body',
      "create function f() returns void language plpgsql as $b$ begin execute 'gr' || 'ant all on t to anon'; end $b$",
    ],
    ['a role switch in the function header', 'create function f() returns int language sql set role postgres as $$ select 1 $$'],
    ['a set_config role switch', "create function f() returns text language sql as $$ select set_config('role', 'postgres', true) $$"],
    ['a C-language function', "create function f() returns int language c as 'lib', 'f'"],
    ['a function with no language', 'create function f() returns int as $$ select 1 $$'],
    ['an extension outside the trusted list', 'create extension dblink'],
    ['an extension installed with cascade', 'create extension pg_trgm cascade'],
    ['an RLS toggle chained after add column', 'alter table public.t add column note text, disable row level security'],
    ['an add column on a table the migrations never created', 'alter table public.other add column note text'],
    ['an add column of a column that already exists', 'alter table public.t add column user_id text'],
    ['an add column that declares a primary key', 'alter table public.t add column k uuid primary key'],
    ['trailing words after a comment', "comment on table public.t is 'x' junk"],
    ['a comment whose text is not a literal', 'comment on table public.t is current_user'],
  ])('still throws on %s', (_label, statement) => {
    expect(() => parseSql(`${base} ${statement};`)).toThrow(SqlSyntaxError);
  });
});
