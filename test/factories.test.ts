/**
 * The factories' contract: sensible defaults, everything overridable, and the same bytes every run.
 *
 * A factory whose defaults drift is worse than no factory — it turns an unrelated test red and
 * sends someone hunting through the wrong file.
 */
import {
  factoryCounter,
  makeBodyMetric,
  makeExercise,
  makeFood,
  makeLogEntry,
  makeMany,
  makeMeal,
  makeMealItem,
  makeRoutine,
  makeRoutineItem,
  makeSession,
  makeSet,
  makeSettings,
  makeSyncState,
  resetFactories,
  SETTINGS_ID,
  testId,
  tombstone,
  type Factory,
} from './factories';
import { isLocalDate } from './local-date';
import type { SyncFields } from './model';
import { advanceTime, FROZEN_NOW, setLocalTime, withTimezone } from './time';

/** Every table in `docs/data-model.md` and the factory that covers it. */
const ALL_FACTORIES: [string, Factory<SyncFields>][] = [
  ['foods', makeFood as Factory<SyncFields>],
  ['meals', makeMeal as Factory<SyncFields>],
  ['meal_items', makeMealItem as Factory<SyncFields>],
  ['food_log', makeLogEntry as Factory<SyncFields>],
  ['exercises', makeExercise as Factory<SyncFields>],
  ['routines', makeRoutine as Factory<SyncFields>],
  ['routine_items', makeRoutineItem as Factory<SyncFields>],
  ['sessions', makeSession as Factory<SyncFields>],
  ['sets', makeSet as Factory<SyncFields>],
  ['body_metrics', makeBodyMetric as Factory<SyncFields>],
  ['settings', makeSettings as Factory<SyncFields>],
  ['sync_state', makeSyncState as Factory<SyncFields>],
];

describe('every table in the data model', () => {
  it.each(ALL_FACTORIES)('has a factory: %s', (_table, factory) => {
    expect(typeof factory).toBe('function');
  });

  it.each(ALL_FACTORIES)('%s rows carry the three sync fields', (_table, factory) => {
    const row = factory();
    expect(typeof row.id).toBe('string');
    expect(row.id.length).toBeGreaterThan(0);
    expect(typeof row.updatedAt).toBe('number');
    expect(row.deleted).toBe(0);
  });

  it.each(ALL_FACTORIES)('%s rows are stamped with the frozen clock, not real time', (_table, factory) => {
    expect(factory().updatedAt).toBe(FROZEN_NOW);
  });

  it.each(ALL_FACTORIES)('%s rows let every field be overridden', (_table, factory) => {
    const base = factory();
    const overrides = Object.fromEntries(
      Object.entries(base).map(([key, value]) => [
        key,
        typeof value === 'number' ? value + 1 : typeof value === 'string' ? `${value}!` : value === null ? 0 : value,
      ]),
    );
    expect(factory(overrides)).toEqual(overrides);
  });
});

describe('factory defaults', () => {
  it('describe a plausible food rather than lorem ipsum', () => {
    // Defaults get read in failure output. "Greek yoghurt, 1 pot, 170 g" tells you something;
    // "string-1, 0" does not. The stored numbers are per-100 (issue #86); asserting the serving
    // they came from — 133 kcal / 17 g protein over a 170 g pot — round-trips through
    // `src/db/servings.ts`'s own formula rather than pinning a long decimal here.
    const food = makeFood();
    expect(food).toMatchObject({
      name: 'Greek yoghurt',
      brand: null,
      basis: 'weight',
      servingLabel: '1 pot',
      servingAmount: 170,
      archived: 0,
    });
    expect((food.kcalPer100 * food.servingAmount) / 100).toBeCloseTo(133, 6);
    expect((food.proteinPer100 * food.servingAmount) / 100).toBeCloseTo(17, 6);
  });

  it('put a log entry on the user’s calendar day, derived from its own timestamp', () => {
    withTimezone('America/Los_Angeles', () => {
      const entry = makeLogEntry();
      expect(isLocalDate(entry.localDate)).toBe(true);
      expect(entry).toBeOnLocalDate('2025-03-09');
    });
    // Same instant, a user on the other side of the date line: the next day.
    withTimezone('Pacific/Auckland', () => {
      expect(makeLogEntry()).toBeOnLocalDate('2025-03-10');
    });
  });

  it('follow an overridden loggedAt to the day it actually falls on', () => {
    const at = setLocalTime('2024-12-31', '23:55');
    expect(makeLogEntry({ loggedAt: at })).toBeOnLocalDate('2024-12-31');
  });

  it('leave food_log.food_id null so the row is insertable and self-contained', () => {
    // Invariant #2: a log is a fact, not a join. It must not need a catalogue row to exist.
    expect(makeLogEntry().foodId).toBeNull();
  });

  it('give a session a plausible duration rather than a zero-length one', () => {
    const session = makeSession();
    expect(session.endedAt).not.toBeNull();
    expect((session.endedAt ?? 0) - session.startedAt).toBe(62 * 60_000);
  });

  it('give settings the stable singleton id the app expects', () => {
    expect(makeSettings().id).toBe(SETTINGS_ID);
  });
});

describe('factory ids', () => {
  it('are unique within a test', () => {
    const ids = makeMany(makeFood, 50).map((f) => f.id);
    expect(new Set(ids).size).toBe(50);
  });

  it('restart from the same place in every test, so a snapshot stays stable', () => {
    // `test/setup/common.ts` resets before each test; this asserts the reset is real.
    expect(factoryCounter()).toBe(0);
    const first = makeFood().id;
    resetFactories();
    expect(makeFood().id).toBe(first);
  });

  it('are shaped like the uuid the column stores', () => {
    expect(testId('food')).toMatch(/^[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}$/);
  });

  it('do not collide between tables', () => {
    resetFactories();
    const food = makeFood().id;
    resetFactories();
    expect(makeSession().id).not.toBe(food);
  });
});

describe('makeMany', () => {
  it('weaves the index into each row', () => {
    const sets = makeMany(makeSet, 3, (i) => ({ setIndex: i, reps: 10 - i }));
    expect(sets.map((s) => [s.setIndex, s.reps])).toEqual([
      [0, 10],
      [1, 9],
      [2, 8],
    ]);
  });

  it('returns nothing for a count of zero', () => {
    expect(makeMany(makeFood, 0)).toEqual([]);
  });
});

describe('tombstone', () => {
  it('flags the row and bumps updated_at without removing anything', () => {
    // Invariant #3. Last-write-wins is keyed on `updated_at`, so a tombstone that does not move it
    // loses to the edit it is supposed to beat.
    const food = makeFood({ name: 'Skyr' });
    advanceTime(5_000);
    const dead = tombstone(food);

    expect(dead).toMatchObject({ id: food.id, name: 'Skyr', deleted: 1 });
    expect(dead.updatedAt).toBe(FROZEN_NOW + 5_000);
    expect(food.deleted).toBe(0); // the original is untouched
  });
});
