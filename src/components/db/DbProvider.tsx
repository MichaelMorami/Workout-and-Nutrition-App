import React from 'react';
import type { VitalsDb } from '../../db';
import { DbContext } from './db-context';

/**
 * Makes the already-migrated connection available to every screen via `useDb`
 * (src/hooks/useDb.ts). `app/_layout.tsx` is the only place that calls `openVitalsDb` and
 * `await migrateVitalsDb(...)`; by the time this mounts, `db` is ready for the first query.
 */
export function DbProvider({ db, children }: { db: VitalsDb; children: React.ReactNode }): React.JSX.Element {
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}
