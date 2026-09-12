/**
 * The public surface of `src/db`. Every consumer — `ui-engineer`, `charts-engineer`,
 * `sync-engineer` — imports from `@/src/db`, never from a file inside it (issue #17 contract).
 *
 * Grows as sibling issues land: #36 (catalogue, meals, settings writes, weightSummary) and #37
 * (search, recents, create-and-log) add their own exports here without touching #35's.
 */

// Schema: tables and row types.
export * from './schema';

// The handle type every query function takes.
export type { VitalsDb, VitalsSchema } from './db';

// Errors.
export { VitalsDbError } from './errors';
export type { VitalsDbErrorCode } from './errors';

// Time: the only place a UTC instant becomes a local day or minute.
export { inferSlot, localDateOf, localStamp } from './local-time';
export type { LocalDate, Stamp, When } from './local-time';

// The usage cache codec (the recompute functions are internal — every write that needs one calls
// it itself; nothing outside `src/db` recomputes a cache directly).
export { parseHourHistogram } from './usage';
export type { HourHistogram } from './usage';

// Domain types (issue #17 contract §2).
export type {
  Amount,
  Candidate,
  CandidateRef,
  DayLogEntry,
  DayTotals,
  FoodCandidate,
  LogAmount,
  LogReceipt,
  MealCandidate,
  SettingsInput,
  SettingsView,
  UndoToken,
} from './types';

// Settings (read side — #35). `updateSettings` lands with #36.
export { DEFAULT_SETTINGS, getSettings, SETTINGS_ID } from './queries/settings';

// Nutrition: read side, logging, portions, undo (#35).
export {
  addPortion,
  dayLog,
  logFood,
  logMeal,
  quickAddCandidates,
  softDeleteLogEntries,
  todayTotals,
  undo,
  updateLogEntry,
} from './queries/nutrition';
