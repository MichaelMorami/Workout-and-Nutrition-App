/**
 * Row factories: sensible defaults, every field overridable.
 *
 *   const food = makeFood({ name: 'Skyr', kcalPerServing: 120 });
 *   await db.insert(schema.foods).values(makeLogEntry({ localDate: '2025-03-09', kcal: 400 }));
 *
 * Every default is deterministic — ids come from a counter, timestamps from the frozen clock — so
 * two runs of the same test produce byte-identical rows. `test/setup/` resets the counter before
 * each test, so ids restart at 1 in every test and a snapshot stays stable.
 */
import { localDateOf, wallClockAt } from './local-date';
import type {
  BodyMetric,
  Exercise,
  Food,
  FoodLogEntry,
  Meal,
  MealItem,
  MealSlot,
  Routine,
  RoutineItem,
  Session,
  Settings,
  SyncFields,
  SyncState,
  WorkoutSet,
} from './model';

/** Every factory takes a partial of its row and returns the whole row. */
export type Factory<T> = (overrides?: Partial<T>) => T;

let counter = 0;

/**
 * A deterministic, uuid-shaped id. Real enough for a `text` primary key, stable enough to assert on.
 *
 *   testId('food') -> '00000001-0000-4000-8000-666f6f640000'
 */
export function testId(prefix = 'row'): string {
  counter += 1;
  const n = counter.toString(16).padStart(8, '0');
  const tag = [...prefix]
    .slice(0, 4)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .padEnd(8, '0');
  return `${n}-0000-4000-8000-${tag}0000`;
}

/** Restart the id counter. `test/setup/` calls this before every test. */
export function resetFactories(): void {
  counter = 0;
}

/** How many ids have been handed out — useful when asserting a factory was not called twice. */
export function factoryCounter(): number {
  return counter;
}

function sync(prefix: string, overrides: Partial<SyncFields> = {}): SyncFields {
  return {
    id: overrides.id ?? testId(prefix),
    updatedAt: overrides.updatedAt ?? Date.now(),
    deleted: overrides.deleted ?? 0,
  };
}

export const makeFood: Factory<Food> = (overrides = {}) => ({
  ...sync('food', overrides),
  name: 'Greek yoghurt',
  brand: null,
  servingLabel: '1 pot',
  servingGrams: 170,
  kcalPerServing: 133,
  proteinPerServing: 17,
  useCount: 0,
  lastUsedAt: null,
  hourHistogram: null,
  archived: 0,
  ...overrides,
});

export const makeMeal: Factory<Meal> = (overrides = {}) => ({
  ...sync('meal', overrides),
  name: 'Usual breakfast',
  ...overrides,
});

export const makeMealItem: Factory<MealItem> = (overrides = {}) => ({
  ...sync('mitm', overrides),
  mealId: overrides.mealId ?? testId('meal'),
  foodId: overrides.foodId ?? testId('food'),
  qty: 1,
  ...overrides,
});

/**
 * A log entry. `kcal`/`protein` are literal values — invariant #2 — so the default is a plausible
 * number rather than a lookup, and `localDate` is derived from `loggedAt` **in the user's
 * timezone**, never from the UTC timestamp.
 *
 * `foodId` defaults to `null`, not to an invented id: the column is nullable, a log row is a
 * self-contained fact about the past, and a fabricated foreign key would make the default row
 * un-insertable under the `PRAGMA foreign_keys = ON` the harness runs with. Pass a real food's id
 * when the link is what the test is about.
 */
export const makeLogEntry: Factory<FoodLogEntry> = (overrides = {}) => {
  const loggedAt = overrides.loggedAt ?? Date.now();
  // `localDate` and `localMinute` are both derived from `loggedAt` through the process's current
  // timezone (see `localDateOf` and `wallClockAt` in `./local-date`) — the same zone, by
  // construction, so the two never disagree about which wall clock the row belongs to.
  const wallClock = wallClockAt(loggedAt);
  return {
    ...sync('flog', overrides),
    loggedAt,
    localDate: overrides.localDate ?? localDateOf(loggedAt),
    localMinute: overrides.localMinute ?? wallClock.hour * 60 + wallClock.minute,
    foodId: null,
    qty: 1,
    kcal: 133,
    protein: 17,
    slot: 'breakfast' satisfies MealSlot,
    ...overrides,
  };
};

export const makeExercise: Factory<Exercise> = (overrides = {}) => ({
  ...sync('exer', overrides),
  name: 'Back squat',
  muscleGroup: 'legs',
  unit: 'kg',
  ...overrides,
});

export const makeRoutine: Factory<Routine> = (overrides = {}) => ({
  ...sync('rout', overrides),
  name: 'Lower A',
  ...overrides,
});

export const makeRoutineItem: Factory<RoutineItem> = (overrides = {}) => ({
  ...sync('ritm', overrides),
  routineId: overrides.routineId ?? testId('rout'),
  exerciseId: overrides.exerciseId ?? testId('exer'),
  orderIndex: 0,
  targetSets: 3,
  ...overrides,
});

export const makeSession: Factory<Session> = (overrides = {}) => {
  const startedAt = overrides.startedAt ?? Date.now();
  return {
    ...sync('sess', overrides),
    startedAt,
    endedAt: startedAt + 62 * 60_000,
    localDate: overrides.localDate ?? localDateOf(startedAt),
    routineId: null,
    notes: null,
    ...overrides,
  };
};

export const makeSet: Factory<WorkoutSet> = (overrides = {}) => ({
  ...sync('set', overrides),
  sessionId: overrides.sessionId ?? testId('sess'),
  exerciseId: overrides.exerciseId ?? testId('exer'),
  setIndex: 0,
  reps: 8,
  weight: 60,
  rpe: 8,
  isWarmup: 0,
  ...overrides,
});

export const makeBodyMetric: Factory<BodyMetric> = (overrides = {}) => {
  const measuredAt = overrides.measuredAt ?? Date.now();
  return {
    ...sync('body', overrides),
    measuredAt,
    localDate: overrides.localDate ?? localDateOf(measuredAt),
    weight: 82.4,
    bodyFatPct: 18.5,
    waist: 84,
    chest: 102,
    arm: 36,
    ...overrides,
  };
};

/**
 * The fixed uuid every device writes the singleton `settings` row under (issue #17 contract, §2:
 * `SETTINGS_ID`) — decision 3 keeps the id a uuid with no exceptions, rather than the literal
 * `'settings'` the old fixture used.
 *
 * `src/db/schema.ts` does not export a `SETTINGS_ID` yet — the domain constants in §2 of the
 * contract land with the query layer in #18 — so this is the same fixed value, defined once here.
 * Swap this for `import { SETTINGS_ID } from '@/src/db'` the day that lands.
 */
export const SETTINGS_ID = '00000000-0000-4000-8000-736574740000';

export const makeSettings: Factory<Settings> = (overrides = {}) => ({
  ...sync('sett', overrides),
  id: overrides.id ?? SETTINGS_ID,
  kcalTarget: 2400,
  proteinTarget: 170,
  weekStart: 1,
  ...overrides,
});

export const makeSyncState: Factory<SyncState> = (overrides = {}) => ({
  ...sync('sync', overrides),
  id: overrides.id ?? 'food_log',
  tableName: 'food_log',
  lastPulledAt: null,
  lastPushedAt: null,
  ...overrides,
});

/** `makeMany(makeSet, 3, (i) => ({ setIndex: i }))` — n rows with the index woven in. */
export function makeMany<T>(
  factory: Factory<T>,
  count: number,
  overrides: Partial<T> | ((index: number) => Partial<T>) = {},
): T[] {
  return Array.from({ length: count }, (_, i) =>
    factory(typeof overrides === 'function' ? overrides(i) : overrides),
  );
}

/** Tombstone a row the way the app must: flag it, bump `updated_at`, keep it. Invariant #3. */
export function tombstone<T extends SyncFields>(row: T, at: number = Date.now()): T {
  return { ...row, deleted: 1, updatedAt: at };
}
