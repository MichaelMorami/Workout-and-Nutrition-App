/**
 * Row shapes, transcribed from `docs/data-model.md`.
 *
 * Deliberately independent of the Drizzle schema: the factories and the seeder have to work before
 * `src/db/schema.ts` exists, and they have to keep working when it changes shape. These types are
 * the *contract* — if `db-engineer`'s schema and these disagree, `db.insert(...).values(makeFood())`
 * stops type-checking, which is exactly the alarm we want.
 *
 * Property names are camelCase (Drizzle's TS side); the columns underneath are snake_case.
 */

/** Every table carries these, so the sync engine can treat them uniformly. Invariant #3. */
export interface SyncFields {
  id: string;
  /** ms epoch. Last-write-wins is keyed on this. */
  updatedAt: number;
  /** Tombstone: `1` means deleted. Rows are never removed. */
  deleted: number;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ExerciseUnit = 'kg' | 'lb' | 'bodyweight' | 'time';
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms'
  | 'core'
  | 'full body';

/**
 * How a food is measured (issue #86): `'weight'` means grams, `'volume'` means millilitres — the
 * two canonical food units. Kept independent of `src/db/schema.ts`'s own `FoodBasis`, for the same
 * reason the rest of this file is: this is the contract, not a re-export of the implementation.
 */
export type FoodBasis = 'weight' | 'volume';

/**
 * A catalogue food, stored per 100 g or per 100 ml (issue #86, client ruling 1). There is no
 * per-serving field here on purpose — `kcalPerServing`/`proteinPerServing`/`servingGrams` are
 * derived at read time (`src/db/servings.ts`) and never stored, so nothing in this contract can
 * drift from the number a correction just changed.
 */
export interface Food extends SyncFields {
  name: string;
  brand: string | null;
  /** Which canonical unit this food is measured in: grams or millilitres. */
  basis: FoodBasis;
  /** What one serving is called: "1 pot", "1 scoop", "100 g". */
  servingLabel: string;
  /** One serving in the canonical unit of `basis`. Always > 0. */
  servingAmount: number;
  /** kcal per 100 g, or per 100 ml — whichever `basis` says. */
  kcalPer100: number;
  /** Protein (g) per 100 g, or per 100 ml. */
  proteinPer100: number;
  useCount: number;
  lastUsedAt: number | null;
  /** 24 counts, one per hour — the quick-add grid ranks on it. */
  hourHistogram: string | null;
  archived: number;
}

export interface Meal extends SyncFields {
  name: string;
}

export interface MealItem extends SyncFields {
  mealId: string;
  foodId: string;
  qty: number;
}

/** A fact about the past: `kcal` and `protein` are literal copies, never a join. Invariant #2. */
export interface FoodLogEntry extends SyncFields {
  loggedAt: number;
  localDate: string;
  /**
   * Minutes after local midnight (0–1439) at `loggedAt`, in the zone the user was in. Feeds the
   * hour histogram (§1.3/§1.4 of the issue #17 contract); unrecoverable from `loggedAt` alone once
   * the user has travelled or a DST change has passed.
   */
  localMinute: number;
  foodId: string | null;
  qty: number;
  kcal: number;
  protein: number;
  slot: MealSlot;
}

export interface Exercise extends SyncFields {
  name: string;
  muscleGroup: MuscleGroup;
  unit: ExerciseUnit;
}

export interface Routine extends SyncFields {
  name: string;
}

export interface RoutineItem extends SyncFields {
  routineId: string;
  exerciseId: string;
  orderIndex: number;
  targetSets: number;
}

export interface Session extends SyncFields {
  startedAt: number;
  endedAt: number | null;
  localDate: string;
  routineId: string | null;
  notes: string | null;
}

export interface WorkoutSet extends SyncFields {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  reps: number;
  weight: number;
  rpe: number | null;
  isWarmup: number;
}

export interface BodyMetric extends SyncFields {
  /** UTC instant of the measurement, ms epoch, beside `localDate`. */
  measuredAt: number;
  localDate: string;
  weight: number;
  bodyFatPct: number | null;
  waist: number | null;
  chest: number | null;
  arm: number | null;
}

/** No `weightUnit` / `lengthUnit`: canonical units only (Checkpoint 1 decision 3, docs/decisions.md). */
export interface Settings extends SyncFields {
  kcalTarget: number;
  proteinTarget: number;
  /** 0 = Sunday, 1 = Monday. */
  weekStart: number;
}

/** One row per table, tracking how far sync has got. Not seeded — it is sync's own bookkeeping. */
export interface SyncState extends SyncFields {
  tableName: string;
  lastPulledAt: number | null;
  lastPushedAt: number | null;
}

/** Every table the seeder produces, keyed by the export name a Drizzle schema is expected to use. */
export interface SeedData {
  foods: Food[];
  meals: Meal[];
  mealItems: MealItem[];
  foodLog: FoodLogEntry[];
  exercises: Exercise[];
  routines: Routine[];
  routineItems: RoutineItem[];
  sessions: Session[];
  sets: WorkoutSet[];
  bodyMetrics: BodyMetric[];
  settings: Settings[];
}
