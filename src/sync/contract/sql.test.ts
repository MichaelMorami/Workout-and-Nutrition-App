/**
 * The SQL reader that `schema.test.ts` uses to check the remote contract.
 *
 * It is a *lint*, not a Postgres. There is no hosted project and no `supabase db push` in this
 * issue (#114), so "valid SQL" has to be proven by reading the file. These tests pin the two things
 * that reading has to get right: statement splitting that respects strings, comments and dollar
 * quotes, and a hard error on anything unbalanced — a migration that fails to parse here must never
 * be reported as passing.
 */
import { parseSql, SqlSyntaxError } from './sql';

describe('splitting statements', () => {
  it('splits on top-level semicolons and drops blank statements', () => {
    expect(parseSql('select 1; select 2;;').statements).toEqual(['select 1', 'select 2']);
  });

  it('keeps a semicolon inside a string literal', () => {
    expect(parseSql(`select 'a;b'; select 2`).statements).toEqual([`select 'a;b'`, 'select 2']);
  });

  it('keeps a semicolon inside a quoted identifier', () => {
    expect(parseSql(`select "a;b"; select 2`).statements).toEqual([`select "a;b"`, 'select 2']);
  });

  it('keeps a semicolon inside a dollar-quoted body', () => {
    const sql = `create function f() returns int as $fn$ begin; return 1; end $fn$ language plpgsql; select 2`;
    expect(parseSql(sql).statements).toHaveLength(2);
  });

  it('strips line comments', () => {
    expect(parseSql('select 1; -- select 2;\nselect 3').statements).toEqual(['select 1', 'select 3']);
  });

  it('strips block comments, including nested ones', () => {
    expect(parseSql('select 1 /* a /* b */ c */; select 2').statements).toEqual(['select 1', 'select 2']);
  });

  it('does not treat a doubled quote as the end of a literal', () => {
    expect(parseSql(`select 'it''s; fine'`).statements).toEqual([`select 'it''s; fine'`]);
  });
});

describe('rejecting malformed SQL', () => {
  it('throws on an unterminated string literal', () => {
    expect(() => parseSql(`select 'oops`)).toThrow(SqlSyntaxError);
  });

  it('throws on an unterminated block comment', () => {
    expect(() => parseSql('select 1 /* oops')).toThrow(SqlSyntaxError);
  });

  it('throws on unbalanced parentheses', () => {
    expect(() => parseSql('create table t (a int;')).toThrow(SqlSyntaxError);
  });

  it('throws on a stray closing parenthesis', () => {
    expect(() => parseSql('select 1);')).toThrow(SqlSyntaxError);
  });

  it('throws on a trailing statement with no terminator', () => {
    expect(() => parseSql('select 1; select 2 /* unterminated')).toThrow(SqlSyntaxError);
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
