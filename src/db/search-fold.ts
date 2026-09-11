/**
 * Accent- and case-insensitive matching in plain SQLite: no ICU, no extension, no FTS.
 *
 * One table below generates the SQL for both sides of a search:
 *   - the triggers that maintain `foods.search_text` and `meals.search_text` (a migration), and
 *   - the expression a query wraps around the user's search string.
 * Because both come from `foldSql`, a stored value and a typed query can never be folded
 * differently. `src/db/migrations.test.ts` pins the trigger SQL to this function, and
 * `src/db/schema.test.ts` pins the behaviour.
 *
 * Changing the table means a new migration that recreates the four triggers and re-folds existing
 * rows with one UPDATE. That is cheap — no table rebuild — which is why this is a trigger-maintained
 * column and not a generated one.
 *
 * Known limit: SQLite's `lower()` folds ASCII only, so case folding beyond Latin (Cyrillic, Greek)
 * is not covered. The table stays inside Latin-1 Supplement and Latin Extended-A (plus ȘșȚțƠơƯư) to
 * keep the nested `replace()` depth around 200, well under SQLite's default expression depth of 1000.
 */

/** Base letters and every precomposed letter that folds to them — upper and lower case alike. */
const LETTERS: readonly (readonly [to: string, from: string])[] = [
  ['a', 'ÀÁÂÃÄÅàáâãäåĀāĂăĄą'],
  ['ae', 'Ææ'],
  ['c', 'ÇçĆćĈĉĊċČč'],
  ['d', 'ÐðĎďĐđ'],
  ['e', 'ÈÉÊËèéêëĒēĔĕĖėĘęĚě'],
  ['g', 'ĜĝĞğĠġĢģ'],
  ['h', 'ĤĥĦħ'],
  ['i', 'ÌÍÎÏìíîïĨĩĪīĬĭĮįİı'],
  ['j', 'Ĵĵ'],
  ['k', 'Ķķ'],
  ['l', 'ĹĺĻļĽľĿŀŁł'],
  ['n', 'ÑñŃńŅņŇň'],
  ['o', 'ÒÓÔÕÖØòóôõöøŌōŎŏŐőƠơ'],
  ['oe', 'Œœ'],
  ['r', 'ŔŕŖŗŘř'],
  ['s', 'ŚśŜŝŞşŠšȘș'],
  ['ss', 'ß'],
  ['t', 'ŢţŤťŦŧȚț'],
  ['th', 'Þþ'],
  ['u', 'ÙÚÛÜùúûüŨũŪūŬŭŮůŰűŲųƯư'],
  ['w', 'Ŵŵ'],
  ['y', 'ÝýÿŶŷŸ'],
  ['z', 'ŹźŻżŽž'],
];

/**
 * Combining marks that decomposed input carries ("e" + U+0301 instead of "é"), removed outright.
 * Written as code points because the characters themselves are invisible in an editor.
 */
const COMBINING_MARKS: readonly string[] = [
  0x0300, // grave
  0x0301, // acute
  0x0302, // circumflex
  0x0303, // tilde
  0x0304, // macron
  0x0306, // breve
  0x0307, // dot above
  0x0308, // diaeresis
  0x030a, // ring above
  0x030b, // double acute
  0x030c, // caron
  0x0327, // cedilla
  0x0328, // ogonek
].map((codePoint) => String.fromCodePoint(codePoint));

/**
 * Punctuation that separates words in food names. Becomes a space, so "semi-skimmed" has a word "skimmed".
 * Includes the typographic quotes ‘ ’ (U+2018/U+2019): iOS Smart Punctuation turns a typed ' into ’ by
 * default, and "Ben & Jerry’s" named on an iPhone must match "jerry's" typed anywhere else.
 */
const WORD_BREAKS = "-/(),.&'‘’";

/** Every `[from, to]` replacement, in the order `foldSql` applies them after `lower()`. */
export const FOLD_PAIRS: readonly (readonly [from: string, to: string])[] = [
  ...LETTERS.flatMap(([to, from]) => [...from].map((char) => [char, to] as const)),
  ...COMBINING_MARKS.map((mark) => [mark, ''] as const),
  ...[...WORD_BREAKS].map((char) => [char, ' '] as const),
];

const literal = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/**
 * The SQL expression that folds `expr`: `replace(replace(lower(expr), 'À', 'a'), …)`.
 *
 *   sqlite.prepare(`select ${foldSql('?')} as folded`).get('Crème')   // { folded: 'creme' }
 */
export function foldSql(expr: string): string {
  return FOLD_PAIRS.reduce((inner, [from, to]) => `replace(${inner}, ${literal(from)}, ${literal(to)})`, `lower(${expr})`);
}

/** What a food's `search_text` folds: its name, then its brand when it has one. `row` is `new.` in a trigger. */
export const foodSearchSource = (row = ''): string => `${row}"name" || coalesce(' ' || ${row}"brand", '')`;

/** What a meal's `search_text` folds: its name. */
export const mealSearchSource = (row = ''): string => `${row}"name"`;

/** The sources as the triggers write them. */
export const FOOD_SEARCH_SOURCE: string = foodSearchSource('new.');
export const MEAL_SEARCH_SOURCE: string = mealSearchSource('new.');

/** One of the four triggers that keep `search_text` folded. */
export interface SearchTrigger {
  readonly table: 'foods' | 'meals';
  readonly name: string;
  /** The trigger event, e.g. `AFTER UPDATE OF "name", "search_text"`. */
  readonly event: string;
  /** What the trigger folds, written against `new.`. */
  readonly source: string;
}

/**
 * The triggers migration 0001 installs. `search_text` is in every `UPDATE OF` list so a writer that sets
 * it directly (a sync upsert) is corrected too; the `WHEN` guard stops the trigger re-firing on its own write.
 */
export const SEARCH_TRIGGERS: readonly SearchTrigger[] = [
  { table: 'foods', name: 'foods_search_text_insert', event: 'AFTER INSERT', source: FOOD_SEARCH_SOURCE },
  { table: 'foods', name: 'foods_search_text_update', event: 'AFTER UPDATE OF "name", "brand", "search_text"', source: FOOD_SEARCH_SOURCE },
  { table: 'meals', name: 'meals_search_text_insert', event: 'AFTER INSERT', source: MEAL_SEARCH_SOURCE },
  { table: 'meals', name: 'meals_search_text_update', event: 'AFTER UPDATE OF "name", "search_text"', source: MEAL_SEARCH_SOURCE },
];

/**
 * A trigger's `CREATE TRIGGER … END`, byte for byte as SQLite stores it in `sqlite_master.sql` (no
 * trailing `;`). `src/db/tools/search-triggers.mjs` writes the migration from this, and
 * `src/db/migrations.test.ts` compares the installed triggers against it.
 */
export function searchTriggerSql({ table, name, event, source }: SearchTrigger): string {
  return [
    `CREATE TRIGGER \`${name}\` ${event} ON \`${table}\` FOR EACH ROW`,
    `WHEN new."search_text" IS NOT ${foldSql(source)}`,
    `BEGIN`,
    `  UPDATE \`${table}\` SET "search_text" = ${foldSql(source)} WHERE rowid = new.rowid;`,
    `END`,
  ].join('\n');
}
