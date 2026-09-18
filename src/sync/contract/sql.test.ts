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

  it('does not open a body on a $ glued to an identifier, as Postgres does not', () => {
    // `a$$` is one identifier in Postgres; reading `$$` there as a body opener desyncs every later body.
    expect(splitStatements('select a$$; select 2')).toEqual(['select a$$', 'select 2']);
  });

  it.each([
    ['E', "select E'it\\'s; fine'"],
    ['lower-case e', "select e'x'"],
    ['U&', "select U&'x'"],
  ])('throws on a %s-prefixed string, whose escapes this reader does not lex', (_label, sql) => {
    expect(() => splitStatements(sql)).toThrow(SqlSyntaxError);
  });

  it('throws on a U&"…" name, whose escapes this reader does not decode', () => {
    expect(() => splitStatements('select U&"\\0070g_class"')).toThrow(SqlSyntaxError);
  });

  it('still reads a quoted name after a word ending in u&-like text', () => {
    expect(splitStatements('select a & "b"')).toEqual(['select a & "b"']);
  });

  it('still reads a plain string after a word ending in e', () => {
    expect(splitStatements("select type = 'x'")).toEqual(["select type = 'x'"]);
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
    ['a language clause given as a quoted name', 'create function public.f() returns int language "plpgsql" as $$ begin return 1; end $$'],
    ['a plain default on an added column', 'alter table public.t add column n int not null default 0'],
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
    // PR #138 review, blocker 1: Postgres lexes a block comment as whitespace.
    ['security/**/definer', 'create function public.f() returns int language sql security/**/definer as $$ select 1 $$'],
    // Blocker 2: the language clause is read outside the body, quoted names included, exactly once.
    [
      'a quoted language behind a decoy language sql in the body',
      'create function public.f() returns int as $$ -- language sql\n import os $$ language "plpython3u"',
    ],
    ['a quoted C language', 'create function public.f() returns int language "c" as $$ select 1 $$'],
    ['two language clauses', 'create function public.f() returns int language sql language plpgsql as $$ select 1 $$'],
    // Blocker 3: catalog DML and obfuscated set_config need no forbidden keyword.
    [
      'catalog DML in a function body',
      "create function public.f(uuid) returns int language sql immutable as $$ update pg_catalog.pg_class set relrowsecurity = false where relname = 't' returning 1 $$",
    ],
    [
      'an obfuscated set_config in a function body',
      "create function public.g() returns text language sql as $$ select set_config('ro'||'le', 'service_role', false) $$",
    ],
    ['information_schema in a function body', 'create function public.g() returns int language sql as $$ select 1 from information_schema.tables $$'],
    ['set_config in an added column default', "alter table public.t add column x text default set_config('ro'||'le', 'service_role', false)"],
    ['a catalog read in an added column default', 'alter table public.t add column x oid default pg_catalog.pg_my_temp_schema()'],
    ['set_config in an index expression', "create index t_x on public.t ((set_config('ro'||'le', 'service_role', false)))"],
    ['a catalog function in an index predicate', 'create index t_x on public.t (id) where pg_catalog.pg_has_role(user_id::text, \'x\')'],
    // Found alongside blocker 1: places where the reader and Postgres would disagree on where a body ends.
    [
      'a $$ glued to an identifier, which Postgres reads as part of the name',
      'create function public.a$$() returns int as $$ language sql $$ language "c" -- $$',
    ],
    // Re-review blocker A: a U&"…" name decodes to a forbidden one that no text pattern sees.
    [
      'a Unicode-escaped catalog name in a function body',
      'create function public.f(uuid) returns int language sql immutable as $$ update U&"\\0070g_class" set relrowsecurity = false returning 1 $$',
    ],
    [
      'a Unicode-escaped set_config in an added column check',
      `alter table public.t add column y text check (U&"set\\005fconfig"('ro'||'le', 'service_role', false) is not null)`,
    ],
    [
      'a Unicode-escaped set_config in an index predicate',
      `create index t_p on public.t (id) where U&"set\\005fconfig"('ro'||'le', 'x', false) is not null`,
    ],
    // Re-review blocker B: replacing a function a policy calls rewrites the policy without touching it.
    [
      'a function created outside public',
      'create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$',
    ],
    [
      'a public function whose name the policy calls',
      'create or replace function public.uid() returns uuid language sql stable as $$ select user_id from public.t limit 1 $$',
    ],
    // Re-review suggestion: create table defaults follow the same expression rule.
    [
      'set_config in a create table default',
      "create table public.u (id uuid primary key, r text default set_config('role', 'service_role', true))",
    ],
    // Suggestion: add column checks the schema, so auth.t is not public.t.
    ['an add column on a same-named table in another schema', 'alter table auth.t add column y int'],
  ])('still throws on %s', (_label, statement) => {
    expect(() => parseSql(`${base} ${statement};`)).toThrow(SqlSyntaxError);
  });
});

describe('policies and the functions a migration creates (PR #138 re-review)', () => {
  it('throws when a policy calls a function the migrations redefine, in either order', () => {
    const policy = 'create policy own on public.t for select to authenticated using (user_id = (select auth.uid()));';
    const fn = 'create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;';
    expect(() => parseSql(`create table public.t (id uuid primary key, user_id uuid); ${policy} ${fn}`)).toThrow(SqlSyntaxError);
    const helper = 'create function public.is_owner(u uuid) returns boolean language sql as $$ select true $$;';
    const usesHelper = 'create policy own on public.t for select to authenticated using (public.is_owner(user_id));';
    expect(() => parseSql(`create table public.t (id uuid primary key, user_id uuid); ${helper} ${usesHelper}`)).toThrow(
      /policy.*is_owner/,
    );
  });

  it('accepts a public function no policy calls', () => {
    expect(() =>
      parseSql(
        'create table public.t (id uuid primary key, user_id uuid); ' +
          'create policy own on public.t for select to authenticated using (user_id = (select auth.uid())); ' +
          'create function touch() returns int language sql as $$ select 1 $$;',
      ),
    ).not.toThrow();
  });

  it("names a string-form language clause instead of misreading the next word as the language", () => {
    expect(() => parseSql("create function public.f() returns int language 'plpgsql' as $$ begin return 1; end $$;")).toThrow(
      /string-form language clause is not read/,
    );
  });
});

/**
 * #135, the bypass. `revoke grant option for delete on t from authenticated` takes away only the
 * right to *re-grant* DELETE. The DELETE privilege itself stays exactly as it was. The reader used
 * to swallow the `grant option for` prefix and record a full revoke, so a migration that granted
 * DELETE and then wrote this passed the contract check while every authenticated user could still
 * delete history.
 *
 * The rule: a `grant option for` revoke is read (a malformed one still throws) and then records
 * nothing — see the cascade block below (#148) for the one case where Postgres does more than the
 * reader records, and why that lands on the safe side.
 */
describe('revoke grant option for, which does not revoke the privilege (#135)', () => {
  const deleteFor = (sql: string, role = 'authenticated'): string =>
    parseSql(sql).privilegeState('t', role, 'delete');

  it('leaves a granted privilege granted', () => {
    expect(
      deleteFor(
        'grant delete on public.t to authenticated; ' +
          'revoke grant option for delete on public.t from authenticated;',
      ),
    ).toBe('granted');
  });

  it('leaves an unstated privilege unstated, never revoked', () => {
    expect(deleteFor('revoke grant option for delete on public.t from authenticated;')).toBe('unstated');
  });

  it('leaves a revoked privilege revoked', () => {
    expect(
      deleteFor(
        'revoke delete on public.t from authenticated; ' +
          'revoke grant option for delete on public.t from authenticated;',
      ),
    ).toBe('revoked');
  });

  it('does not clear a grant made with grant option', () => {
    expect(
      deleteFor(
        'grant delete on public.t to authenticated with grant option; ' +
          'revoke grant option for delete on public.t from authenticated;',
      ),
    ).toBe('granted');
  });

  it('leaves every privilege of an all-privileges grant standing', () => {
    const set = parseSql(
      'grant all privileges on public.t to authenticated; ' +
        'revoke grant option for all privileges on public.t from authenticated;',
    );
    for (const privilege of ['select', 'insert', 'update', 'delete', 'truncate']) {
      expect(set.privilegeState('t', 'authenticated', privilege)).toBe('granted');
    }
  });

  it('leaves a grant to public standing, so the role still holds it', () => {
    expect(
      deleteFor(
        'grant delete on public.t to public; revoke grant option for delete on public.t from public;',
      ),
    ).toBe('granted');
  });

  it('is not confused by case, block comments or line comments between the words', () => {
    expect(
      deleteFor(
        'GRANT DELETE ON Public.T TO Authenticated; ' +
          'REVOKE /* re-grant only */ GRANT OPTION -- not the privilege\n FOR DELETE ON Public.T FROM Authenticated;',
      ),
    ).toBe('granted');
  });

  it('still reads a plain revoke as a full revoke', () => {
    expect(
      deleteFor('grant delete on public.t to authenticated; revoke delete on public.t from authenticated;'),
    ).toBe('revoked');
  });

  it('still reads granted by and cascade after a grant option revoke', () => {
    expect(
      deleteFor(
        'grant delete on public.t to authenticated; ' +
          'revoke grant option for delete on public.t from authenticated granted by postgres cascade;',
      ),
    ).toBe('granted');
  });

  it.each([
    ['a role that is not an identifier', 'revoke grant option for delete on public.t from authenticated-ish'],
    ['an empty role in the list', 'revoke grant option for delete on public.t from authenticated, , anon'],
    ['a privilege that is not one', 'revoke grant option for deletion on public.t from authenticated'],
    ['no privilege at all', 'revoke grant option for on public.t from authenticated'],
  ])('throws on %s rather than passing unread', (_label, statement) => {
    expect(() => parseSql(`${statement};`)).toThrow(SqlSyntaxError);
  });

  it.each([
    ['revoke', 'revoke delete on all tables in schema public from authenticated'],
    ['grant', 'grant delete on all tables in schema public to authenticated'],
    ['revoke grant option for', 'revoke grant option for delete on all tables in schema public from authenticated'],
    ['revoke admin option for', 'revoke admin option for authenticated from postgres'],
  ])('throws on a schema-wide or role %s, which it cannot key to a table', (_label, statement) => {
    expect(() => parseSql(`${statement};`)).toThrow(SqlSyntaxError);
  });

  it.each([
    ['an unknown privilege', 'revoke deleet on public.t from authenticated'],
    ['a privilege list with a stray word', 'grant select, delete rows on public.t to authenticated'],
  ])('throws on %s rather than filing it under a name no check reads', (_label, statement) => {
    expect(() => parseSql(`${statement};`)).toThrow(SqlSyntaxError);
  });
});

/**
 * #135, second half: #130 folded table, schema, policy and role names the way Postgres does. Column
 * and CHECK-constraint names were still compared as typed, so a mixed-case migration made the
 * contract check fail (or, for a name the old regexes could not read at all, silently drop the
 * constraint). Same rule, same helper: unquoted folds to lower case, quoted keeps its case.
 */
describe('column and check names fold the way Postgres folds them (#135)', () => {
  it('lower-cases unquoted column names, in the table and in the primary key', () => {
    const table = parseSql('create table public.T (Id uuid primary key, User_Id uuid not null);').tables.get('t');
    expect(table?.columns.map((c) => c.name)).toEqual(['id', 'user_id']);
    expect(table?.primaryKey).toEqual(['id']);
    expect(table?.column('id')?.type).toBe('uuid');
  });

  it('keeps a quoted column name as written, so "Id" is not id', () => {
    const table = parseSql('create table public.t ("Id" uuid primary key);').tables.get('t');
    expect(table?.column('Id')).toMatchObject({ type: 'uuid', notNull: true });
    expect(table?.column('id')).toBeUndefined();
  });

  it('reads a doubled quote inside a column name as one quote', () => {
    const table = parseSql('create table public.t (id uuid primary key, "a""b" text);').tables.get('t');
    expect(table?.column('a"b')?.type).toBe('text');
  });

  it('reads a quoted column name that contains a space as one name', () => {
    const table = parseSql('create table public.t (id uuid primary key, "my col" text not null);').tables.get('t');
    expect(table?.columns.map((c) => c.name)).toEqual(['id', 'my col']);
    expect(table?.column('my col')).toMatchObject({ type: 'text', notNull: true });
  });

  it('folds a table-level primary key column list', () => {
    const table = parseSql(
      'create table public.t (A uuid not null, "B" uuid not null, primary key (A, "B"));',
    ).tables.get('t');
    expect(table?.primaryKey).toEqual(['a', 'B']);
  });

  it('lower-cases an unquoted check constraint name', () => {
    const table = parseSql(
      'create table public.t (id uuid primary key, n int, constraint T_N_Check check (n > 0));',
    ).tables.get('t');
    expect(table?.checks.map((c) => c.name)).toEqual(['t_n_check']);
    expect(table?.check('t_n_check')?.expression).toBe('n > 0');
  });

  it('keeps a quoted check constraint name as written', () => {
    const table = parseSql(
      'create table public.t (id uuid primary key, n int, constraint "T_N_Check" check (n > 0));',
    ).tables.get('t');
    expect(table?.check('T_N_Check')?.expression).toBe('n > 0');
    expect(table?.check('t_n_check')).toBeUndefined();
  });

  it('reads a quoted check name that contains a space rather than dropping the constraint', () => {
    const table = parseSql(
      'create table public.t (id uuid primary key, n int, constraint "my check" check (n > 0));',
    ).tables.get('t');
    expect(table?.checks.map((c) => c.name)).toEqual(['my check']);
  });

  it('folds the name of a column added by alter table', () => {
    const table = parseSql(
      'create table public.t (id uuid primary key); alter table public.T add column Note Text;',
    ).tables.get('t');
    expect(table?.columns.map((c) => c.name)).toEqual(['id', 'note']);
    expect(table?.column('note')?.type).toBe('text');
  });

  it('does not take a column whose name merely starts with a constraint keyword for a constraint', () => {
    const table = parseSql(
      'create table public.t (id uuid primary key, unique_code text not null, checkpoint bigint);',
    ).tables.get('t');
    expect(table?.columns.map((c) => c.name)).toEqual(['id', 'unique_code', 'checkpoint']);
  });

  it.each([
    ['a Unicode-escaped column name', 'create table public.t (U&"\\0069d" uuid primary key)'],
    ['a Unicode-escaped check name', 'create table public.t (id uuid primary key, constraint U&"\\0063k" check (true))'],
    ['an item that is not a column definition', 'create table public.t (id uuid primary key, 42 int)'],
  ])('throws on %s rather than guessing the name', (_label, statement) => {
    expect(() => parseSql(`${statement};`)).toThrow(SqlSyntaxError);
  });
});

/**
 * #148, the same class of defect as #135, found by the probe harness in the review of PR #144: the
 * `continue` at the end of the table-constraint branch in `parseCreateTable` read a constraint and
 * threw it away. `constraint t_pkey primary key (a, b)` left the table with no primary key at all,
 * and a `unique`, a `foreign key` or an unnamed `check` vanished without a word — so a contract test
 * could assert over a table the reader had quietly under-read.
 *
 * The rule, as everywhere else in this reader: every entry in the body is either **recorded** or
 * **raises**. Nothing is skipped.
 */
describe('table-level constraints are recorded or rejected, never dropped (#148)', () => {
  const table = (body: string) => parseSql(`create table public.t (${body});`).tables.get('t');

  it('records a named table-level primary key, which used to vanish', () => {
    expect(table('a uuid, b uuid, constraint t_pkey primary key (a, b)')?.primaryKey).toEqual([
      'a',
      'b',
    ]);
  });

  it('records an unnamed table-level primary key', () => {
    expect(table('a uuid, b uuid, primary key (a, b)')?.primaryKey).toEqual(['a', 'b']);
  });

  it('folds a named primary key the way Postgres folds names', () => {
    expect(table('A uuid, constraint "T Pkey" primary key (A, "B c")')?.primaryKey).toEqual([
      'a',
      'B c',
    ]);
  });

  it('records a named unique constraint with its columns', () => {
    expect(table('a uuid, b uuid, constraint t_uq unique (a, b)')?.uniques).toEqual([
      { name: 't_uq', columns: ['a', 'b'] },
    ]);
  });

  it('records an unnamed unique constraint under a null name', () => {
    expect(table('a uuid, unique (a)')?.uniques).toEqual([{ name: null, columns: ['a'] }]);
  });

  it('records a unique constraint that spells out its null handling', () => {
    expect(table('a uuid, unique nulls not distinct (a)')?.uniques).toEqual([
      { name: null, columns: ['a'] },
    ]);
  });

  it('records a named foreign key with its columns and its target', () => {
    expect(
      table('user_id uuid, constraint t_user_fk foreign key (user_id) references auth.users (id) on delete cascade')
        ?.foreignKeys,
    ).toEqual([{ name: 't_user_fk', columns: ['user_id'], references: 'auth.users (id)' }]);
  });

  it('records an unnamed foreign key under a null name', () => {
    expect(table('a uuid, foreign key (a) references public.other')?.foreignKeys).toEqual([
      { name: null, columns: ['a'], references: 'public.other' },
    ]);
  });

  it('records an unnamed check with its expression, under a null name', () => {
    expect(table('deleted smallint, check (deleted in (0, 1))')?.checks).toEqual([
      { name: null, expression: 'deleted in (0, 1)' },
    ]);
  });

  it('still records a named check, and still finds it by name', () => {
    expect(table('deleted smallint, constraint t_deleted_check check (deleted in (0, 1))')?.check(
      't_deleted_check',
    )?.expression).toBe('deleted in (0, 1)');
  });

  it('reads a constraint written in mixed case and spread over comments', () => {
    expect(
      table('A uuid, CONSTRAINT /* name */ T_UQ /* kind */ UNIQUE ( A ) -- trailing\n')?.uniques,
    ).toEqual([{ name: 't_uq', columns: ['a'] }]);
  });

  it.each([
    ['a second primary key', 'a uuid primary key, constraint t_pkey primary key (a)'],
    ['two table-level primary keys', 'a uuid, primary key (a), primary key (a)'],
    ['an exclusion constraint', 'a uuid, exclude using gist (a with =)'],
    ['a constraint with no recognised kind', 'a uuid, constraint t_c'],
    ['a constraint kind this reader does not read', 'a uuid, constraint t_c exclude using gist (a with =)'],
    ['a no-inherit check', 'a smallint, constraint t_c check (a > 0) no inherit'],
    ['a deferred foreign key', 'a uuid, foreign key (a) references public.other deferrable initially deferred'],
    ['a foreign key with a match clause', 'a uuid, foreign key (a) references public.other (id) match full'],
    ['a foreign key that references nothing', 'a uuid, foreign key (a)'],
    ['a unique constraint with index storage options', 'a uuid, unique (a) with (fillfactor = 70)'],
    ['a primary key with a tablespace', 'a uuid, primary key (a) using index tablespace fast'],
  ])('throws on %s rather than reading it and dropping it', (_label, body) => {
    expect(() => parseSql(`create table public.t (${body});`)).toThrow(SqlSyntaxError);
  });

  it('names the constraint it refuses in the error', () => {
    expect(() => parseSql('create table public.t (a uuid, exclude using gist (a with =));')).toThrow(
      /exclude using gist/i,
    );
  });
});

/**
 * #148: `create table` had two more ways to be read as something it is not. `(like other)` has no
 * column definitions at all, and the reader took `like` for a column name and `other` for its type,
 * producing a table with a column nobody wrote. Anything after the closing parenthesis —
 * `partition by`, `inherits`, storage options, a tablespace — was dropped on the floor, so a
 * partitioned table read as an ordinary one.
 */
describe('create table forms this reader will not vouch for (#148)', () => {
  it.each([
    ['a like clause', 'create table public.t (like public.other)'],
    ['a like clause with inclusions', 'create table public.t (like public.other including all)'],
    ['a like clause after a column', 'create table public.t (id uuid primary key, like public.other)'],
    ['a LIKE clause in mixed case', 'create table public.t (LIKE Public.Other)'],
    ['partition by', 'create table public.t (a int) partition by range (a)'],
    ['inherits', 'create table public.t (a int) inherits (public.other)'],
    ['storage options', 'create table public.t (a int) with (fillfactor = 70)'],
    ['a tablespace', 'create table public.t (a int) tablespace fast'],
    ['an access method', 'create table public.t (a int) using heap'],
    ['a temp table commit action', 'create table public.t (a int) on commit drop'],
  ])('throws on %s rather than misreading the table', (_label, statement) => {
    expect(() => parseSql(`${statement};`)).toThrow(SqlSyntaxError);
  });

  it('names the trailing clause it refuses in the error', () => {
    expect(() => parseSql('create table public.t (a int) partition by range (a);')).toThrow(
      /partition by range/i,
    );
  });

  it('still reads an ordinary create table, trailing whitespace and all', () => {
    const table = parseSql('create table public.t (\n  id uuid primary key\n)  \n;').tables.get('t');
    expect(table?.columns.map((c) => c.name)).toEqual(['id']);
  });
});

/**
 * #148: `drop policy` was the last statement still matched with the `[\w"]+` pattern that PR #144
 * moved away from everywhere else. That pattern is not an identifier: it reads `a"b` as a name
 * Postgres could never produce, and it cannot read `"my policy"` or `public . t` at all. A drop the
 * reader mis-keys leaves a permissive policy standing in the parse that is gone from the database —
 * or, worse, removes one that is still there.
 */
describe('drop policy reads a whole identifier (#148)', () => {
  const standing = (sql: string): string[] => parseSql(sql).policies.map((p) => p.name);
  const created = (name: string, table = 'public.t'): string =>
    `create policy ${name} on ${table} for select to authenticated using (true);`;

  it('drops a policy whose quoted name contains a space', () => {
    expect(standing(`${created('"my policy"')} drop policy "my policy" on public.t;`)).toEqual([]);
  });

  it('drops a policy whose quoted name contains a doubled quote', () => {
    expect(standing(`${created('"a""b"')} drop policy "a""b" on public.t;`)).toEqual([]);
  });

  it('drops a policy on a table written with whitespace around the dot', () => {
    expect(standing(`${created('p')} drop policy p on public . t;`)).toEqual([]);
  });

  it('drops a policy on a quoted table name', () => {
    expect(standing(`${created('p', 'public."Thing"')} drop policy p on public."Thing";`)).toEqual([]);
  });

  it('reads if exists and mixed-case keywords around a quoted name', () => {
    expect(standing(`${created('"my policy"')} DROP POLICY IF EXISTS "my policy" ON Public.T;`)).toEqual([]);
  });

  it('keeps a policy whose quoted name differs in case, as Postgres would', () => {
    expect(standing(`${created('"My Policy"')} drop policy if exists "my policy" on public.t;`)).toEqual([
      'My Policy',
    ]);
  });

  it('drops an unquoted name written in another case', () => {
    expect(standing(`${created('My_Policy')} drop policy MY_POLICY on public.t;`)).toEqual([]);
  });

  it.each([
    ['a name that is not an identifier', 'drop policy a"b on public.t'],
    ['a name that starts with a digit', 'drop policy 1p on public.t'],
    ['a qualified policy name', 'drop policy public.p on public.t'],
    ['a Unicode-escaped policy name', 'drop policy U&"\\0070" on public.t'],
    ['no table at all', 'drop policy p on'],
    ['a trailing cascade this reader does not read', 'drop policy p on public.t cascade'],
  ])('throws on %s rather than dropping the wrong policy', (_label, statement) => {
    expect(() => parseSql(`${created('p')} ${statement};`)).toThrow(SqlSyntaxError);
  });
});

/**
 * #148: the docblock on the `grant option for` revoke said it "changes no privilege state at all",
 * which is stronger than what Postgres does and stronger than what this reader does. `CASCADE`
 * revokes the *dependent* grants — the ones the named role made onward to somebody else — and leaves
 * the named role's own privilege alone. This reader does not model grantors, so it records nothing
 * for the statement either way; these tests pin that, so the wording and the behaviour stay together.
 */
describe('a grant-option revoke with cascade (#148)', () => {
  const stateOf = (sql: string, role: string): string => parseSql(sql).privilegeState('t', role, 'delete');

  it('leaves the named role holding the privilege', () => {
    expect(
      stateOf(
        'grant delete on public.t to authenticated with grant option; ' +
          'revoke grant option for delete on public.t from authenticated cascade;',
        'authenticated',
      ),
    ).toBe('granted');
  });

  it('does not move a second role the cascade might reach in Postgres', () => {
    const sql =
      'grant delete on public.t to authenticated with grant option; ' +
      'grant delete on public.t to anon; ' +
      'revoke grant option for delete on public.t from authenticated cascade;';
    expect(stateOf(sql, 'anon')).toBe('granted');
  });

  it('still reads the statement strictly, cascade and all', () => {
    expect(() =>
      parseSql('revoke grant option for deletion on public.t from authenticated cascade;'),
    ).toThrow(SqlSyntaxError);
  });
});
