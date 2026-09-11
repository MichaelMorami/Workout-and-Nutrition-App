/**
 * The contract says every query takes a `VitalsDb`. That only works if the handle the tests build
 * and the handle the phone builds are both a `VitalsDb` — otherwise #18 writes against one driver
 * and the app fails to typecheck against the other. This file is mostly a compile-time proof.
 */
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { makeTestDb } from '../../test/db';
import type { VitalsDb, VitalsSchema } from './db';
import * as schema from './schema';

/** A stand-in for any query function in the contract. */
function countFoods(db: VitalsDb): number {
  return db.select().from(schema.foods).all().length;
}

/** Never called: it exists so `tsc` proves the phone's handle is accepted too. */
export function acceptsThePhoneHandle(db: ExpoSQLiteDatabase<VitalsSchema>): number {
  return countFoods(db);
}

describe('VitalsDb', () => {
  it('is satisfied by the better-sqlite3 handle the tests use', () => {
    const { db } = makeTestDb({ schema });
    expect(countFoods(db)).toBe(0);
  });

  it('is satisfied by the expo-sqlite handle the phone uses', () => {
    expect(typeof acceptsThePhoneHandle).toBe('function');
  });
});
