/**
 * A small, strict reader for the checked-in Supabase migrations.
 *
 * Why this exists: #114 defines the remote contract with **no hosted project**, so "the migration is
 * valid and says what we think it says" has to be provable from the file. `supabase db lint` needs a
 * running Postgres; a real Postgres parser is a native dependency this repo will not take on for a
 * test. So this reads the subset of DDL the contract actually uses — `create table`, `create index`,
 * `alter table … row level security`, `create policy`, `drop policy`, `grant`, `revoke` — and throws
 * `SqlSyntaxError` on **anything else**.
 *
 * Fail-closed is the point, and it was learned the hard way (PR #128 review): an earlier version
 * silently skipped statements it did not recognise, so a migration could lose its `revoke delete`
 * or gain a permissive DELETE policy and every test still passed. A reader that ignores the unknown
 * manufactures confidence; one that throws is a ratchet.
 *
 * It is deliberately not a general SQL parser and must never become one. Its job is to make a silent
 * drift between `supabase/migrations/**` and the local schema impossible; a construct it does not
 * understand should be added here with a test, not worked around at the call site.
 *
 * Build-time only: pure string in, plain objects out. No fs, no client, no Postgres.
 */

/** Thrown when the text is not SQL this reader will vouch for. Never swallowed. */
export class SqlSyntaxError extends Error {
  constructor(
    message: string,
    /** Character offset in the source, for a usable error on a 200-line migration. */
    readonly offset: number,
  ) {
    super(`${message} (at offset ${offset})`);
    this.name = 'SqlSyntaxError';
  }
}

export interface ParsedColumn {
  readonly name: string;
  /** The type as written, whitespace-normalised: `uuid`, `bigint`, `double precision`. */
  readonly type: string;
  readonly notNull: boolean;
  /** The DEFAULT expression as written, or `null` when the column has none. */
  readonly default: string | null;
  /** The referenced table and column (`auth.users (id)`), or `null`. */
  readonly references: string | null;
}

export interface ParsedCheck {
  readonly name: string;
  /** The expression inside `check (…)`, whitespace-normalised. */
  readonly expression: string;
}

export interface ParsedTable {
  readonly name: string;
  readonly schema: string | null;
  readonly columns: readonly ParsedColumn[];
  readonly checks: readonly ParsedCheck[];
  readonly primaryKey: readonly string[];
  column(name: string): ParsedColumn | undefined;
  check(name: string): ParsedCheck | undefined;
}

export type PolicyCommand = 'select' | 'insert' | 'update' | 'delete' | 'all';

export interface ParsedPolicy {
  readonly name: string;
  readonly table: string;
  readonly command: PolicyCommand;
  readonly roles: readonly string[];
  readonly using: string | null;
  readonly withCheck: string | null;
}

export interface ParsedSql {
  /** Statements in file order, comments stripped and trimmed. Empty ones are dropped. */
  readonly statements: readonly string[];
  /** Created tables, keyed by unqualified name. */
  readonly tables: ReadonlyMap<string, ParsedTable>;
  readonly policies: readonly ParsedPolicy[];
  /** Unqualified names of tables with `enable row level security`. */
  readonly rlsEnabled: ReadonlySet<string>;
  /** Unqualified names of tables with `force row level security`. */
  readonly rlsForced: ReadonlySet<string>;
  policyFor(table: string, command: PolicyCommand): ParsedPolicy | undefined;
}

const POLICY_COMMANDS: readonly PolicyCommand[] = ['select', 'insert', 'update', 'delete', 'all'];

/** Words that end a type name in a column definition. */
const COLUMN_MODIFIERS = new Set([
  'not',
  'null',
  'default',
  'references',
  'primary',
  'unique',
  'check',
  'collate',
  'generated',
  'constraint',
]);

/** Item prefixes that make a `create table` entry a table constraint rather than a column. */
const TABLE_CONSTRAINT_PREFIXES = ['constraint ', 'primary key', 'unique', 'check ', 'foreign key', 'exclude '];

const squash = (text: string): string => text.replace(/\s+/g, ' ').trim();

const unqualified = (name: string): string => {
  const parts = name.split('.');
  // `noUncheckedIndexedAccess` is on; `split` always yields at least one element, but prove it.
  return (parts[parts.length - 1] ?? name).replace(/"/g, '');
};

const schemaOf = (name: string): string | null => {
  const parts = name.split('.');
  return parts.length > 1 ? (parts[0] ?? '').replace(/"/g, '') : null;
};

/**
 * Split into statements, stripping comments. Respects `'…'` (with `''` escapes), `"…"` quoted
 * identifiers, `$tag$…$tag$` bodies and nested block comments, so a `;` inside any of them is
 * not a statement boundary. Throws on anything left open.
 *
 * The lexical layer only: it will split a `select`. Whether a statement is one this reader vouches
 * for is `parseSql`'s decision.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let buffer = '';
  let depth = 0;
  let i = 0;

  const push = (): void => {
    const trimmed = buffer.trim();
    if (trimmed.length > 0) statements.push(trimmed);
    buffer = '';
  };

  while (i < sql.length) {
    const ch = sql[i] as string;
    const next = sql[i + 1];

    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }

    if (ch === '/' && next === '*') {
      const start = i;
      let nesting = 0;
      while (i < sql.length) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          nesting += 1;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          nesting -= 1;
          i += 2;
          if (nesting === 0) break;
        } else {
          i += 1;
        }
      }
      if (nesting !== 0) throw new SqlSyntaxError('unterminated block comment', start);
      continue;
    }

    if (ch === "'" || ch === '"') {
      const start = i;
      let literal = ch;
      i += 1;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === ch) {
          if (sql[i + 1] === ch) {
            literal += ch + ch;
            i += 2;
            continue;
          }
          literal += ch;
          i += 1;
          closed = true;
          break;
        }
        literal += sql[i];
        i += 1;
      }
      if (!closed) {
        throw new SqlSyntaxError(
          ch === "'" ? 'unterminated string literal' : 'unterminated quoted identifier',
          start,
        );
      }
      buffer += literal;
      continue;
    }

    if (ch === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tag) {
        const marker = tag[0];
        const end = sql.indexOf(marker, i + marker.length);
        if (end === -1) throw new SqlSyntaxError(`unterminated ${marker} body`, i);
        buffer += sql.slice(i, end + marker.length);
        i = end + marker.length;
        continue;
      }
    }

    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth < 0) throw new SqlSyntaxError('unbalanced closing parenthesis', i);
    }

    if (ch === ';' && depth === 0) {
      push();
      i += 1;
      continue;
    }

    buffer += ch;
    i += 1;
  }

  if (depth !== 0) throw new SqlSyntaxError('unbalanced parenthesis at end of input', sql.length);
  push();
  return statements;
}

/** The content between the parenthesis at `open` and its match. */
function parenBody(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  throw new SqlSyntaxError('unbalanced parenthesis', open);
}

/** Split on commas that are not inside parentheses or a string literal. */
function splitItems(body: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = '';
  let quote: string | null = null;

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i] as string;
    if (quote) {
      current += ch;
      if (ch === quote) quote = body[i + 1] === quote ? ((current += ch), (i += 1), quote) : null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      items.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  items.push(current);
  return items.map(squash).filter((item) => item.length > 0);
}

function parseColumn(item: string): ParsedColumn {
  const tokens = item.split(' ');
  const name = (tokens[0] ?? '').replace(/"/g, '');
  const typeTokens: string[] = [];
  for (const token of tokens.slice(1)) {
    if (COLUMN_MODIFIERS.has(token.toLowerCase())) break;
    typeTokens.push(token);
  }
  const rest = item.slice(name.length + typeTokens.join(' ').length + 1);

  const defaultMatch = /\bdefault\s+(.+?)(?=\s+(?:not null|null|references|check|primary key|unique|collate)\b|$)/i.exec(
    rest,
  );
  const referencesMatch = /\breferences\s+(.+?)(?=\s+on\s+(?:delete|update)\b|$)/i.exec(rest);

  return {
    name,
    type: typeTokens.join(' ').toLowerCase(),
    // A PRIMARY KEY column is NOT NULL in Postgres whether or not it says so, and reporting it as
    // nullable would make the contract test pass on a schema that is not the one it checked.
    notNull: /\bnot\s+null\b/i.test(rest) || /\bprimary\s+key\b/i.test(rest),
    default: defaultMatch?.[1]?.trim() ?? null,
    references: referencesMatch?.[1]?.trim() ?? null,
  };
}

function parseCreateTable(statement: string): ParsedTable | null {
  const head = /^create\s+table\s+(?:if\s+not\s+exists\s+)?([\w".]+)\s*\(/is.exec(statement);
  if (!head) return null;
  const qualified = head[1] as string;
  const body = parenBody(statement, statement.indexOf('(', head[0].length - 1));

  const columns: ParsedColumn[] = [];
  const checks: ParsedCheck[] = [];
  const primaryKey: string[] = [];

  for (const item of splitItems(body)) {
    const lower = item.toLowerCase();
    const isConstraint = TABLE_CONSTRAINT_PREFIXES.some((prefix) => lower.startsWith(prefix));

    if (isConstraint) {
      const named = /^constraint\s+([\w"]+)\s+check\s*\(/i.exec(item);
      if (named) {
        checks.push({
          name: (named[1] as string).replace(/"/g, ''),
          expression: squash(parenBody(item, item.indexOf('(', named[0].length - 1))),
        });
        continue;
      }
      const tablePk = /^primary\s+key\s*\(/i.exec(item);
      if (tablePk) {
        primaryKey.push(
          ...splitItems(parenBody(item, item.indexOf('('))).map((c) => c.replace(/"/g, '')),
        );
      }
      continue;
    }

    const column = parseColumn(item);
    columns.push(column);
    if (/\bprimary\s+key\b/i.test(item)) primaryKey.push(column.name);
  }

  const table: ParsedTable = {
    name: unqualified(qualified),
    schema: schemaOf(qualified),
    columns,
    checks,
    primaryKey,
    column: (name) => columns.find((c) => c.name === name),
    check: (name) => checks.find((c) => c.name === name),
  };
  return table;
}

function parsePolicy(statement: string): ParsedPolicy | null {
  const head = /^create\s+policy\s+([\w"]+)\s+on\s+([\w".]+)\b/is.exec(statement);
  if (!head) return null;
  const rest = squash(statement.slice(head[0].length));

  const commandMatch = /^for\s+(\w+)\b/i.exec(rest);
  const command = (commandMatch?.[1]?.toLowerCase() ?? 'all') as PolicyCommand;
  if (!POLICY_COMMANDS.includes(command)) {
    throw new SqlSyntaxError(`unknown policy command "${command}"`, 0);
  }

  const rolesMatch = /\bto\s+([\w",\s]+?)(?=\s+(?:using|with\s+check)\b|$)/i.exec(rest);
  const roles = rolesMatch?.[1]
    ? rolesMatch[1]
        .split(',')
        .map((role) => role.trim().replace(/"/g, ''))
        .filter((role) => role.length > 0)
    : [];

  const usingAt = /\busing\s*\(/i.exec(rest);
  const withCheckAt = /\bwith\s+check\s*\(/i.exec(rest);

  return {
    name: (head[1] as string).replace(/"/g, ''),
    table: unqualified(head[2] as string),
    command,
    roles,
    using: usingAt ? squash(parenBody(rest, usingAt.index + usingAt[0].length - 1)) : null,
    withCheck: withCheckAt
      ? squash(parenBody(rest, withCheckAt.index + withCheckAt[0].length - 1))
      : null,
  };
}

const CREATE_INDEX =
  /^create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?[\w".]+\s+on\s+[\w".]+\s*\(/is;
const DROP_POLICY = /^drop\s+policy\s+(?:if\s+exists\s+)?([\w"]+)\s+on\s+([\w".]+)$/i;
const GRANT = /^grant\s+(.+?)\s+on\s+(?:table\s+)?([\w".]+)\s+to\s+(.+?)(?:\s+with\s+grant\s+option)?$/i;
const REVOKE =
  /^revoke\s+(?:grant\s+option\s+for\s+)?(.+?)\s+on\s+(?:table\s+)?([\w".]+)\s+from\s+(.+?)(?:\s+(?:cascade|restrict))?$/i;

/** Read a migration file's text. Throws `SqlSyntaxError` rather than reporting a broken file as fine. */
export function parseSql(sql: string): ParsedSql {
  const statements = splitStatements(sql);
  const tables = new Map<string, ParsedTable>();
  const policies: ParsedPolicy[] = [];
  const rlsEnabled = new Set<string>();
  const rlsForced = new Set<string>();

  for (const statement of statements) {
    const table = parseCreateTable(statement);
    if (table) {
      tables.set(table.name, table);
      continue;
    }

    const policy = parsePolicy(statement);
    if (policy) {
      policies.push(policy);
      continue;
    }

    if (CREATE_INDEX.test(statement)) continue;
    if (DROP_POLICY.test(squash(statement))) continue;
    if (GRANT.test(squash(statement))) continue;
    if (REVOKE.test(squash(statement))) continue;

    const rls = /^alter\s+table\s+([\w".]+)\s+(enable|force|disable|no\s+force)\s+row\s+level\s+security$/is.exec(
      squash(statement),
    );
    if (rls) {
      const name = unqualified(rls[1] as string);
      const mode = squash((rls[2] as string).toLowerCase());
      if (mode === 'enable') rlsEnabled.add(name);
      if (mode === 'force') rlsForced.add(name);
      if (mode === 'disable') rlsEnabled.delete(name);
      if (mode === 'no force') rlsForced.delete(name);
      continue;
    }

    throw new SqlSyntaxError(
      'unrecognised statement: this reader vouches only for create table, create index, alter table ' +
        '... row level security, create policy, drop policy, grant and revoke. Teach it the construct ' +
        `with a test instead of letting it pass unread: "${squash(statement).slice(0, 80)}"`,
      0,
    );
  }

  return {
    statements,
    tables,
    policies,
    rlsEnabled,
    rlsForced,
    policyFor: (table, command) =>
      policies.find((p) => p.table === table && p.command === command),
  };
}
