/**
 * The singleton `settings` row: one fixed id, so every device that has never written one still
 * agrees which row it would be. `updateSettings` (the write side) is issue #36's — this is read
 * only, because `todayTotals` needs targets and #35 ships before #36 does.
 */
import { and, eq } from 'drizzle-orm';
import type { VitalsDb } from '../db';
import { settings } from '../schema';
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
