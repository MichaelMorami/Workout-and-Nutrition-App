/**
 * FIXTURE ONLY. Generates `test/fixtures/migrations/` from `test/fixtures/schema.ts` so the harness
 * can prove it applies *real* drizzle-kit migrations, not hand-rolled DDL.
 *
 *   npx drizzle-kit generate --config test/fixtures/drizzle.config.ts
 *
 * The app's own `drizzle.config.ts` at the repo root belongs to `db-engineer`. Delete this file
 * together with the rest of `test/fixtures/` once `src/db/schema.ts` exists.
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './test/fixtures/schema.ts',
  out: './test/fixtures/migrations',
});
