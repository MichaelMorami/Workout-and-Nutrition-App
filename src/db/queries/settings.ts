/**
 * The singleton `settings` row: one fixed id, so every device that has never written one still
 * agrees which row it would be. Issue #35 shipped the read side (`getSettings`) because
 * `todayTotals` needs targets before this issue's write side existed; `updateSettings` is #36's.
 */
import { and, eq } from 'drizzle-orm';
import type { VitalsDb } from '../db';
import type { Stamp } from '../local-time';
import { settings } from '../schema';
import { VitalsDbError } from '../errors';
import type { SettingsInput, SettingsView } from '../types';

/**
 * Fixed uuid for the one `settings` row, so every device writes the same id and last-write-wins
 * resolves correctly instead of racing two singletons. Matches `test/factories.ts`'s
 * `SETTINGS_ID` byte for byte — that copy is dropped once this export lands (issue #35 acceptance
 * criteria).
 */
export const SETTINGS_ID = '00000000-0000-4000-8000-736574740000';

/** Placeholders shown before the user has entered their own targets (issue #17 contract §5). */
export const DEFAULT_SETTINGS: SettingsInput = { kcalTarget: 2000, proteinTarget: 150, weekStart: 1 };

/** The settings row, or `DEFAULT_SETTINGS` with `isDefault: true` when nothing has been written yet. */
export function getSettings(db: VitalsDb): SettingsView {
  const row = db
    .select()
    .from(settings)
    .where(and(eq(settings.id, SETTINGS_ID), eq(settings.deleted, 0)))
    .get();

  if (!row) return { ...DEFAULT_SETTINGS, isDefault: true };

  return {
    kcalTarget: row.kcalTarget,
    proteinTarget: row.proteinTarget,
    weekStart: row.weekStart,
    isDefault: false,
  };
}

function validateSettingsInput(input: SettingsInput): void {
  if (input.kcalTarget < 0) throw new VitalsDbError('invalid_input', 'kcalTarget must be >= 0');
  if (input.proteinTarget < 0) throw new VitalsDbError('invalid_input', 'proteinTarget must be >= 0');
  if (!Number.isInteger(input.weekStart) || input.weekStart < 0 || input.weekStart > 6) {
    throw new VitalsDbError('invalid_input', 'weekStart must be an integer between 0 and 6');
  }
}

/**
 * Upserts the singleton `settings` row: a partial patch over whatever is there now, or over
 * `DEFAULT_SETTINGS` when nothing has been written yet (including when the only row present is
 * tombstoned — a tombstoned row counts as not found for writes, issue #17 contract §0). Idempotent:
 * calling it again with the same patch writes the same row.
 */
export function updateSettings(db: VitalsDb, opts: Stamp & Partial<SettingsInput>): SettingsView {
  const { at, ...patch } = opts;

  return db.transaction((tx) => {
    const current = tx.select().from(settings).where(eq(settings.id, SETTINGS_ID)).get();
    const base: SettingsInput =
      current && current.deleted === 0
        ? { kcalTarget: current.kcalTarget, proteinTarget: current.proteinTarget, weekStart: current.weekStart }
        : DEFAULT_SETTINGS;
    const next: SettingsInput = { ...base, ...patch };
    validateSettingsInput(next);

    if (current) {
      tx.update(settings)
        .set({ ...next, deleted: 0, updatedAt: at })
        .where(eq(settings.id, SETTINGS_ID))
        .run();
    } else {
      tx.insert(settings)
        .values({ id: SETTINGS_ID, updatedAt: at, deleted: 0, ...next })
        .run();
    }

    return { ...next, isDefault: false };
  });
}
