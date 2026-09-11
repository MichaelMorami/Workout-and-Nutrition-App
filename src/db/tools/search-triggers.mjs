#!/usr/bin/env node
/**
 * Renders the `search_text` trigger migration from `src/db/search-fold.ts`, so the triggers are never
 * hand-typed and cannot drift from the fold the queries use. This is how
 * `0001_search_text_triggers.sql` was produced.
 *
 *   npx drizzle-kit generate --custom --name <name>
 *   node src/db/tools/search-triggers.mjs src/db/migrations/<that file>.sql [--replace]
 *   node src/db/tools/bundle-migrations.mjs
 *
 * `--replace` first drops the four existing triggers — use it for a migration that changes the fold
 * table. Imports the TypeScript module directly, so it needs Node >= 22.18 (type stripping).
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const out = args.find((arg) => !arg.startsWith('--'));
const replace = args.includes('--replace');
if (!out) {
  console.error('usage: node src/db/tools/search-triggers.mjs <migration.sql> [--replace]');
  process.exit(2);
}

const { foldSql, foodSearchSource, mealSearchSource, searchTriggerSql, SEARCH_TRIGGERS } = await import(
  new URL('../search-fold.ts', import.meta.url).href
);

const header = `-- Custom migration (drizzle-kit cannot express triggers): keeps foods.search_text and
-- meals.search_text folded with src/db/search-fold.ts, for every writer — the app, the seeder, sync
-- upserts and raw SQL alike. The WHEN guard makes each trigger a no-op when the value is already right.
--
-- If a later drizzle-kit migration rebuilds foods or meals (CREATE __new_… / DROP / RENAME), SQLite
-- drops these triggers with the old table: that migration must recreate them.
-- src/db/migrations.test.ts fails if they are missing or differ from searchTriggerSql().
`;

const statements = [
  ...(replace ? SEARCH_TRIGGERS.map(({ name }) => `DROP TRIGGER IF EXISTS \`${name}\`;`) : []),
  ...SEARCH_TRIGGERS.map((trigger) => `${searchTriggerSql(trigger)};`),
  `-- Fold every row that existed before this migration.\nUPDATE \`foods\` SET "search_text" = ${foldSql(foodSearchSource())};`,
  `UPDATE \`meals\` SET "search_text" = ${foldSql(mealSearchSource())};`,
];
statements[0] = header + statements[0];

fs.writeFileSync(out, statements.join('\n--> statement-breakpoint\n') + '\n');
console.log(`wrote ${statements.length} statements to ${path.relative(process.cwd(), path.resolve(out))}`);
