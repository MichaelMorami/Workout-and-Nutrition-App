/**
 * The singleton settings row: `getSettings` (issue #35, read side) and `updateSettings` (issue #36,
 * the upsert).
 */
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../../test/db';
import { VitalsDbError, type VitalsDbErrorCode } from '../errors';
import * as schema from '../schema';
import { DEFAULT_SETTINGS, getSettings, SETTINGS_ID, updateSettings } from './settings';

/** Every write throws `VitalsDbError`, never a raw `Error` — assert the code, not just "it threw". */
function expectDbError(fn: () => unknown, code: VitalsDbErrorCode): void {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(VitalsDbError);
  expect((caught as VitalsDbError).code).toBe(code);
}

describe('getSettings', () => {
  it('on an empty database, returns DEFAULT_SETTINGS with isDefault true', () => {
    const { db } = makeTestDb({ schema });
    expect(getSettings(db)).toEqual({ ...DEFAULT_SETTINGS, isDefault: true });
  });

  it('DEFAULT_SETTINGS matches the contract placeholders exactly', () => {
    expect(DEFAULT_SETTINGS).toEqual({ kcalTarget: 2000, proteinTarget: 150, weekStart: 1 });
  });

  it('reads the written row by SETTINGS_ID, with isDefault false', () => {
    const { db } = makeTestDb({ schema });
    db.insert(schema.settings)
      .values({ id: SETTINGS_ID, updatedAt: 1, deleted: 0, kcalTarget: 2500, proteinTarget: 180, weekStart: 0 })
      .run();

    expect(getSettings(db)).toEqual({ kcalTarget: 2500, proteinTarget: 180, weekStart: 0, isDefault: false });
  });

  it('a tombstoned settings row is excluded — reads back as default', () => {
    const { db } = makeTestDb({ schema });
    db.insert(schema.settings)
      .values({ id: SETTINGS_ID, updatedAt: 1, deleted: 1, kcalTarget: 2500, proteinTarget: 180, weekStart: 0 })
      .run();

    expect(getSettings(db)).toEqual({ ...DEFAULT_SETTINGS, isDefault: true });
  });

  it('SETTINGS_ID is a fixed uuid, not a human-readable literal like "settings"', () => {
    expect(SETTINGS_ID).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('ignores a row at a different id — SETTINGS_ID is the only settings row read', () => {
    const { db } = makeTestDb({ schema });
    const otherId = '11111111-0000-4000-8000-000000000000';
    db.insert(schema.settings).values({ id: otherId, updatedAt: 1, deleted: 0, kcalTarget: 3000, proteinTarget: 200, weekStart: 1 }).run();

    expect(getSettings(db)).toEqual({ ...DEFAULT_SETTINGS, isDefault: true });
    // Sanity: the row really is there under its own id.
    expect(db.select().from(schema.settings).where(eq(schema.settings.id, otherId)).get()?.kcalTarget).toBe(3000);
  });
});

describe('updateSettings', () => {
  it('on an empty database, inserts the singleton row from DEFAULT_SETTINGS plus the patch', () => {
    const { db } = makeTestDb({ schema });
    const view = updateSettings(db, { at: 1_000, kcalTarget: 2500 });

    expect(view).toEqual({ ...DEFAULT_SETTINGS, kcalTarget: 2500, isDefault: false });
    const row = db.select().from(schema.settings).where(eq(schema.settings.id, SETTINGS_ID)).get();
    expect(row).toMatchObject({ id: SETTINGS_ID, updatedAt: 1_000, deleted: 0, kcalTarget: 2500, proteinTarget: DEFAULT_SETTINGS.proteinTarget });
  });

  it('isDefault flips to false after the first write', () => {
    const { db } = makeTestDb({ schema });
    expect(getSettings(db).isDefault).toBe(true);

    updateSettings(db, { at: 1_000, kcalTarget: 2200 });

    expect(getSettings(db).isDefault).toBe(false);
  });

  it('a partial patch merges onto the existing row, leaving other fields untouched', () => {
    const { db } = makeTestDb({ schema });
    updateSettings(db, { at: 1_000, kcalTarget: 2200, proteinTarget: 160, weekStart: 0 });

    const view = updateSettings(db, { at: 2_000, proteinTarget: 180 });

    expect(view).toEqual({ kcalTarget: 2200, proteinTarget: 180, weekStart: 0, isDefault: false });
  });

  it('is idempotent: calling it twice with the same patch writes the same row, no error', () => {
    const { db } = makeTestDb({ schema });
    updateSettings(db, { at: 1_000, kcalTarget: 2200, proteinTarget: 160, weekStart: 1 });
    const second = updateSettings(db, { at: 2_000, kcalTarget: 2200, proteinTarget: 160, weekStart: 1 });

    expect(second).toEqual({ kcalTarget: 2200, proteinTarget: 160, weekStart: 1, isDefault: false });
    expect(db.select().from(schema.settings).all()).toHaveLength(1);
  });

  it('bumps updated_at to the given at on every write', () => {
    const { db } = makeTestDb({ schema });
    updateSettings(db, { at: 1_000, kcalTarget: 2200 });
    updateSettings(db, { at: 2_000, kcalTarget: 2300 });

    const row = db.select().from(schema.settings).where(eq(schema.settings.id, SETTINGS_ID)).get();
    expect(row?.updatedAt).toBe(2_000);
  });

  it('writing over a tombstoned row un-tombstones it — a tombstoned row counts as not found for writes', () => {
    const { db } = makeTestDb({ schema });
    db.insert(schema.settings)
      .values({ id: SETTINGS_ID, updatedAt: 1, deleted: 1, kcalTarget: 3000, proteinTarget: 200, weekStart: 1 })
      .run();

    const view = updateSettings(db, { at: 2_000, kcalTarget: 2000 });

    expect(view).toEqual({ ...DEFAULT_SETTINGS, kcalTarget: 2000, isDefault: false });
    const row = db.select().from(schema.settings).where(eq(schema.settings.id, SETTINGS_ID)).get();
    expect(row?.deleted).toBe(0);
  });

  it('rejects a negative kcalTarget', () => {
    const { db } = makeTestDb({ schema });
    expectDbError(() => updateSettings(db, { at: 1_000, kcalTarget: -1 }), 'invalid_input');
  });

  it('rejects a negative proteinTarget', () => {
    const { db } = makeTestDb({ schema });
    expectDbError(() => updateSettings(db, { at: 1_000, proteinTarget: -1 }), 'invalid_input');
  });

  it('rejects a weekStart outside 0..6', () => {
    const { db } = makeTestDb({ schema });
    expectDbError(() => updateSettings(db, { at: 1_000, weekStart: 7 }), 'invalid_input');
    expectDbError(() => updateSettings(db, { at: 1_000, weekStart: -1 }), 'invalid_input');
  });
});
