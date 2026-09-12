import { useContext } from 'react';
import { DbContext } from '../components/db/db-context';
import type { VitalsDb } from '../db';

/** The single way any screen reads the migrated database connection. Throws outside a
 * `DbProvider` instead of returning `undefined` — a screen that queries before migration is a
 * startup bug to fix, not a null to check for on every call site. */
export function useDb(): VitalsDb {
  const db = useContext(DbContext);
  if (!db) {
    throw new Error('useDb must be used within a DbProvider');
  }
  return db;
}
