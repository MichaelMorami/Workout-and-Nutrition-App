/**
 * `parseHourHistogram` and the internal recompute helpers that keep `use_count`/`last_used_at`/
 * `hour_histogram` exact — the invariant issue #35's undo tests depend on.
 */
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../test/db';
import { makeLogEntry, makeMeal } from '../../test/factories';
import { makeFood } from './test-support/foods';
import * as schema from './schema';
import { parseHourHistogram, recomputeFoodUsage, recomputeMealUsage } from './usage';

describe('parseHourHistogram', () => {
  it('decodes NULL as 24 zeros, not a special case', () => {
    const hist = parseHourHistogram(null);
    expect(hist).toHaveLength(24);
    expect(hist.every((n) => n === 0)).toBe(true);
  });

  it('round-trips a JSON-encoded histogram', () => {
    const encoded = JSON.stringify(Array.from({ length: 24 }, (_, i) => i));
    expect(parseHourHistogram(encoded)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('throws on a malformed histogram rather than silently truncating', () => {
    expect(() => parseHourHistogram('[1,2,3]')).toThrow(/24/);
    expect(() => parseHourHistogram('not json')).toThrow();
  });
});

describe('recomputeFoodUsage', () => {
  it('on an empty database, a food with no logs gets use_count 0, last_used_at null, histogram null', () => {
    const { db, schema: s } = makeTestDb({ schema });
    const food = makeFood({ useCount: 5, lastUsedAt: 123, hourHistogram: '[1]' }); // deliberately wrong, to prove recompute overwrites it
    db.insert(s.foods).values(food).run();

    recomputeFoodUsage(db, food.id);

    const row = db.select().from(s.foods).where(eq(s.foods.id, food.id)).get();
    expect(row?.useCount).toBe(0);
    expect(row?.lastUsedAt).toBeNull();
    expect(row?.hourHistogram).toBeNull();
  });

  it('counts only live, direct logs — excludes soft-deleted rows and rows logged via a meal', () => {
    const { db, schema: s } = makeTestDb({ schema });
    const food = makeFood();
    const meal = makeMeal();
    db.insert(s.foods).values(food).run();
    db.insert(s.meals).values(meal).run();

    db.insert(s.foodLog)
      .values([
        makeLogEntry({ foodId: food.id, loggedAt: 1_000, localMinute: 8 * 60 }), // live, direct — counts
        makeLogEntry({ foodId: food.id, loggedAt: 2_000, localMinute: 9 * 60, deleted: 1 }), // tombstoned — excluded
        // `mealId` isn't on the qa-owned `FoodLogEntry` factory type yet (issue #17 deviation 3),
        // so it's spliced in after the factory builds a structurally-valid row.
        { ...makeLogEntry({ foodId: food.id, loggedAt: 3_000, localMinute: 10 * 60 }), mealId: meal.id }, // via a meal — excluded
      ])
      .run();

    recomputeFoodUsage(db, food.id);

    const row = db.select().from(s.foods).where(eq(s.foods.id, food.id)).get();
    expect(row?.useCount).toBe(1);
    expect(row?.lastUsedAt).toBe(1_000);
    expect(parseHourHistogram(row?.hourHistogram ?? null)[8]).toBe(1);
  });

  it('never bumps updated_at — a derived cache is not a user-authored change', () => {
    const { db, schema: s } = makeTestDb({ schema });
    const food = makeFood({ updatedAt: 42 });
    db.insert(s.foods).values(food).run();
    db.insert(s.foodLog).values(makeLogEntry({ foodId: food.id })).run();

    recomputeFoodUsage(db, food.id);

    const row = db.select().from(s.foods).where(eq(s.foods.id, food.id)).get();
    expect(row?.updatedAt).toBe(42);
  });

  it('buckets by local_minute, not by loggedAt / UTC hour — the same invariant as local_date', () => {
    const { db, schema: s } = makeTestDb({ schema });
    const food = makeFood();
    db.insert(s.foods).values(food).run();
    // loggedAt is a UTC instant that would fall in a different UTC hour than the local one.
    db.insert(s.foodLog)
      .values(makeLogEntry({ foodId: food.id, loggedAt: Date.parse('2025-03-10T06:55:00.000Z'), localMinute: 23 * 60 + 55 }))
      .run();

    recomputeFoodUsage(db, food.id);

    const row = db.select().from(s.foods).where(eq(s.foods.id, food.id)).get();
    expect(parseHourHistogram(row?.hourHistogram ?? null)[23]).toBe(1);
  });
});

describe('recomputeMealUsage', () => {
  it('counts distinct (meal_id, logged_at) groups, not one per constituent food row', () => {
    const { db, schema: s } = makeTestDb({ schema });
    const meal = makeMeal();
    db.insert(s.meals).values(meal).run();

    // One tap on a meal with two items writes two rows sharing logged_at — one use.
    // `mealId` isn't on the qa-owned `FoodLogEntry` factory type yet (issue #17 deviation 3),
    // so it's spliced in after the factory builds a structurally-valid row.
    db.insert(s.foodLog)
      .values([
        { ...makeLogEntry({ loggedAt: 5_000, localMinute: 60 }), mealId: meal.id },
        { ...makeLogEntry({ loggedAt: 5_000, localMinute: 60 }), mealId: meal.id },
        { ...makeLogEntry({ loggedAt: 9_000, localMinute: 120 }), mealId: meal.id },
      ])
      .run();

    recomputeMealUsage(db, meal.id);

    const row = db.select().from(s.meals).where(eq(s.meals.id, meal.id)).get();
    expect(row?.useCount).toBe(2);
    expect(row?.lastUsedAt).toBe(9_000);
  });
});
