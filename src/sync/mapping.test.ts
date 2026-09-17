/**
 * Issue #114 — the row mapping between the local Drizzle schema and the remote contract.
 *
 * Table-driven over fixtures, because every bug this catches is a silently wrong *value*, not a
 * crash: a volume food that arrives back as grams, a tombstone that resurrects, a 23:30 meal that
 * lands on tomorrow. Each acceptance bullet of #114 has a named test below.
 *
 * The mapping is pure: no Supabase client, no fetch, no clock. That is what lets it be tested in
 * microseconds and what keeps the app off the network on the write path.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { FoodLogRow, FoodTableRow } from '@/src/db';
import { SyncMappingError } from './errors';
import {
  foodSyncFields,
  fromRemoteFood,
  fromRemoteFoodLog,
  toRemoteFood,
  toRemoteFoodLog,
} from './mapping';
import type { RemoteFoodLogRow, RemoteFoodRow } from './remote-rows';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';

/** Usage-cache values that must never leave the device. Deliberately non-default in every fixture. */
const CACHE = {
  useCount: 17,
  lastUsedAt: 1_741_589_700_000,
  hourHistogram: '[0,0,0,0,0,0,0,3,0,0,0,0,2,0,0,0,0,0,0,1,0,0,0,0]',
  searchText: 'porridge oats',
} as const;

const food = (over: Partial<FoodTableRow>): FoodTableRow => ({
  id: 'f0000000-0000-4000-8000-000000000001',
  updatedAt: 1_741_589_700_000,
  deleted: 0,
  name: 'Porridge oats',
  brand: null,
  basis: 'weight',
  servingLabel: '60 g dry',
  servingAmount: 60,
  kcalPer100: 379,
  proteinPer100: 13.5,
  archived: 0,
  ...CACHE,
  ...over,
});

const log = (over: Partial<FoodLogRow>): FoodLogRow => ({
  id: 'e0000000-0000-4000-8000-000000000001',
  updatedAt: 1_741_589_700_000,
  deleted: 0,
  loggedAt: 1_741_589_700_000,
  localDate: '2025-03-09',
  localMinute: 1435,
  foodId: 'f0000000-0000-4000-8000-000000000001',
  mealId: null,
  qty: 1,
  grams: 60,
  ml: null,
  kcal: 227.4,
  protein: 8.1,
  slot: 'snack',
  ...over,
});

interface FoodCase {
  readonly name: string;
  readonly local: FoodTableRow;
  readonly remote: RemoteFoodRow;
}

const FOOD_CASES: readonly FoodCase[] = [
  {
    name: 'a weight food: serving_amount and per-100 are grams',
    local: food({}),
    remote: {
      id: 'f0000000-0000-4000-8000-000000000001',
      user_id: USER,
      updated_at: 1_741_589_700_000,
      deleted: 0,
      name: 'Porridge oats',
      brand: null,
      basis: 'weight',
      serving_label: '60 g dry',
      serving_amount: 60,
      kcal_per_100: 379,
      protein_per_100: 13.5,
      archived: 0,
    },
  },
  {
    name: 'a volume food: same columns, millilitres',
    local: food({
      id: 'f0000000-0000-4000-8000-000000000002',
      name: 'Whey shake',
      brand: 'Bulk',
      basis: 'volume',
      servingLabel: '1 scoop',
      servingAmount: 25,
      kcalPer100: 390,
      proteinPer100: 80,
    }),
    remote: {
      id: 'f0000000-0000-4000-8000-000000000002',
      user_id: USER,
      updated_at: 1_741_589_700_000,
      deleted: 0,
      name: 'Whey shake',
      brand: 'Bulk',
      basis: 'volume',
      serving_label: '1 scoop',
      serving_amount: 25,
      kcal_per_100: 390,
      protein_per_100: 80,
      archived: 0,
    },
  },
  {
    name: 'a tombstoned food',
    local: food({ id: 'f0000000-0000-4000-8000-000000000003', deleted: 1, updatedAt: 1_741_600_000_001 }),
    remote: {
      id: 'f0000000-0000-4000-8000-000000000003',
      user_id: USER,
      updated_at: 1_741_600_000_001,
      deleted: 1,
      name: 'Porridge oats',
      brand: null,
      basis: 'weight',
      serving_label: '60 g dry',
      serving_amount: 60,
      kcal_per_100: 379,
      protein_per_100: 13.5,
      archived: 0,
    },
  },
  {
    name: 'an archived food is hidden, not deleted',
    local: food({ id: 'f0000000-0000-4000-8000-000000000004', archived: 1 }),
    remote: {
      id: 'f0000000-0000-4000-8000-000000000004',
      user_id: USER,
      updated_at: 1_741_589_700_000,
      deleted: 0,
      name: 'Porridge oats',
      brand: null,
      basis: 'weight',
      serving_label: '60 g dry',
      serving_amount: 60,
      kcal_per_100: 379,
      protein_per_100: 13.5,
      archived: 1,
    },
  },
];

interface LogCase {
  readonly name: string;
  readonly local: FoodLogRow;
  readonly remote: RemoteFoodLogRow;
}

const LOG_CASES: readonly LogCase[] = [
  {
    name: 'a weight log: grams set, ml null',
    local: log({}),
    remote: {
      id: 'e0000000-0000-4000-8000-000000000001',
      user_id: USER,
      updated_at: 1_741_589_700_000,
      deleted: 0,
      logged_at: 1_741_589_700_000,
      local_date: '2025-03-09',
      local_minute: 1435,
      food_id: 'f0000000-0000-4000-8000-000000000001',
      meal_id: null,
      qty: 1,
      grams: 60,
      ml: null,
      kcal: 227.4,
      protein: 8.1,
      slot: 'snack',
    },
  },
  {
    name: 'a volume log: ml set, grams null',
    local: log({
      id: 'e0000000-0000-4000-8000-000000000002',
      foodId: 'f0000000-0000-4000-8000-000000000002',
      qty: 2,
      grams: null,
      ml: 50,
      kcal: 195,
      protein: 40,
      slot: 'breakfast',
      localMinute: 450,
    }),
    remote: {
      id: 'e0000000-0000-4000-8000-000000000002',
      user_id: USER,
      updated_at: 1_741_589_700_000,
      deleted: 0,
      logged_at: 1_741_589_700_000,
      local_date: '2025-03-09',
      local_minute: 450,
      food_id: 'f0000000-0000-4000-8000-000000000002',
      meal_id: null,
      qty: 2,
      grams: null,
      ml: 50,
      kcal: 195,
      protein: 40,
      slot: 'breakfast',
    },
  },
  {
    name: 'a log from a saved meal: meal_id set, food_id null',
    local: log({
      id: 'e0000000-0000-4000-8000-000000000003',
      foodId: null,
      mealId: 'a0000000-0000-4000-8000-000000000001',
      grams: null,
      ml: null,
    }),
    remote: {
      id: 'e0000000-0000-4000-8000-000000000003',
      user_id: USER,
      updated_at: 1_741_589_700_000,
      deleted: 0,
      logged_at: 1_741_589_700_000,
      local_date: '2025-03-09',
      local_minute: 1435,
      food_id: null,
      meal_id: 'a0000000-0000-4000-8000-000000000001',
      qty: 1,
      grams: null,
      ml: null,
      kcal: 227.4,
      protein: 8.1,
      slot: 'snack',
    },
  },
  {
    name: 'a tombstoned log',
    local: log({ id: 'e0000000-0000-4000-8000-000000000004', deleted: 1, updatedAt: 1_741_600_000_001 }),
    remote: {
      id: 'e0000000-0000-4000-8000-000000000004',
      user_id: USER,
      updated_at: 1_741_600_000_001,
      deleted: 1,
      logged_at: 1_741_589_700_000,
      local_date: '2025-03-09',
      local_minute: 1435,
      food_id: 'f0000000-0000-4000-8000-000000000001',
      meal_id: null,
      qty: 1,
      grams: 60,
      ml: null,
      kcal: 227.4,
      protein: 8.1,
      slot: 'snack',
    },
  },
];

describe('foods map to the remote contract', () => {
  it.each(FOOD_CASES)('$name — up', ({ local, remote }) => {
    expect(toRemoteFood(foodSyncFields(local), USER)).toEqual(remote);
  });

  it.each(FOOD_CASES)('$name — and back', ({ local, remote }) => {
    expect(fromRemoteFood(remote)).toEqual(foodSyncFields(local));
  });

  it('round-trips basis, serving_amount and both per-100 values for a volume food', () => {
    const local = foodSyncFields(food({ basis: 'volume', servingAmount: 33.3, kcalPer100: 41.7, proteinPer100: 0.9 }));
    expect(fromRemoteFood(toRemoteFood(local, USER))).toEqual(local);
  });

  it('never sends the device-local usage cache', () => {
    const remote = toRemoteFood(foodSyncFields(food({})), USER);
    for (const key of ['use_count', 'last_used_at', 'hour_histogram', 'search_text', 'useCount']) {
      expect(remote).not.toHaveProperty(key);
    }
  });

  it('leaves the usage cache to the data layer when a row arrives from the cloud', () => {
    const restored = fromRemoteFood(toRemoteFood(foodSyncFields(food({})), USER));
    expect(Object.keys(restored).sort()).not.toContain('useCount');
  });

  it('stamps the row with the signed-in user on the way up', () => {
    expect(toRemoteFood(foodSyncFields(food({})), OTHER_USER).user_id).toBe(OTHER_USER);
  });

  it('drops user_id on the way down — local SQLite is single-user', () => {
    expect(fromRemoteFood(toRemoteFood(foodSyncFields(food({})), USER))).not.toHaveProperty('user_id');
  });
});

describe('food_log maps to the remote contract', () => {
  it.each(LOG_CASES)('$name — up', ({ local, remote }) => {
    expect(toRemoteFoodLog(local, USER)).toEqual(remote);
  });

  it.each(LOG_CASES)('$name — and back', ({ local, remote }) => {
    expect(fromRemoteFoodLog(remote)).toEqual(local);
  });

  it('keeps ml intact and grams null for a volume log, and vice versa for a weight log', () => {
    const volume = log({ grams: null, ml: 250 });
    const weight = log({ grams: 250, ml: null });
    expect(fromRemoteFoodLog(toRemoteFoodLog(volume, USER))).toMatchObject({ grams: null, ml: 250 });
    expect(fromRemoteFoodLog(toRemoteFoodLog(weight, USER))).toMatchObject({ grams: 250, ml: null });
  });

  it('distinguishes a null amount from zero', () => {
    const remote = toRemoteFoodLog(log({ grams: null, ml: null }), USER);
    expect(remote.grams).toBeNull();
    expect(remote.ml).toBeNull();
  });
});

describe('tombstones and updated_at survive a round trip unchanged', () => {
  it.each([...FOOD_CASES])('food: $name', ({ local }) => {
    const back = fromRemoteFood(toRemoteFood(foodSyncFields(local), USER));
    expect(back.deleted).toBe(local.deleted);
    expect(back.updatedAt).toBe(local.updatedAt);
  });

  it.each([...LOG_CASES])('log: $name', ({ local }) => {
    const back = fromRemoteFoodLog(toRemoteFoodLog(local, USER));
    expect(back.deleted).toBe(local.deleted);
    expect(back.updatedAt).toBe(local.updatedAt);
  });

  it('carries a tombstone as a row, never as an absence', () => {
    const remote = toRemoteFood(foodSyncFields(food({ deleted: 1 })), USER);
    expect(remote.deleted).toBe(1);
    expect(remote.name).toBe('Porridge oats');
  });

  it('never restamps updated_at with the local clock', () => {
    const ancient = 946_684_800_000; // 2000-01-01T00:00:00Z
    expect(toRemoteFood(foodSyncFields(food({ updatedAt: ancient })), USER).updated_at).toBe(ancient);
    expect(fromRemoteFood(toRemoteFood(foodSyncFields(food({ updatedAt: ancient })), USER)).updatedAt).toBe(ancient);
  });
});

describe('local_date is carried, never derived', () => {
  /**
   * 23:55 local on 9 March 2025 in Los Angeles is 06:55 UTC on the 10th. Deriving the calendar day
   * from `logged_at` would move this meal to the wrong day on every pull. The mapping copies
   * `local_date` and `local_minute` verbatim — it has no timezone and no clock to derive them from.
   */
  const lateSnack = log({ loggedAt: 1_741_589_700_000, localDate: '2025-03-09', localMinute: 1435 });

  it('a 23:55 log keeps its local day across a round trip, even though UTC says tomorrow', () => {
    expect(new Date(lateSnack.loggedAt).toISOString().slice(0, 10)).toBe('2025-03-10');
    const back = fromRemoteFoodLog(toRemoteFoodLog(lateSnack, USER));
    expect(back.localDate).toBe('2025-03-09');
    expect(back.localMinute).toBe(1435);
    expect(back).not.toHaveProperty('local_date');
  });

  it('a 00:05 log keeps its local day, even though UTC says yesterday', () => {
    const early = log({ loggedAt: 1_741_503_900_000, localDate: '2025-03-09', localMinute: 5 });
    expect(new Date(early.loggedAt).toISOString().slice(0, 10)).toBe('2025-03-09');
    expect(fromRemoteFoodLog(toRemoteFoodLog(early, USER)).localDate).toBe('2025-03-09');
  });
});

describe('a bad remote row is rejected, not silently coerced', () => {
  const goodFood = toRemoteFood(foodSyncFields(food({})), USER);
  const goodLog = toRemoteFoodLog(log({}), USER);

  const bad = <T extends object>(row: T, over: Record<string, unknown>): T =>
    ({ ...row, ...over }) as T;

  it('rejects a basis outside the closed set', () => {
    expect(() => fromRemoteFood(bad(goodFood, { basis: 'count' }))).toThrow(SyncMappingError);
  });

  it('rejects a deleted flag that is not 0 or 1', () => {
    expect(() => fromRemoteFood(bad(goodFood, { deleted: 2 }))).toThrow(SyncMappingError);
  });

  it('rejects a non-finite updated_at', () => {
    expect(() => fromRemoteFood(bad(goodFood, { updated_at: null }))).toThrow(SyncMappingError);
    expect(() => fromRemoteFoodLog(bad(goodLog, { updated_at: Number.NaN }))).toThrow(SyncMappingError);
  });

  it('rejects a log that claims both grams and ml — the remote CHECK would reject the whole batch', () => {
    expect(() => fromRemoteFoodLog(bad(goodLog, { grams: 60, ml: 50 }))).toThrow(SyncMappingError);
    expect(() => toRemoteFoodLog(log({ grams: 60, ml: 50 }), USER)).toThrow(SyncMappingError);
  });

  it('rejects a local_date that is an ISO timestamp — the tell-tale of a UTC-derived day', () => {
    expect(() => fromRemoteFoodLog(bad(goodLog, { local_date: '2025-03-10T06:55:00Z' }))).toThrow(
      SyncMappingError,
    );
  });

  it('rejects a local_minute outside 0..1439', () => {
    expect(() => fromRemoteFoodLog(bad(goodLog, { local_minute: 1440 }))).toThrow(SyncMappingError);
  });

  it('names the row and the reason, so the applier can quarantine one row instead of the batch', () => {
    try {
      fromRemoteFood(bad(goodFood, { basis: 'count' }));
      throw new Error('expected a SyncMappingError');
    } catch (error) {
      expect(error).toBeInstanceOf(SyncMappingError);
      const mapping = error as SyncMappingError;
      expect(mapping.code).toBe('invalid-value');
      expect(mapping.table).toBe('foods');
      expect(mapping.rowId).toBe(goodFood.id);
      expect(mapping.column).toBe('basis');
    }
  });

  it('refuses to push a row with no user id — an unauthenticated upsert would be a silent data loss', () => {
    expect(() => toRemoteFood(foodSyncFields(food({})), '')).toThrow(SyncMappingError);
    expect(() => toRemoteFoodLog(log({}), '')).toThrow(SyncMappingError);
  });
});

describe('the mapping is pure', () => {
  it('does not mutate its input', () => {
    const local = food({});
    const snapshot = structuredClone(local);
    toRemoteFood(foodSyncFields(local), USER);
    expect(local).toEqual(snapshot);
  });

  it('is deterministic — the same row maps to the same value twice', () => {
    const local = foodSyncFields(food({}));
    expect(toRemoteFood(local, USER)).toEqual(toRemoteFood(local, USER));
  });

  it('imports no client, no fetch, no storage and no clock', () => {
    // The guarantee is structural, so it is asserted on the code: a mapping that reaches for a
    // client is a mapping that can block, and a blocked mapping is a dropped log. Comments are
    // stripped first — the module's own prose names the files it mirrors.
    const code = fs
      .readFileSync(path.join(__dirname, 'mapping.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const forbidden of ['supabase', 'fetch(', 'AsyncStorage', 'expo-', 'Date.now', 'Intl.']) {
      expect(code).not.toContain(forbidden);
    }
    const specifiers = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(specifiers.sort()).toEqual(['./errors', './errors', './remote-rows', '@/src/db']);
  });
});
