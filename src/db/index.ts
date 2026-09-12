/**
 * The public surface of `src/db`. Every consumer — `ui-engineer`, `charts-engineer`,
 * `sync-engineer` — imports from `@/src/db`, never from a file inside it (issue #17 contract).
 *
 * #36 (catalogue, meals, settings writes, weightSummary) landed below without touching #35's
 * exports. #37 (search, recents, create-and-log) adds its own exports here in turn.
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
  FoodInput,
  LogAmount,
  LogReceipt,
  MealCandidate,
  MealDetail,
  MealItemInput,
  MealSummary,
  SettingsInput,
  SettingsView,
  UndoToken,
  WeighIn,
  WeightSummary,
} from './types';

// Settings: read side (#35) and the singleton upsert (#36).
export { DEFAULT_SETTINGS, getSettings, SETTINGS_ID, updateSettings } from './queries/settings';

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

// Catalogue and meals — createFood/updateFood/setFoodArchived/getFood/listFoods and
// createMeal/listMeals/getMeal (#36).
export {
  createFood,
  createMeal,
  getFood,
  getMeal,
  listFoods,
  listMeals,
  setFoodArchived,
  updateFood,
} from './queries/catalog';

// The Today weight chip (#36).
export { weightSummary } from './queries/weight';

// Search, recents and create-and-log (#37).
export { createFoodAndLog, recentFoods, searchFoods } from './queries/search';
