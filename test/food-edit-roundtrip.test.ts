/**
 * Issue #125 — a volume food's edit→save round-trip, at the data layer.
 *
 * `app/foods/[id].test.tsx` (ui-engineer) already proves the *screen* pre-fills and saves for a
 * 100 g weight food, rendered through React Native Testing Library. What it does not cover — and
 * what #123's review flagged as the path most likely to rot quietly — is the arithmetic: `foods`
 * stores nutrition per 100 g/ml (`servingAmount`, `kcalPer100`, `proteinPer100`) and every screen
 * renders per-serving, so a rounding or basis slip on the way back through save would show up
 * nowhere in the current suites.
 *
 * This file skips rendering entirely and drives exactly what the screen does:
 *
 *   1. `inputFromFood` (`app/foods/[id].tsx`) — a `FoodRow` becomes a `FoodInput`, the six fields
 *      the form edits;
 *   2. `<FoodForm>`'s `handleSave` — always submits the *whole* `FoodInput`, not a diff, so an
 *      edit to one field round-trips every other field through the same `onSave` call;
 *   3. `updateFood` (db-engineer, `src/db/queries/catalog.ts`) — the write;
 *   4. `getFood` — the re-read.
 *
 * That is the real round-trip, in Node, against real SQLite (`better-sqlite3`) via `makeTestDb`,
 * milliseconds fast — no simulator, no rendered tree, and nothing mocked in `src/db`.
 *
 * Two invariants from `CLAUDE.md` are in scope:
 *   - canonical storage: `servingAmount`/`kcalPer100`/`proteinPer100` are stored as typed, in the
 *     canonical unit of `basis` (grams for weight, millilitres for volume) — never re-derived
 *     through a per-serving display value and written back.
 *   - history is immutable: `food_log` holds `kcal`/`protein`/`ml`/`grams` literally, so editing
 *     the food that produced a log row must never move that row's stored figures.
 */
import { eq } from 'drizzle-orm';
import { makeTestDb } from './db';
import { createFood, getFood, logFood, servingOf, updateFood } from '../src/db';
import * as schema from '../src/db/schema';
import type { FoodInput, FoodRow, VitalsDb } from '../src/db';

const AT = 1_700_000_000_000;
const LATER = AT + 60_000;
const WHEN = { at: AT, timeZone: 'America/Los_Angeles' } as const;

function db(): VitalsDb {
  return makeTestDb({ schema }).db as unknown as VitalsDb;
}

/** `app/foods/[id].tsx`'s own mapping, reproduced exactly — the six fields the form edits, never
 * the derived per-serving ones (there is no honest way back to per-100 from a per-serving number
 * without the serving amount already in hand, which is the whole point of storing per-100). */
function inputFromFood(food: FoodRow): FoodInput {
  return {
    name: food.name,
    brand: food.brand,
    servingLabel: food.servingLabel,
    basis: food.basis,
    servingAmount: food.servingAmount,
    kcalPer100: food.kcalPer100,
    proteinPer100: food.proteinPer100,
  };
}

/** `<FoodForm>`'s `handleSave` calls `onSave` with the whole (possibly-edited) `FoodInput` —
 * never a diff — so this is the shape `updateFood`'s `patch` actually receives from the screen. */
function editedInput(food: FoodRow, edit: Partial<FoodInput>): FoodInput {
  return { ...inputFromFood(food), ...edit };
}

describe('volume food edit -> save round-trip (data layer)', () => {
  it('stores a 1/3-cup serving amount exactly — a repeating decimal that must not drift on save', () => {
    const handle = db();
    // 1 cup is the 250 ml preset (SERVING_PRESETS); a third of it is the classic float trap.
    const THIRD_CUP = 250 / 3; // 83.33333333333333…
    const created = createFood(handle, {
      at: AT,
      food: { name: 'Oat milk', servingLabel: '1/3 cup', basis: 'volume', servingAmount: THIRD_CUP, kcalPer100: 40, proteinPer100: 1.1 },
    });
    expect(created.servingAmount).toBe(THIRD_CUP);

    // Load into the form, edit an unrelated field, save — the untouched serving amount must not move.
    const loaded = getFood(handle, created.id)!;
    const patch = editedInput(loaded, { proteinPer100: 1.2 });
    const saved = updateFood(handle, { at: LATER, id: created.id, patch });

    expect(saved.servingAmount).toBe(THIRD_CUP);
    expect(saved.basis).toBe('volume');
    expect(saved.proteinPer100).toBe(1.2);

    const reread = getFood(handle, created.id)!;
    expect(reread.servingAmount).toBe(THIRD_CUP);
    expect(reread.servingMl).toBe(THIRD_CUP);
    expect(reread.servingGrams).toBeNull();
  });

  it('re-derives per-serving kcal without drift after the round-trip, for a value that does not survive a naive float conversion', () => {
    // 100 kcal over a 15 ml tablespoon is 666.6666666666666… per 100 ml — snap() exists precisely
    // because a naive round-trip of this would come back as 99.99999999999999, not 100.
    const handle = db();
    const kcalPer100 = (100 * 100) / 15;
    const created = createFood(handle, {
      at: AT,
      food: { name: 'Maple syrup', servingLabel: '1 tbsp', basis: 'volume', servingAmount: 15, kcalPer100, proteinPer100: 0 },
    });
    expect(created.kcalPerServing).toBe(100);

    const loaded = getFood(handle, created.id)!;
    // Edit the serving label only — kcalPer100 must survive untouched through the save.
    const saved = updateFood(handle, { at: LATER, id: created.id, patch: editedInput(loaded, { servingLabel: '1 heaped tbsp' }) });

    expect(saved.kcalPer100).toBe(kcalPer100);
    expect(saved.kcalPerServing).toBe(100);
    const reread = getFood(handle, created.id)!;
    expect(reread.kcalPer100).toBe(kcalPer100);
    expect(reread.kcalPerServing).toBe(100);
  });

  it('keeps a zero-kcal food at zero through the round-trip — `?? 0` must not mistake a real zero for "unset"', () => {
    // #123's review note: `initial.servingAmount ?? 100` once let an explicit 0 fall through to the
    // default. `kcalPer100`/`proteinPer100` use the same `??` pattern — a legitimately-zero food
    // (water) must come back as 0, not silently reset.
    const handle = db();
    const created = createFood(handle, {
      at: AT,
      food: { name: 'Still water', servingLabel: '1 glass', basis: 'volume', servingAmount: 250, kcalPer100: 0, proteinPer100: 0 },
    });

    const loaded = getFood(handle, created.id)!;
    const saved = updateFood(handle, { at: LATER, id: created.id, patch: editedInput(loaded, { servingLabel: '1 large glass' }) });

    expect(saved.kcalPer100).toBe(0);
    expect(saved.proteinPer100).toBe(0);
    expect(saved.kcalPerServing).toBe(0);
  });

  it('leaves the serving amount untouched when only the basis changes — no silent grams<->ml conversion', () => {
    // A volume food measured by the cup (250 ml). Re-classifying it as weight must not scale the
    // number: 250 becomes "250 g", the user's number, not a converted one — there is no density to
    // convert with, and the form has no field for one.
    const handle = db();
    const created = createFood(handle, {
      at: AT,
      food: { name: 'Rolled oats', servingLabel: '1 cup', basis: 'volume', servingAmount: 250, kcalPer100: 68, proteinPer100: 2.4 },
    });
    expect(created.servingMl).toBe(250);
    expect(created.servingGrams).toBeNull();

    const loaded = getFood(handle, created.id)!;
    // Only `basis` changes; `servingAmount` is carried over exactly as `<FoodForm>` would submit it
    // (the toggle has no side effect on the amount stepper's state).
    const saved = updateFood(handle, { at: LATER, id: created.id, patch: editedInput(loaded, { basis: 'weight' }) });

    expect(saved.basis).toBe('weight');
    expect(saved.servingAmount).toBe(250);
    expect(saved.servingGrams).toBe(250);
    expect(saved.servingMl).toBeNull();
    // Derived kcal-per-serving is unchanged too — it depends only on kcalPer100 and servingAmount,
    // neither of which this edit touched.
    expect(saved.kcalPerServing).toBe(created.kcalPerServing);
  });

  it('agrees with `servingOf` after the round-trip — stored per-100 and derived per-serving never diverge', () => {
    const handle = db();
    const created = createFood(handle, {
      at: AT,
      food: { name: 'Protein shake', servingLabel: '1 scoop', basis: 'volume', servingAmount: 30, kcalPer100: 350, proteinPer100: 75 },
    });
    const loaded = getFood(handle, created.id)!;
    const saved = updateFood(handle, {
      at: LATER,
      id: created.id,
      patch: editedInput(loaded, { servingAmount: 35, kcalPer100: 360 }),
    });

    const expected = servingOf(saved);
    expect(saved.kcalPerServing).toBe(expected.kcalPerServing);
    expect(saved.proteinPerServing).toBe(expected.proteinPerServing);
    expect(saved.servingMl).toBe(expected.servingMl);
    expect(saved.servingGrams).toBe(expected.servingGrams);

    const reread = getFood(handle, created.id)!;
    expect(reread).toMatchObject(expected);
  });

  it('never rewrites an already-logged entry — history stays immutable through the edit', () => {
    const handle = db();
    const created = createFood(handle, {
      at: AT,
      food: { name: 'Olive oil', servingLabel: '1 tbsp', basis: 'volume', servingAmount: 15, kcalPer100: (90 * 100) / 15, proteinPer100: 0 },
    });
    const receipt = logFood(handle, { ...WHEN, foodId: created.id });
    const logged = receipt.entries[0]!;
    expect(logged).toMatchObject({ ml: 15, kcal: 90, protein: 0 });

    const loaded = getFood(handle, created.id)!;
    updateFood(handle, {
      at: LATER,
      id: created.id,
      patch: editedInput(loaded, { basis: 'weight', servingAmount: 14, kcalPer100: 900 }),
    });

    const row = handle.select().from(schema.foodLog).where(eq(schema.foodLog.id, logged.id)).get();
    expect(row).toMatchObject({ ml: 15, grams: null, kcal: 90, protein: 0 });
  });
});

describe('weight food edit -> save round-trip (data layer) — same contract, so the two bases cannot diverge', () => {
  it('stores a serving amount that is itself a repeating decimal, exactly, across the round-trip', () => {
    const handle = db();
    const A_THIRD_KG = 1000 / 3; // 333.3333333333333… g
    const created = createFood(handle, {
      at: AT,
      food: { name: 'Chicken breast', servingLabel: '1/3 kg', basis: 'weight', servingAmount: A_THIRD_KG, kcalPer100: 120, proteinPer100: 22 },
    });

    const loaded = getFood(handle, created.id)!;
    const saved = updateFood(handle, { at: LATER, id: created.id, patch: editedInput(loaded, { kcalPer100: 121 }) });

    expect(saved.servingAmount).toBe(A_THIRD_KG);
    expect(saved.servingGrams).toBe(A_THIRD_KG);
    expect(saved.servingMl).toBeNull();
    const reread = getFood(handle, created.id)!;
    expect(reread.servingAmount).toBe(A_THIRD_KG);
  });

  it('re-derives kcal without drift for a value that does not survive a naive float conversion', () => {
    // The exact figures from `servings.ts`'s own docstring: 105 kcal over 170 g.
    const handle = db();
    const kcalPer100 = (105 * 100) / 170;
    const created = createFood(handle, {
      at: AT,
      food: { name: 'Banana', servingLabel: '1 medium', basis: 'weight', servingAmount: 170, kcalPer100, proteinPer100: (1.3 * 100) / 170 },
    });
    expect(created.kcalPerServing).toBe(105);

    const loaded = getFood(handle, created.id)!;
    const saved = updateFood(handle, { at: LATER, id: created.id, patch: editedInput(loaded, { servingLabel: '1 large' }) });

    expect(saved.kcalPer100).toBe(kcalPer100);
    expect(saved.kcalPerServing).toBe(105);
    expect(saved.proteinPerServing).toBe(1.3);
  });

  it('leaves the serving amount untouched when only the basis changes, mirroring the volume case', () => {
    const handle = db();
    const created = createFood(handle, {
      at: AT,
      food: { name: 'Greek yoghurt', servingLabel: '1 pot', basis: 'weight', servingAmount: 170, kcalPer100: 78, proteinPer100: 10 },
    });

    const loaded = getFood(handle, created.id)!;
    const saved = updateFood(handle, { at: LATER, id: created.id, patch: editedInput(loaded, { basis: 'volume' }) });

    expect(saved.basis).toBe('volume');
    expect(saved.servingAmount).toBe(170);
    expect(saved.servingMl).toBe(170);
    expect(saved.servingGrams).toBeNull();
  });

  it('never rewrites an already-logged entry — history stays immutable through the edit', () => {
    const handle = db();
    const created = createFood(handle, {
      at: AT,
      food: { name: 'Porridge oats', servingLabel: '60 g dry', basis: 'weight', servingAmount: 60, kcalPer100: 379, proteinPer100: 13.5 },
    });
    const receipt = logFood(handle, { ...WHEN, foodId: created.id });
    const logged = receipt.entries[0]!;
    expect(logged).toMatchObject({ grams: 60, kcal: 227.4, protein: 8.1 });

    const loaded = getFood(handle, created.id)!;
    updateFood(handle, { at: LATER, id: created.id, patch: editedInput(loaded, { kcalPer100: 500, servingAmount: 45 }) });

    const row = handle.select().from(schema.foodLog).where(eq(schema.foodLog.id, logged.id)).get();
    expect(row).toMatchObject({ grams: 60, ml: null, kcal: 227.4, protein: 8.1 });
  });
});
