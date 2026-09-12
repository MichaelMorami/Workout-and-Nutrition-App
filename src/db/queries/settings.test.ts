/**
 * `getSettings` — the read side of the singleton settings row (issue #35). `updateSettings` is
 * issue #36's; only the id and the default-targets contract are proven here.
 */
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../../test/db';
import * as schema from '../schema';
import { DEFAULT_SETTINGS, getSettings, SETTINGS_ID } from './settings';

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
