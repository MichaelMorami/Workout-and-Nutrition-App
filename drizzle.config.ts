/**
 * drizzle-kit configuration for the app schema.
 *
 *   npx drizzle-kit generate                     after changing src/db/schema.ts
 *   node src/db/tools/bundle-migrations.mjs      then refresh the bundle the phone imports
 *
 * `src/db/migrations.test.ts` fails if either step was skipped.
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
