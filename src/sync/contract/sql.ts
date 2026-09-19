/**
 * A small, strict reader for the checked-in Supabase migrations.
 *
 * Why this exists: #114 defines the remote contract with **no hosted project**, so "the migration is
 * valid and says what we think it says" has to be provable from the file. `supabase db lint` needs a
 * running Postgres; a real Postgres parser is a native dependency this repo will not take on for a
 * test. So this reads the subset of DDL the contract actually uses — `create table`, `create index`,
 * `alter table … row level security`, `alter table … add column`, `create policy`, `drop policy`,
 * `grant`, `revoke` — plus the security-neutral forms of `create function`, `comment on` and
 * `create extension` (#132), and throws `SqlSyntaxError` on **anything else**.
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
  /**
   * `true` for an inline `unique` — the spelling these migrations use, and one that was recorded
   * nowhere until #148's review. `primary key` is not reported here: it is a different constraint,
   * and it is already on {@link ParsedTable.primaryKey}.
   */
  readonly unique: boolean;
  /**
   * Every inline `check (…)` on this column, expression text captured whole and not parsed —
   * the same gap #148's review found for a column-level `unique`, just for `check` (#162). Kept
   * separate from {@link ParsedTable.checks}, exactly as column-level `unique` is kept separate from
   * {@link ParsedTable.uniques}: a table-level and a column-level spelling are different constraints
   * in Postgres, and folding them together would let one hide the other.
   */
  readonly checks: readonly ParsedCheck[];
}

export interface ParsedCheck {
  /**
   * The constraint name, or `null` for an unnamed `check (…)`. Postgres names those itself at run
   * time (`t_col_check`), and a name invented here is a name no contract test could trust — so an
   * unnamed check is recorded with its expression and left unnamed (#148).
   */
  readonly name: string | null;
  /** The expression inside `check (…)`, whitespace-normalised. */
  readonly expression: string;
}

/** A table-level `unique (…)`. Recorded, never dropped (#148) — the columns are folded names. */
export interface ParsedUnique {
  readonly name: string | null;
  readonly columns: readonly string[];
}

/**
 * A table-level `foreign key (…) references …`. A column-level `references` is on
 * {@link ParsedColumn} instead; both are recorded, because a foreign key this repo deliberately does
 * *not* have (`food_log` to `foods`, so an out-of-order sync cannot be rejected) is worth proving.
 */
export interface ParsedForeignKey {
  readonly name: string | null;
  readonly columns: readonly string[];
  /**
   * The target, with every name folded the way Postgres folds it: `AUTH . USERS ( ID )` and
   * `auth.users (id)` are the same table, so they record the same string and an equality assertion
   * on this field means something (#148 review).
   */
  readonly references: string;
}

export interface ParsedTable {
  readonly name: string;
  readonly schema: string | null;
  readonly columns: readonly ParsedColumn[];
  readonly checks: readonly ParsedCheck[];
  readonly uniques: readonly ParsedUnique[];
  readonly foreignKeys: readonly ParsedForeignKey[];
  readonly primaryKey: readonly string[];
  /** The migration that created it. */
  readonly origin: string;
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
  /** `false` for `as restrictive`. Permissive policies OR together; restrictive ones AND. */
  readonly permissive: boolean;
  /** The migration that created it. */
  readonly origin: string;
}

/** One migration file: its name (for ordering and error messages) and its text. */
export interface MigrationSource {
  readonly name: string;
  readonly sql: string;
}

/** Effective RLS for one table after the whole migration set has run. */
export interface ParsedRls {
  readonly enabled: boolean;
  readonly forced: boolean;
  /** The migration whose statement last enabled or disabled RLS, or `null` if none did. */
  readonly enabledIn: string | null;
  /** The migration whose statement last forced or un-forced RLS, or `null` if none did. */
  readonly forcedIn: string | null;
}

/**
 * Whether a privilege was explicitly granted, explicitly revoked, or never mentioned.
 *
 * `'unstated'` is not `'revoked'`: Supabase's own bootstrap grants broad privileges to
 * `authenticated`, so a privilege the migrations never mention may well be held. Only `'revoked'`,
 * with no later grant, is a guarantee.
 *
 * `revoke grant option for <privilege>` is not a revoke either: it takes away the right to re-grant
 * the privilege and leaves the privilege of the role it names exactly as it was, so that role's
 * state does not move (#135). `cascade` widens it — Postgres then also revokes the *dependent*
 * grants, the ones that role made onward to somebody else. This reader does not model grantors, so
 * it records nothing for anyone; a dependent grant it should have dropped stays `'granted'` here,
 * which is the direction a contract check catches rather than the one it misses (#148).
 */
export type PrivilegeState = 'granted' | 'revoked' | 'unstated';

/**
 * The schema a migration set describes **after every statement in every file has run, in order** —
 * not the contents of any one file. RLS is a property of the final schema, so a later migration that
 * disables it, drops a policy or adds a permissive one must show up here.
 */
export interface ParsedSql {
  /** Every statement across every source, in order, comments stripped and trimmed. */
  readonly statements: readonly string[];
  /** Created tables, keyed by unqualified name. */
  readonly tables: ReadonlyMap<string, ParsedTable>;
  /** Policies still standing at the end — a dropped policy is gone. */
  readonly policies: readonly ParsedPolicy[];
  /** Effective RLS per table, keyed by unqualified name. */
  readonly rls: ReadonlyMap<string, ParsedRls>;
  /** Tables whose RLS is enabled at the end. Derived from `rls`. */
  readonly rlsEnabled: ReadonlySet<string>;
  /** Tables whose RLS is forced at the end. Derived from `rls`. */
  readonly rlsForced: ReadonlySet<string>;
  /** Every standing policy on `table` for `command`. Several permissive ones OR together. */
  policiesFor(table: string, command: PolicyCommand): readonly ParsedPolicy[];
  /** The only policy for `command`, or `undefined`. Throws if there is more than one. */
  policyFor(table: string, command: PolicyCommand): ParsedPolicy | undefined;
  /**
   * The effective explicit state of `privilege` on `table` for `role`, across the whole set: the last
   * grant or revoke to the role, overridden by a standing grant to `public`. `table` and `role` are
   * resolved names (`food_log`, `authenticated`), not SQL as written.
   */
  privilegeState(table: string, role: string, privilege: string): PrivilegeState;
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

/**
 * A word immediately followed by `(`, with no space — `check(qty > 0)`, not `check (qty > 0)`. Real
 * migrations write both; the type scanner used to look for a token *equal to* a modifier, so
 * `check(qty > 0)` split into a token `check(qty` that matched nothing in {@link COLUMN_MODIFIERS}
 * and was read as part of the type instead (PR #173 review). Matched generally, not just for
 * `check`, so every future glued modifier fails the same way a bare one does — but only a *modifier*
 * word ends the type: `numeric(10,2)` is a type gluing itself to its own parenthesis and must stay
 * one token, so the captured word is still checked against {@link COLUMN_MODIFIERS} before it ends
 * the scan.
 */
const MODIFIER_GLUED_TO_PAREN = /^([A-Za-z]+)\(/;

/**
 * What makes a `create table` entry — or an `alter table … add` action — a table constraint rather
 * than a column. Matched on word boundaries: the old prefix list took the bare string `unique`, so a
 * column named `unique_code` was read as a constraint and vanished from the parsed table.
 */
const TABLE_CONSTRAINT =
  /^(?:constraint\s|primary\s+key\b|unique\b|check\s*\(|foreign\s+key\b|exclude\b)/i;

const squash = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** One identifier as written: a `"quoted"` one (with `""` escapes) or a plain word. */
const IDENTIFIER = '(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)';
const LEADING_IDENTIFIER = new RegExp(`^${IDENTIFIER}`);


/**
 * Resolve one identifier the way Postgres does (#130): an unquoted name folds to lower case, so
 * `Food_Log` and `FOOD_LOG` are both `food_log`; a quoted name keeps its case exactly, so `"Food_Log"`
 * is a different table. Every name used as a map key goes through here, or a mixed-case statement
 * lands under a key no check ever reads.
 */
const identifier = (raw: string): string =>
  raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw.toLowerCase();

/**
 * A dotted name as written: identifiers joined by `.`, with the whitespace (line breaks included)
 * that Postgres allows around the dot. Used as a regex fragment, it must be followed by `(?=\s|$)` or
 * a keyword, so it can never match only part of a name.
 */
const QUALIFIED_NAME = `${IDENTIFIER}(?:\\s*\\.\\s*${IDENTIFIER})*`;

/**
 * Resolve a dotted name (`public."Thing"`, `public . thing`) into its parts. Throws on anything that
 * is not one.
 */
const nameParts = (name: string): string[] => {
  const parts: string[] = [];
  let rest = name;
  for (;;) {
    const match = LEADING_IDENTIFIER.exec(rest);
    if (!match) throw new SqlSyntaxError(`not an identifier: "${name}"`, 0);
    parts.push(identifier(match[0]));
    rest = rest.slice(match[0].length).trimStart();
    if (rest.length === 0) return parts;
    if (!rest.startsWith('.')) throw new SqlSyntaxError(`not an identifier: "${name}"`, 0);
    rest = rest.slice(1).trimStart();
  }
};

const unqualified = (name: string): string => {
  const parts = nameParts(name);
  // `noUncheckedIndexedAccess` is on; `nameParts` always yields at least one part, but prove it.
  return parts[parts.length - 1] ?? name;
};

const schemaOf = (name: string): string | null => {
  const parts = nameParts(name);
  return parts.length > 1 ? (parts[0] ?? null) : null;
};

/** A name that must not be qualified, such as a policy's. */
const bareName = (name: string): string => {
  const parts = nameParts(name);
  if (parts.length !== 1) throw new SqlSyntaxError(`expected an unqualified name: "${name}"`, 0);
  return parts[0] ?? name;
};

/**
 * The four table-level constraint forms this reader records, each with an optional `constraint
 * <name>` prefix. The name is a whole identifier, quoted or not: the old `[\w"]+` could not read
 * `"my check"`, and an unreadable constraint was skipped rather than reported. Everything else —
 * `exclude`, a bare `constraint c`, a form with a trailing clause — raises (#148).
 */
const CONSTRAINT_NAME = `(?:constraint\\s+(${IDENTIFIER})\\s+)?`;
const CHECK_CONSTRAINT = new RegExp(`^${CONSTRAINT_NAME}check\\s*\\(`, 'i');
const PRIMARY_KEY_CONSTRAINT = new RegExp(`^${CONSTRAINT_NAME}primary\\s+key\\s*\\(`, 'i');
/**
 * Plain `unique (…)` only. `nulls not distinct` rejects a second NULL row that plain `unique`
 * accepts, so reading the two as the same shape would record semantics the table has not got; it is
 * not in the pattern, so it falls through to the refusal below (#148 review).
 */
const UNIQUE_CONSTRAINT = new RegExp(`^${CONSTRAINT_NAME}unique\\s*\\(`, 'i');
const FOREIGN_KEY_CONSTRAINT = new RegExp(`^${CONSTRAINT_NAME}foreign\\s+key\\s*\\(`, 'i');

/**
 * What may follow a `foreign key (…)`: the target, optional target columns, and referential actions.
 * `match full`, `deferrable`, `initially deferred` and anything else are not read — they change when
 * and how the constraint fires, and a reader that skipped them would vouch for a table it misread.
 */
const FOREIGN_KEY_TARGET = new RegExp(
  `^references\\s+(${QUALIFIED_NAME})\\s*(\\([^()]*\\))?` +
    `(?:\\s+on\\s+(?:delete|update)\\s+(?:cascade|restrict|no\\s+action|set\\s+(?:null|default)))*$`,
  'i',
);

/** A `create table (like other)` entry: no column definitions at all, so the body cannot be read. */
const LIKE_ENTRY = /^like\b/i;

/** The role every role is a member of. A privilege granted to it is held by `authenticated` too. */
const PUBLIC_ROLE = 'public';

/** One role in a `to …` / `from …` list: an identifier, optionally after the noise word `group`. */
const ROLE_SPEC = new RegExp(`^(?:group\\s+)?(${IDENTIFIER})$`, 'i');

/**
 * Read a role list strictly. Anything that is not a comma-separated list of role identifiers throws:
 * the old reader took `authenticated granted by postgres` as one role name, which silently hid the
 * grant (#131). Guessing a role name is how a check stops seeing a grant.
 */
const rolesIn = (list: string): string[] =>
  list.split(',').map((item) => {
    const match = ROLE_SPEC.exec(item.trim());
    if (!match) throw new SqlSyntaxError(`not a role list: "${list}"`, 0);
    // `"public"` is PUBLIC as well: Postgres resolves the name before it looks for the keyword.
    return identifier(match[1] as string);
  });

/**
 * A dollar-quote opener: `$$`, or a tag between dollars. Postgres's rule for the tag is an identifier's
 * (#133): a letter or underscore, then letters, digits or underscores — so `$a1$` is a tag and `$1a$`
 * is not. Postgres also allows non-ASCII letters; this reader does not, and fails closed on them.
 */
const DOLLAR_TAG = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/;

/** The text just before a `'` that makes it an `E'…'` or `U&'…'` literal: the prefix, not a word's tail. */
const ESCAPE_STRING_PREFIX = /(?:^|[^A-Za-z0-9_$])(?:[Ee]|[Uu]&)$/;
const UNICODE_NAME_PREFIX = /(?:^|[^A-Za-z0-9_$])[Uu]&$/;

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
      // Postgres lexes a comment as whitespace; dropping it would glue `security--\ndefiner` together.
      buffer += ' ';
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
      // A comment is whitespace to Postgres. Removing it outright turned `security/**/definer` into
      // `securitydefiner`, a word no check matches, on a statement Postgres reads as SECURITY DEFINER.
      buffer += ' ';
      continue;
    }

    if (ch === '"' && UNICODE_NAME_PREFIX.test(sql.slice(Math.max(0, i - 3), i))) {
      // `U&"\0070g_class"` is `pg_class` to Postgres and to no text pattern here (PR #138 re-review).
      throw new SqlSyntaxError('Unicode-escaped names (U&"…") are not read', i);
    }

    if (ch === "'" && ESCAPE_STRING_PREFIX.test(sql.slice(Math.max(0, i - 3), i))) {
      // `E'…'` honours backslash escapes and `U&'…'` has its own; lexing either as a plain literal
      // would end it in the wrong place and put body text where the reader treats it as code.
      throw new SqlSyntaxError('escape string literals (E\'…\', U&\'…\') are not read', i);
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

    // In Postgres a `$` straight after an identifier character is part of that identifier (`a$$`), not
    // a body opener; reading it as one would pair every later dollar quote wrongly.
    if (ch === '$' && !/[A-Za-z0-9_$]/.test(sql[i - 1] ?? '')) {
      const tag = DOLLAR_TAG.exec(sql.slice(i));
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

/**
 * Every inline `check (…)` on a column, read the way a table-level `check` is: the expression is
 * captured whole via balanced parentheses (so a nested-paren expression comes back intact) and never
 * parsed. `constraint <name> check (…)` immediately before the keyword names it, exactly as a
 * table-level check's name is read; anything else is left unnamed (#148, #162).
 *
 * A `check` keyword not immediately followed by `(` — the shape a real migration should never write —
 * throws instead of being silently skipped. The old reader had no field for this constraint at all,
 * which is a silent-drop, fail-open bug in its own right (#162); reading the keyword and then doing
 * nothing with it would be the same bug with a different shape.
 *
 * Scans `rest` as plain text, same as `default` and `references` above it, so it shares their one
 * known limitation: a string literal that merely *contains* the word `check` (`default 'please
 * check'`) is not distinguished from the keyword (#148 review, of the analogous case for `unique`).
 */
function columnChecks(rest: string): ParsedCheck[] {
  const checks: ParsedCheck[] = [];
  const word = /\bcheck\b/gi;
  let match: RegExpExecArray | null;
  while ((match = word.exec(rest))) {
    const afterWord = rest.slice(match.index + match[0].length);
    const opener = /^\s*\(/.exec(afterWord);
    if (!opener) {
      throw new SqlSyntaxError(
        `column check this reader does not read as check (…): "${squash(rest).slice(0, 80)}"`,
        0,
      );
    }
    const open = match.index + match[0].length + opener[0].length - 1;
    const body = parenBody(rest, open);
    const named = new RegExp(`constraint\\s+(${IDENTIFIER})\\s*$`, 'i').exec(
      rest.slice(0, match.index),
    );
    checks.push({ name: named ? bareName(named[1] as string) : null, expression: squash(body) });
    word.lastIndex = open + body.length + 2;
  }
  return checks;
}

/**
 * One column definition. The name is read as an identifier and resolved through {@link identifier}
 * (#135), so `Note` keys as `note` and `"my col"` stays one name: splitting on spaces and stripping
 * quotes made `"my col" text` a column called `my` of type `col"`, and a mixed-case column landed
 * under a key the contract check never looks at.
 */
function parseColumn(item: string): ParsedColumn {
  const named = LEADING_IDENTIFIER.exec(item);
  if (!named) {
    throw new SqlSyntaxError(`not a column definition: "${squash(item).slice(0, 80)}"`, 0);
  }
  const raw = named[0];
  const afterName = item.slice(raw.length).trimStart();
  const typeTokens: string[] = [];
  for (const token of afterName.split(' ')) {
    if (COLUMN_MODIFIERS.has(token.toLowerCase())) break;
    const glued = MODIFIER_GLUED_TO_PAREN.exec(token);
    if (glued && COLUMN_MODIFIERS.has((glued[1] as string).toLowerCase())) break;
    typeTokens.push(token);
  }
  const rest = afterName.slice(typeTokens.join(' ').length);

  // `\bdefault(?:\s+|(?=\())` (not `\bdefault\s+`, and not the too-loose `\bdefault\b\s*` that PR
  // #177's review caught) so a value glued to its parenthesis with no space — `default(0)`, the
  // spelling PR #173's re-review found (#175) — is still read as the keyword, while a bare `default`
  // still needs the whitespace it always did. `\b\s*` matched *zero* characters after any occurrence
  // of the word, including one that is not the keyword at all: `'default'` inside a `check (…)`
  // value, `collate "default"`, or `references public."default"(id)` all contain the word `default`
  // followed immediately by a quote, and `\s*` matched that with zero width, reading the quote and
  // everything after it as a bogus default. Requiring the next character to actually be whitespace
  // or `(` rules all three out, because a quote is neither.
  const defaultMatch = /\bdefault(?:\s+|(?=\())(.+?)(?=\s+(?:not null|null|references|check|primary key|unique|collate)\b|$)/i.exec(
    rest,
  );
  const referencesMatch = /\breferences\s+(.+?)(?=\s+on\s+(?:delete|update)\b|$)/i.exec(rest);

  return {
    name: identifier(raw),
    type: typeTokens.join(' ').toLowerCase(),
    // A PRIMARY KEY column is NOT NULL in Postgres whether or not it says so, and reporting it as
    // nullable would make the contract test pass on a schema that is not the one it checked.
    notNull: /\bnot\s+null\b/i.test(rest) || /\bprimary\s+key\b/i.test(rest),
    default: defaultMatch?.[1]?.trim() ?? null,
    references: referencesMatch?.[1]?.trim() ?? null,
    // Read the same way `primary key` is, and blind in the same one way: a literal `default 'unique'`
    // would trip it. That is the existing limitation of scanning `rest`, not a new one (#148 review).
    unique: /\bunique\b/i.test(rest),
    checks: columnChecks(rest),
  };
}

/**
 * The parenthesised list of a constraint, plus whatever follows its closing parenthesis. The tail is
 * what the old reader never looked at: `unique (a) with (fillfactor = 70)` and `check (a) no inherit`
 * were read as if the tail were not there.
 */
function constraintParens(item: string, match: RegExpExecArray): { body: string; tail: string } {
  const open = item.indexOf('(', match[0].length - 1);
  const body = parenBody(item, open);
  return { body, tail: item.slice(open + body.length + 2).trim() };
}

/** The parenthesised list of a key constraint, as folded column names. */
const constraintColumns = (body: string): string[] => splitItems(body).map(bareName);

/** The name of a `constraint <name> …` prefix, folded like every other name (#135), or `null`. */
const constraintName = (match: RegExpExecArray): string | null =>
  match[1] === undefined ? null : bareName(match[1]);

/** Everything a `create table` body says besides its columns. */
interface TableConstraints {
  readonly checks: ParsedCheck[];
  readonly uniques: ParsedUnique[];
  readonly foreignKeys: ParsedForeignKey[];
  readonly primaryKey: string[];
}

/**
 * One table-level constraint, recorded or refused (#148). The branch used to end in a bare
 * `continue`: `constraint t_pkey primary key (a, b)` left the table with no primary key, and a
 * `unique`, a `foreign key` or an unnamed `check` was read and thrown away. A dropped constraint is
 * the fail-open direction — the contract test then asserts over a table the reader under-read.
 */
function readTableConstraint(item: string, into: TableConstraints, where: string): void {
  const refusal = (why: string): SqlSyntaxError =>
    new SqlSyntaxError(`${where}: ${why}: "${squash(item).slice(0, 80)}"`, 0);
  const refuse = (why: string): never => {
    throw refusal(why);
  };
  const noTail = (tail: string): void => {
    if (tail.length > 0) refuse(`constraint clause this reader does not read ("${tail.slice(0, 40)}")`);
  };

  const check = CHECK_CONSTRAINT.exec(item);
  if (check) {
    const { body, tail } = constraintParens(item, check);
    noTail(tail);
    into.checks.push({ name: constraintName(check), expression: squash(body) });
    return;
  }

  const primaryKey = PRIMARY_KEY_CONSTRAINT.exec(item);
  if (primaryKey) {
    const { body, tail } = constraintParens(item, primaryKey);
    noTail(tail);
    // Postgres allows exactly one. Appending to a second would report a key the table has not got.
    if (into.primaryKey.length > 0) refuse('a second primary key');
    into.primaryKey.push(...constraintColumns(body));
    return;
  }

  const unique = UNIQUE_CONSTRAINT.exec(item);
  if (unique) {
    const { body, tail } = constraintParens(item, unique);
    noTail(tail);
    into.uniques.push({ name: constraintName(unique), columns: constraintColumns(body) });
    return;
  }

  const foreignKey = FOREIGN_KEY_CONSTRAINT.exec(item);
  if (foreignKey) {
    const { body, tail } = constraintParens(item, foreignKey);
    const target = FOREIGN_KEY_TARGET.exec(tail);
    if (!target) throw refusal('foreign key target this reader does not read');
    const targetColumns = target[2] === undefined ? '' : ` (${constraintColumns(target[2].slice(1, -1)).join(', ')})`;
    into.foreignKeys.push({
      name: constraintName(foreignKey),
      columns: constraintColumns(body),
      references: `${nameParts(target[1] as string).join('.')}${targetColumns}`,
    });
    return;
  }

  refuse('table constraint this reader does not read');
}

/**
 * `create table`, or `null` when the statement is not one. Everything inside the parentheses is a
 * column or a constraint this reader records; everything after them is a clause it refuses (#148).
 */
const CREATE_TABLE_HEAD = new RegExp(
  `^create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(${QUALIFIED_NAME})\\s*\\(`,
  'is',
);

function parseCreateTable(statement: string, origin: string): ParsedTable | null {
  const head = CREATE_TABLE_HEAD.exec(statement);
  if (!head) return null;
  const qualified = head[1] as string;
  const where = `${origin}: create table ${squash(qualified)}`;
  const open = statement.indexOf('(', head[0].length - 1);
  const body = parenBody(statement, open);
  // `partition by range (a)`, `inherits (other)`, `with (…)`, `tablespace …`: every one of them makes
  // this a different table from the one the columns describe, and every one used to be dropped.
  const trailing = statement.slice(open + body.length + 2).trim();
  if (trailing.length > 0) {
    throw new SqlSyntaxError(`${where}: trailing clause this reader does not read: "${squash(trailing).slice(0, 80)}"`, 0);
  }

  const columns: ParsedColumn[] = [];
  const constraints: TableConstraints = { checks: [], uniques: [], foreignKeys: [], primaryKey: [] };

  for (const item of splitItems(body)) {
    // `create table t (like other)` has no column definitions in it at all; the old reader made a
    // column called `like` of type `other` and vouched for a table nobody wrote.
    if (LIKE_ENTRY.test(item)) {
      throw new SqlSyntaxError(`${where}: a like clause is not read: "${squash(item).slice(0, 80)}"`, 0);
    }
    if (TABLE_CONSTRAINT.test(item)) {
      readTableConstraint(item, constraints, where);
      continue;
    }

    const column = parseColumn(item);
    columns.push(column);
    if (/\bprimary\s+key\b/i.test(item)) {
      if (constraints.primaryKey.length > 0) {
        throw new SqlSyntaxError(`${where}: a second primary key: "${squash(item).slice(0, 80)}"`, 0);
      }
      constraints.primaryKey.push(column.name);
    }
  }

  return makeTable({
    name: unqualified(qualified),
    schema: schemaOf(qualified),
    columns,
    checks: constraints.checks,
    uniques: constraints.uniques,
    foreignKeys: constraints.foreignKeys,
    primaryKey: constraints.primaryKey,
    origin,
  });
}

function makeTable(fields: Omit<ParsedTable, 'column' | 'check'>): ParsedTable {
  return {
    ...fields,
    column: (name) => fields.columns.find((c) => c.name === name),
    check: (name) => fields.checks.find((c) => c.name === name),
  };
}

/**
 * `alter table … add [column] …`, one or more comma-separated actions, every one of them an added
 * column (#132). Any other action in the list — `add constraint`, `disable row level security`, a
 * `drop` — makes the statement unmatched, and it is rejected. Returns `null` when the statement is not
 * an `add` at all.
 */
const ALTER_TABLE_ADD = new RegExp(
  `^alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(${QUALIFIED_NAME})\\s+(add\\s.*)$`,
  'is',
);
const ADD_COLUMN = /^add\s+(?:column\s+)?(if\s+not\s+exists\s+)?(.+)$/i;

function addColumns(
  statement: string,
  tables: Map<string, ParsedTable>,
  origin: string,
): boolean {
  const head = ALTER_TABLE_ADD.exec(statement);
  if (!head) return false;
  const name = unqualified(head[1] as string);
  const table = tables.get(name);
  // An unqualified name resolves through search_path, which is `public` for a migration.
  const schema = schemaOf(head[1] as string) ?? 'public';
  if (table && (table.schema ?? 'public') !== schema) {
    throw new SqlSyntaxError(`${origin}: add column on ${schema}.${name}, but ${name} was created elsewhere`, 0);
  }
  if (!table) {
    // A column on a table these migrations never created is a schema this reader cannot vouch for.
    throw new SqlSyntaxError(`${origin}: add column on table ${name}, which no migration creates`, 0);
  }

  const columns = [...table.columns];
  for (const action of splitItems(head[2] as string)) {
    const match = ADD_COLUMN.exec(action);
    const definition = match?.[2] ?? '';
    if (!match || TABLE_CONSTRAINT.test(definition)) {
      throw new SqlSyntaxError(`${origin}: unrecognised alter table action: "${action.slice(0, 80)}"`, 0);
    }
    if (/\bprimary\s+key\b/i.test(definition)) {
      throw new SqlSyntaxError(`${origin}: add column with a primary key is not read: "${action}"`, 0);
    }
    // A default or generated expression runs on every existing row while the table is rewritten.
    rejectUnsafeExpression(definition, `${origin}: add column`);
    if (!LEADING_IDENTIFIER.test(definition)) {
      throw new SqlSyntaxError(`${origin}: add column without a column name: "${action.slice(0, 80)}"`, 0);
    }
    const column = parseColumn(definition);
    if (columns.some((c) => c.name === column.name)) {
      if (match[1]) continue;
      throw new SqlSyntaxError(`${origin}: column ${name}.${column.name} is added twice`, 0);
    }
    columns.push(column);
  }
  tables.set(name, makeTable({ ...table, columns }));
  return true;
}

/**
 * `create [or replace] function`, accepted only when nothing in it can change who may read or write
 * what (#132). The whole statement — header and body — is searched, so a grant hidden in a
 * dollar-quoted body is seen. The search is by keyword, not by parse: a harmless function that merely
 * *mentions* one of these words (in a string or a comment) is rejected too. That is the fail-closed
 * direction, and the fix for it is a rename, not a loosening here.
 */
const CREATE_FUNCTION = /^create\s+(?:or\s+replace\s+)?function\s+/i;
const FUNCTION_LANGUAGES = new Set(['sql', 'plpgsql']);
/**
 * Names that reach security state without any forbidden keyword: catalog DML
 * (`update pg_catalog.pg_class set relrowsecurity = false`), a role switch spelt
 * `set_config('ro'||'le', …)`, and the catalog views. Checked in function bodies and in every
 * expression a migration itself evaluates — added-column defaults and index expressions — because
 * those run a function on existing rows during the migration (PR #138 review).
 */
const UNSAFE_EXPRESSION: readonly (readonly [RegExp, string])[] = [
  [/\bpg_[a-z0-9_]+/i, 'a pg_ catalog name'],
  [/\bset_config\b/i, 'set_config'],
  [/\binformation_schema\b/i, 'information_schema'],
  // Inside a dollar-quoted body the splitter never sees a `U&"…"`, so the pattern checks for it too.
  [/\bu&["']/i, 'a Unicode-escaped name or string'],
];

function rejectUnsafeExpression(text: string, where: string): void {
  for (const [pattern, why] of UNSAFE_EXPRESSION) {
    if (pattern.test(text)) {
      throw new SqlSyntaxError(`${where} rejected, it uses ${why}: "${squash(text).slice(0, 80)}"`, 0);
    }
  }
}

/**
 * The cost of a keyword list, accepted in review: `role` also rejects `auth.role()`, a common call in
 * Supabase function bodies. Use `auth.jwt() ->> 'role'` or rename rather than loosening this.
 */
const FUNCTION_FORBIDDEN: readonly (readonly [RegExp, string])[] = [
  ...UNSAFE_EXPRESSION,
  // `security invoker` is the default and harmless; it is removed before this list is applied.
  [/\bsecurity\b/i, 'security definer runs with its owner\'s rights'],
  [/\b(?:grant|revoke)\b/i, 'a grant or revoke'],
  [/\bpolicy\b|\brow\s+level\b/i, 'a policy or row level security change'],
  [/\b(?:alter|create|drop|truncate|comment)\b/i, 'DDL'],
  [/\bexecute\b/i, 'dynamic SQL (execute) that no reader can see into'],
  [/\b(?:role|session_authorization|authorization|owner)\b/i, 'a role or ownership change'],
];

/** The statement with every dollar-quoted body and `'…'` literal replaced by a space. Quoted names stay. */
const blankBodies = (text: string): string =>
  text.replace(/(?<![A-Za-z0-9_$])\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$|'(?:[^']|'')*'|"(?:[^"]|"")*"/g, (m) =>
    // A literal becomes `''`, not a space, so `language 'plpgsql' as` cannot read `as` as the language.
    m.startsWith('"') ? m : m.startsWith("'") ? "''" : ' ',
  );

/**
 * Returns the created function's unqualified name, or `null` when the statement is not a
 * `create function`. Only `public` (or unqualified) functions are read: replacing `auth.uid()` changes
 * what every policy means while every parsed policy still reads the same (PR #138 re-review).
 */
function checkFunction(statement: string, origin: string): string | null {
  const head = CREATE_FUNCTION.exec(statement);
  if (!head) return null;
  const rest = statement.slice(head[0].length).replace(/\bsecurity\s+invoker\b/gi, ' ');
  const fail = (why: string): never => {
    throw new SqlSyntaxError(
      `${origin}: create function rejected, ${why}: "${squash(statement).slice(0, 80)}"`,
      0,
    );
  };

  const named = new RegExp(`^(${QUALIFIED_NAME})\\s*\\(`).exec(rest);
  if (!named) return fail('its name is not read');
  const nameText = named[1] as string;
  if ((schemaOf(nameText) ?? 'public') !== 'public') fail('only functions in public are read');

  for (const [pattern, why] of FUNCTION_FORBIDDEN) if (pattern.test(rest)) fail(why);

  // The language clause is read from the header only: body text (`$$ -- language sql $$`) is a decoy,
  // and a quoted name (`language "c"`) counts. Exactly one clause, fully consumed by the strict form.
  const header = blankBodies(rest);
  const mentions = header.match(/\blanguage\b/gi) ?? [];
  // `language 'plpgsql'` (a string) is blanked with the literals and so rejected: fail closed.
  const clauses = [...header.matchAll(new RegExp(`\\blanguage\\s+(${IDENTIFIER})`, 'gi'))];
  if (/\blanguage\s+''/i.test(header)) fail('a string-form language clause is not read');
  if (mentions.length !== 1 || clauses.length !== 1) {
    fail('it needs exactly one language clause outside the body');
  }
  const raw = clauses[0]?.[1] ?? '';
  const language = identifier(raw);
  if (!FUNCTION_LANGUAGES.has(language)) fail(`language ${language} is not sql or plpgsql`);
  return unqualified(nameText);
}

/** `comment on <object> is '<text>' | null`. A comment is catalogue metadata and grants nothing. */
const COMMENT_ON = /^comment\s+on\s+[\w".\s(),]+?\s+is\s+(?:'(?:[^']|'')*'|null)$/i;

/**
 * Extensions this reader accepts. An extension runs its own install script, so an arbitrary one (for
 * example `dblink`, which can run SQL as another role) is outside what a migration check can see.
 * These only add types and functions. `cascade` is rejected: it installs dependencies not named here.
 */
const TRUSTED_EXTENSIONS = new Set(['pgcrypto', 'uuid-ossp', 'pg_trgm', 'citext']);
const CREATE_EXTENSION = new RegExp(
  `^create\\s+extension\\s+(?:if\\s+not\\s+exists\\s+)?(${IDENTIFIER})` +
    `(?:\\s+with)?(?:\\s+schema\\s+${IDENTIFIER})?(?:\\s+version\\s+(?:'[^']*'|${IDENTIFIER}))?$`,
  'i',
);

function checkExtension(statement: string, origin: string): boolean {
  if (!/^create\s+extension\b/i.test(statement)) return false;
  const match = CREATE_EXTENSION.exec(statement);
  const name = match ? identifier(match[1] as string) : null;
  if (!name || !TRUSTED_EXTENSIONS.has(name)) {
    throw new SqlSyntaxError(
      `${origin}: create extension is read only for ${[...TRUSTED_EXTENSIONS].join(', ')}, ` +
        `without cascade: "${statement.slice(0, 80)}"`,
      0,
    );
  }
  return true;
}

/**
 * The policy name and its whole table name, which must end at whitespace or the end of the statement.
 * It used to end at any word boundary, so `on public . foods` or `on public.<newline>foods` keyed the
 * policy to table `public` and a permissive policy passed unseen (PR #134 review). A name this
 * does not read whole, such as `U&"foods"`, leaves the statement unmatched, and it is rejected.
 */
const POLICY_HEAD = new RegExp(
  `^create\\s+policy\\s+(${IDENTIFIER})\\s+on\\s+(${QUALIFIED_NAME})(?=\\s|$)`,
  'i',
);

function parsePolicy(statement: string, origin: string): ParsedPolicy | null {
  const head = POLICY_HEAD.exec(statement);
  if (!head) return null;
  let rest = squash(statement.slice(head[0].length));

  // `as restrictive` precedes `for`; without this a restrictive SELECT would misread as an ALL policy.
  const mode = /^as\s+(permissive|restrictive)\b/i.exec(rest);
  if (mode) rest = rest.slice(mode[0].length).trim();

  const commandMatch = /^for\s+(\w+)\b/i.exec(rest);
  const command = (commandMatch?.[1]?.toLowerCase() ?? 'all') as PolicyCommand;
  if (!POLICY_COMMANDS.includes(command)) {
    throw new SqlSyntaxError(`unknown policy command "${command}" in ${origin}`, 0);
  }
  if (commandMatch) rest = rest.slice(commandMatch[0].length).trim();

  // Only `to`, `using` and `with check` may follow. Anything else means the head was misread, and a
  // misread policy must never be keyed to a table.
  if (rest.length > 0 && !/^(?:to|using|with\s+check)\b/i.test(rest)) {
    throw new SqlSyntaxError(`${origin}: unrecognised create policy clause: "${rest.slice(0, 80)}"`, 0);
  }

  const rolesMatch = /\bto\s+([\w",\s]+?)(?=\s+(?:using|with\s+check)\b|$)/i.exec(rest);
  const roles = rolesMatch?.[1] ? rolesIn(rolesMatch[1]) : [];

  const usingAt = /\busing\s*\(/i.exec(rest);
  const withCheckAt = /\bwith\s+check\s*\(/i.exec(rest);

  return {
    name: bareName(head[1] as string),
    table: unqualified(head[2] as string),
    command,
    roles,
    using: usingAt ? squash(parenBody(rest, usingAt.index + usingAt[0].length - 1)) : null,
    withCheck: withCheckAt
      ? squash(parenBody(rest, withCheckAt.index + withCheckAt[0].length - 1))
      : null,
    permissive: (mode?.[1] ?? 'permissive').toLowerCase() === 'permissive',
    origin,
  };
}

const CREATE_INDEX =
  /^create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?[\w".]+\s+on\s+[\w".]+\s*\(/is;
/**
 * `drop policy [if exists] <name> on <table>`. Both names are whole identifiers (#148): the old
 * `[\w"]+` was the last pattern in this reader that was not one, and it could not read `"my policy"`
 * or `public . t` at all — a drop the reader cannot see leaves a policy standing in the parse that is
 * gone from the database. (It also captured shapes no identifier takes, such as `a"b`, though
 * `bareName` threw on those rather than mis-keying them.) A name this cannot read whole leaves the
 * statement unmatched, and an unmatched statement is rejected.
 */
const DROP_POLICY = new RegExp(
  `^drop\\s+policy\\s+(?:if\\s+exists\\s+)?(${IDENTIFIER})\\s+on\\s+(${QUALIFIED_NAME})$`,
  'i',
);
/**
 * `granted by` names the grantor, not a grantee: it is matched off the end so it never reaches the
 * role list (#131). Its role is not recorded — it does not change who holds the privilege.
 */
const GRANT =
  /^grant\s+(.+?)\s+on\s+(?:table\s+)?([\w".]+)\s+to\s+(.+?)(?:\s+with\s+grant\s+option)?(?:\s+granted\s+by\s+\S+)?$/i;
/**
 * `revoke [grant option for] … on … from …`. The `grant option for` prefix is **captured**, not
 * swallowed (#135): in Postgres it takes away only the right to re-grant the privilege, and the
 * privilege of the role named stays exactly as it was. Reading it as a full revoke let a migration
 * grant DELETE, write this, and pass the contract check while every user could still delete history.
 *
 * The trailing `cascade`/`restrict` is read and not acted on (#148): a `cascade` reaches the grants
 * the named role made onward, which these migrations never make and this reader does not model.
 */
const REVOKE =
  /^revoke\s+(grant\s+option\s+for\s+)?(.+?)\s+on\s+(?:table\s+)?([\w".]+)\s+from\s+(.+?)(?:\s+granted\s+by\s+\S+)?(?:\s+(?:cascade|restrict))?$/i;

const RLS =
  /^alter\s+table\s+(?:if\s+exists\s+)?([\w".]+)\s+(enable|force|disable|no\s+force)\s+row\s+level\s+security$/i;

/** What `grant all` / `revoke all` expand to, so `grant all` visibly undoes an earlier `revoke delete`. */
const ALL_PRIVILEGES = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];

/**
 * Every name a privilege list may contain. `maintain` (Postgres 17) is accepted but left out of the
 * `all` expansion, since Supabase's Postgres may predate it — naming a privilege is not holding it.
 *
 * An unknown word throws rather than being filed under itself: `revoke grant option for delete` used
 * to leave `grant option for` sitting in the privilege list of some other misread form, where it
 * recorded nothing and no check ever noticed.
 */
const TABLE_PRIVILEGES = new Set([...ALL_PRIVILEGES, 'maintain']);

const privilegesIn = (list: string): string[] =>
  list.split(',').flatMap((item) => {
    const privilege = squash(item).toLowerCase().replace(/\s+privileges$/, '');
    if (privilege === 'all') return ALL_PRIVILEGES;
    if (!TABLE_PRIVILEGES.has(privilege)) {
      throw new SqlSyntaxError(`not a table privilege list: "${squash(list).slice(0, 80)}"`, 0);
    }
    return [privilege];
  });

type MutableRls = { -readonly [K in keyof ParsedRls]: ParsedRls[K] };

/**
 * Read a whole migration set, applying every statement in order, into the schema it leaves behind.
 * Throws `SqlSyntaxError` on any statement outside the allowlist — never skips one.
 */
export function parseMigrations(sources: readonly MigrationSource[]): ParsedSql {
  const statements: string[] = [];
  const tables = new Map<string, ParsedTable>();
  /** Keyed `table.policy` — Postgres policy names are unique per table. */
  const policies = new Map<string, ParsedPolicy>();
  const rls = new Map<string, MutableRls>();
  /** Keyed `table|role|privilege`; later statements overwrite earlier ones. */
  const privileges = new Map<string, PrivilegeState>();
  /**
   * Apply one grant or revoke. A `null` state means the statement is still read strictly — a role or
   * privilege list that is not one throws — but records nothing, which is what `revoke grant option
   * for` does to the privileges themselves (#135).
   */
  const applyPrivileges = (
    privilegeList: string,
    tableName: string,
    roleList: string,
    state: PrivilegeState | null,
  ): void => {
    const table = unqualified(tableName);
    const roles = rolesIn(roleList);
    const names = privilegesIn(privilegeList);
    if (state === null) return;
    for (const role of roles) {
      for (const privilege of names) {
        privileges.set(`${table}|${role}|${privilege}`, state);
      }
    }
  };

  /** Functions the migrations create, unqualified name -> migration. */
  const functions = new Map<string, string>();

  const rlsOf = (table: string): MutableRls => {
    let state = rls.get(table);
    if (!state) {
      state = { enabled: false, forced: false, enabledIn: null, forcedIn: null };
      rls.set(table, state);
    }
    return state;
  };

  for (const source of sources) {
    for (const statement of splitStatements(source.sql)) {
      statements.push(statement);
      const flat = squash(statement);

      const table = parseCreateTable(statement, source.name);
      if (table) {
        // Defaults, checks and generated columns run on every insert, so they follow the same rule.
        rejectUnsafeExpression(statement, `${source.name}: create table`);
        if (tables.has(table.name)) {
          throw new SqlSyntaxError(`${source.name}: table ${table.name} is created twice`, 0);
        }
        tables.set(table.name, table);
        continue;
      }

      const policy = parsePolicy(statement, source.name);
      if (policy) {
        const key = `${policy.table}.${policy.name}`;
        if (policies.has(key)) {
          throw new SqlSyntaxError(`${source.name}: policy ${key} is created twice`, 0);
        }
        policies.set(key, policy);
        continue;
      }

      const dropped = DROP_POLICY.exec(flat);
      if (dropped) {
        policies.delete(`${unqualified(dropped[2] as string)}.${bareName(dropped[1] as string)}`);
        continue;
      }

      const toggled = RLS.exec(flat);
      if (toggled) {
        const state = rlsOf(unqualified(toggled[1] as string));
        const mode = squash((toggled[2] as string).toLowerCase());
        if (mode === 'enable' || mode === 'disable') {
          state.enabled = mode === 'enable';
          state.enabledIn = source.name;
        } else {
          state.forced = mode === 'force';
          state.forcedIn = source.name;
        }
        continue;
      }

      if (CREATE_INDEX.test(statement)) {
        // An index expression or predicate is evaluated on every existing row as the index builds.
        rejectUnsafeExpression(statement, `${source.name}: create index`);
        continue;
      }
      if (addColumns(flat, tables, source.name)) continue;
      const createdFunction = checkFunction(statement, source.name);
      if (createdFunction) {
        functions.set(createdFunction, source.name);
        continue;
      }
      if (COMMENT_ON.test(flat)) continue;
      if (checkExtension(flat, source.name)) continue;

      const granted = GRANT.exec(flat);
      if (granted) {
        applyPrivileges(granted[1] as string, granted[2] as string, granted[3] as string, 'granted');
        continue;
      }

      const revoked = REVOKE.exec(flat);
      if (revoked) {
        // `revoke grant option for delete` removes the named role's right to re-grant DELETE, and
        // leaves its DELETE alone, so a privilege that was granted stays granted (#135). A trailing
        // `cascade` reaches other roles' dependent grants, which this reader does not track (#148).
        // Either way: read the statement strictly, then record nothing.
        const state = revoked[1] ? null : 'revoked';
        applyPrivileges(revoked[2] as string, revoked[3] as string, revoked[4] as string, state);
        continue;
      }

      throw new SqlSyntaxError(
        `${source.name}: unrecognised statement: this reader vouches only for create table, create ` +
          'index, alter table ... row level security or add column, create policy, drop policy, grant, ' +
          'revoke, comment on, and security-neutral create function and create extension. ' +
          `Teach it the construct with a test instead of letting it pass unread: "${flat.slice(0, 80)}"`,
        0,
      );
    }
  }

  const standing = [...policies.values()];

  // A policy that calls a function these migrations create or replace is only as strong as that
  // function's body, which the policy text does not show. Matched by unqualified name in either
  // order, so `public.uid()` shadowing `auth.uid()` on the search path is caught too.
  const CALL = new RegExp(`(${QUALIFIED_NAME})\\s*\\(`, 'g');
  for (const policy of standing) {
    for (const expression of [policy.using, policy.withCheck]) {
      for (const call of (expression ?? '').matchAll(CALL)) {
        const called = unqualified(call[1] as string);
        const createdIn = functions.get(called);
        if (createdIn) {
          throw new SqlSyntaxError(
            `policy ${policy.table}.${policy.name} calls ${called}(), which ${createdIn} creates or replaces`,
            0,
          );
        }
      }
    }
  }
  const policiesFor = (table: string, command: PolicyCommand): ParsedPolicy[] =>
    standing.filter((p) => p.table === table && p.command === command);

  return {
    statements,
    tables,
    policies: standing,
    rls,
    rlsEnabled: new Set([...rls].filter(([, state]) => state.enabled).map(([name]) => name)),
    rlsForced: new Set([...rls].filter(([, state]) => state.forced).map(([name]) => name)),
    policiesFor,
    policyFor: (table, command) => {
      const found = policiesFor(table, command);
      if (found.length > 1) {
        // Permissive policies OR together: naming one of several as "the" policy would be a lie.
        throw new SqlSyntaxError(`${found.length} ${command} policies on ${table}; use policiesFor`, 0);
      }
      return found[0];
    },
    privilegeState: (table, role, privilege) => {
      const stated = (grantee: string): PrivilegeState =>
        privileges.get(`${table}|${grantee}|${privilege.toLowerCase()}`) ?? 'unstated';
      const own = stated(role);
      // Privileges are additive: a role holds what it was granted *or* what public was granted, and
      // revoking from one does not take away the other (#131). A public revoke proves nothing about
      // the role. An unstated public is not held: Postgres grants public no table privileges, and
      // Supabase's bootstrap grants to named roles, not to public.
      if (role !== PUBLIC_ROLE && stated(PUBLIC_ROLE) === 'granted') return 'granted';
      return own;
    },
  };
}

/** Read a single migration's text. The one-file case of {@link parseMigrations}. */
export function parseSql(sql: string): ParsedSql {
  return parseMigrations([{ name: '<inline>', sql }]);
}
