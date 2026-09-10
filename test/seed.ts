/**
 * The deterministic seeder.
 *
 *   scripts/seed.sh 400            write 400 days into a SQLite file for the demo
 *   seedData({ days: 400 })        the same rows, in memory, for a test
 *
 * "Realistic" here is load-bearing, not decoration. A chart over random numbers looks fine and
 * proves nothing; a chart over data with a real trend, real weekends, real missed days and real
 * plateaus is where you notice that the 7-day average is off by one bucket. So:
 *
 *   - weight follows the energy balance it was actually fed (~7700 kcal per kg), with day-to-day
 *     water noise on top, so a weight chart has a trend *and* a jagged line;
 *   - intake varies by weekday, drifts up at weekends, and is occasionally not logged at all;
 *   - foods are drawn per slot from a plausible catalogue, so the quick-add grid has something
 *     defensible to rank;
 *   - training is a four-day upper/lower split with ~85% adherence, progressive overload and a
 *     deload every eighth week;
 *   - a handful of meals are logged at 23:5x, so seeded data itself exercises the `local_date`
 *     boundary rather than politely avoiding it.
 *
 * Everything derives from one integer seed. Same seed, same bytes, on every machine.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getTableColumns, is } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { makeTestDb, type MakeTestDbOptions, type TestDb, type TestSchema } from './db';
import { instantOfLocal, addLocalDays, localDayOfWeek, type LocalDate } from './local-date';
import { resolveSchemaSource } from './schema-source';
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
  SeedData,
  Session,
  Settings,
  WorkoutSet,
} from './model';
import { DEFAULT_TEST_TZ } from './time';

export interface SeedOptions {
  /** How many days of history, ending on `endDate`. Default 400. */
  days?: number;
  /** The last day generated, inclusive. Default `2025-03-09` — the frozen clock's day. */
  endDate?: LocalDate;
  /** The user's timezone; every `local_date` and every timestamp is computed in it. */
  timeZone?: string;
  /** PRNG seed. Change it for a different-but-equally-deterministic user. */
  seed?: number;
  /** Starting bodyweight in kg. */
  startWeight?: number;
  /** The user's daily calorie goal — intake is generated around it, not around maintenance. */
  kcalTarget?: number;
  /** The user's daily protein goal, grams. */
  proteinTarget?: number;
}

/** The frozen clock's calendar day in `DEFAULT_TEST_TZ` — see `test/time.ts`. */
const DEFAULT_END_DATE: LocalDate = '2025-03-09';

/** xorshift-family PRNG: tiny, fast, and identical on every platform. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  constructor(private readonly next: () => number) {}
  /** Uniform in `[min, max)`. */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  /** Uniform integer in `[min, max]`. */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }
  bool(probability: number): boolean {
    return this.next() < probability;
  }
  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error('cannot pick from an empty list');
    return item;
  }
  /** Roughly normal, via the mean of four uniforms. Keeps weight noise from looking synthetic. */
  gauss(mean: number, sd: number): number {
    const u = (this.next() + this.next() + this.next() + this.next()) / 4;
    return mean + (u - 0.5) * 3.4641 * sd * 2;
  }
}

interface CatalogueFood {
  name: string;
  brand: string | null;
  servingLabel: string;
  servingGrams: number | null;
  kcal: number;
  protein: number;
  slots: MealSlot[];
  /** Relative likelihood of being chosen when its slot comes up. */
  weight: number;
}

/** A believable personal catalogue — the sort of 30-odd foods a real tracker accumulates. */
const CATALOGUE: readonly CatalogueFood[] = [
  { name: 'Porridge oats', brand: null, servingLabel: '60 g dry', servingGrams: 60, kcal: 228, protein: 8.4, slots: ['breakfast'], weight: 5 },
  { name: 'Semi-skimmed milk', brand: null, servingLabel: '200 ml', servingGrams: 206, kcal: 98, protein: 7, slots: ['breakfast', 'snack'], weight: 4 },
  { name: 'Greek yoghurt 0%', brand: 'Fage', servingLabel: '170 g pot', servingGrams: 170, kcal: 97, protein: 17, slots: ['breakfast', 'snack'], weight: 5 },
  { name: 'Blueberries', brand: null, servingLabel: '80 g', servingGrams: 80, kcal: 46, protein: 0.6, slots: ['breakfast', 'snack'], weight: 3 },
  { name: 'Banana', brand: null, servingLabel: '1 medium', servingGrams: 118, kcal: 105, protein: 1.3, slots: ['breakfast', 'snack'], weight: 4 },
  { name: 'Eggs', brand: null, servingLabel: '2 large', servingGrams: 100, kcal: 143, protein: 12.6, slots: ['breakfast'], weight: 4 },
  { name: 'Sourdough toast', brand: null, servingLabel: '1 slice', servingGrams: 55, kcal: 145, protein: 5.2, slots: ['breakfast', 'lunch'], weight: 3 },
  { name: 'Peanut butter', brand: 'Meridian', servingLabel: '1 tbsp', servingGrams: 16, kcal: 95, protein: 3.9, slots: ['breakfast', 'snack'], weight: 3 },
  { name: 'Flat white', brand: null, servingLabel: '1 cup', servingGrams: 180, kcal: 120, protein: 6.5, slots: ['breakfast', 'snack'], weight: 5 },
  { name: 'Chicken breast', brand: null, servingLabel: '150 g', servingGrams: 150, kcal: 248, protein: 46.5, slots: ['lunch', 'dinner'], weight: 6 },
  { name: 'Basmati rice', brand: null, servingLabel: '180 g cooked', servingGrams: 180, kcal: 234, protein: 4.9, slots: ['lunch', 'dinner'], weight: 5 },
  { name: 'Sweet potato', brand: null, servingLabel: '200 g', servingGrams: 200, kcal: 172, protein: 3.2, slots: ['lunch', 'dinner'], weight: 3 },
  { name: 'Mixed salad', brand: null, servingLabel: '100 g', servingGrams: 100, kcal: 22, protein: 1.4, slots: ['lunch', 'dinner'], weight: 4 },
  { name: 'Olive oil', brand: null, servingLabel: '1 tbsp', servingGrams: 14, kcal: 119, protein: 0, slots: ['lunch', 'dinner'], weight: 3 },
  { name: 'Tuna steak', brand: null, servingLabel: '140 g', servingGrams: 140, kcal: 184, protein: 40.6, slots: ['lunch', 'dinner'], weight: 3 },
  { name: 'Wholemeal wrap', brand: null, servingLabel: '1 wrap', servingGrams: 64, kcal: 190, protein: 6.4, slots: ['lunch'], weight: 4 },
  { name: 'Hummus', brand: null, servingLabel: '50 g', servingGrams: 50, kcal: 145, protein: 3.9, slots: ['lunch', 'snack'], weight: 3 },
  { name: 'Cheddar', brand: null, servingLabel: '30 g', servingGrams: 30, kcal: 124, protein: 7.6, slots: ['lunch', 'snack'], weight: 3 },
  { name: 'Salmon fillet', brand: null, servingLabel: '130 g', servingGrams: 130, kcal: 271, protein: 27.8, slots: ['dinner'], weight: 4 },
  { name: 'Lean beef mince 5%', brand: null, servingLabel: '150 g', servingGrams: 150, kcal: 202, protein: 31.5, slots: ['dinner'], weight: 4 },
  { name: 'Wholewheat pasta', brand: null, servingLabel: '200 g cooked', servingGrams: 200, kcal: 248, protein: 10.4, slots: ['dinner'], weight: 4 },
  { name: 'Tomato sauce', brand: null, servingLabel: '150 g', servingGrams: 150, kcal: 82, protein: 2.1, slots: ['dinner'], weight: 3 },
  { name: 'Broccoli', brand: null, servingLabel: '120 g', servingGrams: 120, kcal: 41, protein: 3.4, slots: ['dinner'], weight: 4 },
  { name: 'Tofu', brand: null, servingLabel: '150 g', servingGrams: 150, kcal: 176, protein: 18.2, slots: ['dinner'], weight: 2 },
  { name: 'Whey protein', brand: 'Bulk', servingLabel: '1 scoop', servingGrams: 30, kcal: 117, protein: 24, slots: ['snack'], weight: 5 },
  { name: 'Protein bar', brand: 'Grenade', servingLabel: '1 bar', servingGrams: 60, kcal: 214, protein: 21, slots: ['snack'], weight: 3 },
  { name: 'Almonds', brand: null, servingLabel: '25 g', servingGrams: 25, kcal: 145, protein: 5.3, slots: ['snack'], weight: 3 },
  { name: 'Dark chocolate', brand: null, servingLabel: '25 g', servingGrams: 25, kcal: 135, protein: 1.9, slots: ['snack'], weight: 3 },
  { name: 'Rice cakes', brand: null, servingLabel: '2 cakes', servingGrams: 18, kcal: 70, protein: 1.5, slots: ['snack'], weight: 2 },
  { name: 'Beer', brand: null, servingLabel: '1 pint', servingGrams: 568, kcal: 208, protein: 1.8, slots: ['snack', 'dinner'], weight: 2 },
];

interface SlotPlan {
  slot: MealSlot;
  /** Share of the day's calories. */
  share: number;
  /** Local wall-clock window the meal is logged in. */
  from: number;
  to: number;
  items: [number, number];
}

const SLOT_PLAN: readonly SlotPlan[] = [
  { slot: 'breakfast', share: 0.24, from: 7.0, to: 9.25, items: [2, 4] },
  { slot: 'lunch', share: 0.31, from: 12.0, to: 13.75, items: [2, 4] },
  { slot: 'dinner', share: 0.34, from: 18.5, to: 21.0, items: [2, 4] },
  { slot: 'snack', share: 0.11, from: 15.0, to: 16.5, items: [1, 2] },
];

interface ExercisePlan {
  name: string;
  muscleGroup: Exercise['muscleGroup'];
  unit: Exercise['unit'];
  /** Working weight in kg at the start of the block. */
  start: number;
  reps: [number, number];
  sets: number;
}

const UPPER: readonly ExercisePlan[] = [
  { name: 'Bench press', muscleGroup: 'chest', unit: 'kg', start: 72.5, reps: [5, 8], sets: 4 },
  { name: 'Barbell row', muscleGroup: 'back', unit: 'kg', start: 65, reps: [6, 10], sets: 4 },
  { name: 'Overhead press', muscleGroup: 'shoulders', unit: 'kg', start: 42.5, reps: [6, 10], sets: 3 },
  { name: 'Lat pulldown', muscleGroup: 'back', unit: 'kg', start: 55, reps: [8, 12], sets: 3 },
  { name: 'Cable curl', muscleGroup: 'arms', unit: 'kg', start: 25, reps: [10, 14], sets: 3 },
];

const LOWER: readonly ExercisePlan[] = [
  { name: 'Back squat', muscleGroup: 'legs', unit: 'kg', start: 95, reps: [4, 8], sets: 4 },
  { name: 'Romanian deadlift', muscleGroup: 'legs', unit: 'kg', start: 90, reps: [6, 10], sets: 3 },
  { name: 'Leg press', muscleGroup: 'legs', unit: 'kg', start: 160, reps: [8, 12], sets: 3 },
  { name: 'Standing calf raise', muscleGroup: 'legs', unit: 'kg', start: 60, reps: [10, 15], sets: 3 },
  { name: 'Hanging leg raise', muscleGroup: 'core', unit: 'bodyweight', start: 0, reps: [8, 14], sets: 3 },
];

/** Monday and Thursday upper, Tuesday and Friday lower. 1 = Monday … 5 = Friday. */
const TRAINING_DAYS: Readonly<Record<number, 'upper' | 'lower'>> = { 1: 'upper', 2: 'lower', 4: 'upper', 5: 'lower' };

let idCounter = 0;
function seedId(prefix: string): string {
  idCounter += 1;
  const n = idCounter.toString(16).padStart(8, '0');
  const tag = [...prefix].slice(0, 4).map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').padEnd(8, '0');
  return `${n}-0000-4000-8000-${tag}0000`;
}

/** Wall-clock hours as a `HH:MM` string, so timestamps go through `instantOfLocal` and respect DST. */
function clock(hours: number): `${string}:${string}` {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Generate the whole history. Pure: no clock, no filesystem, no database.
 */
export function seedData(options: SeedOptions = {}): SeedData {
  const days = options.days ?? 400;
  const endDate = options.endDate ?? DEFAULT_END_DATE;
  const timeZone = options.timeZone ?? DEFAULT_TEST_TZ;
  const kcalTarget = options.kcalTarget ?? 2400;
  const proteinTarget = options.proteinTarget ?? 170;
  const rng = new Rng(mulberry32(options.seed ?? 20250309));

  idCounter = 0;

  const foods: Food[] = CATALOGUE.map((c) => ({
    id: seedId('food'),
    name: c.name,
    brand: c.brand,
    servingLabel: c.servingLabel,
    servingGrams: c.servingGrams,
    kcalPerServing: c.kcal,
    proteinPerServing: c.protein,
    useCount: 0,
    lastUsedAt: null,
    hourHistogram: null,
    archived: 0,
    updatedAt: 0,
    deleted: 0,
  }));
  const foodIndex = new Map(CATALOGUE.map((c, i) => [c.name, i]));
  const histograms = foods.map(() => new Array<number>(24).fill(0));

  const exercises: Exercise[] = [...UPPER, ...LOWER].map((p) => ({
    id: seedId('exer'),
    name: p.name,
    muscleGroup: p.muscleGroup,
    unit: p.unit,
    updatedAt: 0,
    deleted: 0,
  }));
  const exerciseIndex = new Map(exercises.map((e, i) => [e.name, i]));

  const routines: Routine[] = [
    { id: seedId('rout'), name: 'Upper', updatedAt: 0, deleted: 0 },
    { id: seedId('rout'), name: 'Lower', updatedAt: 0, deleted: 0 },
  ];
  const [upperRoutine, lowerRoutine] = routines;
  if (!upperRoutine || !lowerRoutine) throw new Error('unreachable: routines are literals');

  const routineItems: RoutineItem[] = [
    ...UPPER.map((p, i) => ({ plan: p, i, routine: upperRoutine })),
    ...LOWER.map((p, i) => ({ plan: p, i, routine: lowerRoutine })),
  ].map(({ plan, i, routine }) => ({
    id: seedId('ritm'),
    routineId: routine.id,
    exerciseId: exerciseAt(exercises, exerciseIndex, plan.name).id,
    orderIndex: i,
    targetSets: plan.sets,
    updatedAt: 0,
    deleted: 0,
  }));

  const meals: Meal[] = [
    { id: seedId('meal'), name: 'Usual breakfast', updatedAt: 0, deleted: 0 },
    { id: seedId('meal'), name: 'Chicken and rice', updatedAt: 0, deleted: 0 },
    { id: seedId('meal'), name: 'Post-gym shake', updatedAt: 0, deleted: 0 },
  ];
  const mealItems: MealItem[] = [
    ...mealOf(meals, 0, ['Porridge oats', 'Semi-skimmed milk', 'Blueberries'], foods, foodIndex),
    ...mealOf(meals, 1, ['Chicken breast', 'Basmati rice', 'Broccoli'], foods, foodIndex),
    ...mealOf(meals, 2, ['Whey protein', 'Banana'], foods, foodIndex),
  ];

  const foodLog: FoodLogEntry[] = [];
  const sessions: Session[] = [];
  const sets: WorkoutSet[] = [];
  const bodyMetrics: BodyMetric[] = [];

  let weight = options.startWeight ?? 88.6;
  let trueWeight = weight;
  const startDate = addLocalDays(endDate, -(days - 1));

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const localDate = addLocalDays(startDate, dayIndex);
    const dow = localDayOfWeek(localDate);
    const weekend = dow === 0 || dow === 6;

    // --- nutrition -------------------------------------------------------------------------
    // 4% of days are simply not logged. Charts must survive gaps; pretending otherwise is why
    // "average over the last 7 days" silently divides by 7 when it should divide by 5.
    const logged = !rng.bool(0.04);
    let intake = 0;

    if (logged) {
      const dayTarget = kcalTarget * (weekend ? rng.float(1.05, 1.2) : rng.float(0.93, 1.06));
      for (const plan of SLOT_PLAN) {
        if (plan.slot === 'snack' && rng.bool(0.25)) continue;
        const slotTarget = dayTarget * plan.share;
        const candidates = CATALOGUE.filter((c) => c.slots.includes(plan.slot));
        const wanted = rng.int(plan.items[0], plan.items[1]);
        const chosen = Array.from({ length: wanted }, () => weightedPick(rng, candidates));

        // Portions are scaled so the meal lands on its share of the day's target, then snapped to
        // the half-servings a person actually logs. Picking `qty` at random instead — the obvious
        // implementation — makes the day's total a function of which foods came up, which drifts
        // hundreds of calories below target and quietly bends the whole weight curve.
        const baseKcal = chosen.reduce((sum, c) => sum + c.kcal, 0);
        const scale = baseKcal > 0 ? slotTarget / baseKcal : 1;
        const at = rng.float(plan.from, plan.to);

        chosen.forEach((food, i) => {
          const qty = clamp(Math.round(food.kcal * scale * rng.float(0.9, 1.1) / food.kcal * 2) / 2, 0.5, 3);
          const hours = at + i * rng.float(0.02, 0.09);
          const loggedAt = instantOfLocal(localDate, clock(hours), timeZone);
          const idx = foodIndex.get(food.name);
          if (idx === undefined) throw new Error(`unreachable: ${food.name} not in catalogue`);
          const row = foods[idx];
          const histogram = histograms[idx];
          if (!row || !histogram) throw new Error(`unreachable: no food row for ${food.name}`);
          const kcal = round1(food.kcal * qty);
          foodLog.push({
            id: seedId('flog'),
            loggedAt,
            localDate,
            foodId: row.id,
            qty,
            kcal,
            protein: round1(food.protein * qty),
            slot: plan.slot,
            updatedAt: loggedAt,
            deleted: 0,
          });
          intake += kcal;
          row.useCount += 1;
          row.lastUsedAt = Math.max(row.lastUsedAt ?? 0, loggedAt);
          // The histogram bucket must be the hour the row was actually logged at, or the quick-add
          // ranking is being tested against a different history than the one in `food_log`.
          const hour = Math.floor(hours) % 24;
          histogram[hour] = (histogram[hour] ?? 0) + 1;
        });
      }

      // The late snack. ~6% of nights, logged at 23:5x — the exact case that a UTC-derived
      // calendar day gets wrong, present in the demo data on purpose.
      if (rng.bool(0.06)) {
        const food = weightedPick(rng, CATALOGUE.filter((c) => c.slots.includes('snack')));
        const loggedAt = instantOfLocal(localDate, clock(23 + rng.float(0.85, 0.99)), timeZone);
        const idx = foodIndex.get(food.name);
        const row = idx === undefined ? undefined : foods[idx];
        const histogram = idx === undefined ? undefined : histograms[idx];
        if (row && histogram) {
          foodLog.push({
            id: seedId('flog'),
            loggedAt,
            localDate,
            foodId: row.id,
            qty: 1,
            kcal: food.kcal,
            protein: food.protein,
            slot: 'snack',
            updatedAt: loggedAt,
            deleted: 0,
          });
          intake += food.kcal;
          row.useCount += 1;
          row.lastUsedAt = Math.max(row.lastUsedAt ?? 0, loggedAt);
          histogram[23] = (histogram[23] ?? 0) + 1;
        }
      }
    }

    // --- bodyweight ------------------------------------------------------------------------
    // Energy balance, ~7700 kcal per kg. Maintenance scales with bodyweight, so the loss curve
    // flattens on its own — which is what makes a real weight chart interesting.
    const maintenance = 29.5 * trueWeight + (weekend ? 60 : 180);
    const eaten = logged ? intake : kcalTarget * rng.float(1.0, 1.15);
    trueWeight += (eaten - maintenance) / 7700;
    weight = round1(trueWeight + rng.gauss(0, 0.42));

    // Weighed in most mornings, not all — and not at all on ~22% of days.
    if (!rng.bool(0.22)) {
      const at = instantOfLocal(localDate, clock(rng.float(6.5, 8.5)), timeZone);
      bodyMetrics.push({
        id: seedId('body'),
        localDate,
        weight,
        bodyFatPct: round1(11 + (trueWeight - 78) * 0.55 + rng.gauss(0, 0.3)),
        waist: round1(78 + (trueWeight - 78) * 0.6),
        chest: round1(101 + (trueWeight - 78) * 0.25),
        arm: round1(35.5 + (trueWeight - 78) * 0.08),
        updatedAt: at,
        deleted: 0,
      });
    }

    // --- training --------------------------------------------------------------------------
    const kind = TRAINING_DAYS[dow];
    if (kind && !rng.bool(0.15)) {
      const week = Math.floor(dayIndex / 7);
      const deload = week % 8 === 7;
      const plans = kind === 'upper' ? UPPER : LOWER;
      const startedAt = instantOfLocal(localDate, clock(rng.float(17.5, 19.0)), timeZone);
      const session: Session = {
        id: seedId('sess'),
        startedAt,
        endedAt: startedAt + rng.int(48, 82) * 60_000,
        localDate,
        routineId: kind === 'upper' ? upperRoutine.id : lowerRoutine.id,
        notes: deload ? 'deload week' : null,
        updatedAt: startedAt,
        deleted: 0,
      };
      sessions.push(session);

      for (const plan of plans) {
        const exercise = exerciseAt(exercises, exerciseIndex, plan.name);
        // ~1.1% per week of progression, damped, with a 12% drop on deload weeks.
        const progression = 1 + 0.011 * (week * (1 - week / 260));
        const base = plan.start * progression * (deload ? 0.88 : 1);
        const warmups = plan.unit === 'bodyweight' ? 0 : 1;
        for (let i = 0; i < plan.sets + warmups; i += 1) {
          const warmup = i < warmups;
          const working = round2(roundToPlate(base * rng.float(0.985, 1.015)));
          sets.push({
            id: seedId('set'),
            sessionId: session.id,
            exerciseId: exercise.id,
            setIndex: i,
            reps: warmup ? 8 : rng.int(plan.reps[0], plan.reps[1]),
            weight: warmup ? round2(roundToPlate(base * 0.55)) : working,
            rpe: warmup ? null : rng.int(7, 9),
            isWarmup: warmup ? 1 : 0,
            updatedAt: startedAt + i * 90_000,
            deleted: 0,
          });
        }
      }
    }
  }

  // Quick-add ranking data, derived from what was actually logged rather than invented.
  foods.forEach((food, i) => {
    const histogram = histograms[i];
    food.hourHistogram = histogram ? JSON.stringify(histogram) : null;
    food.updatedAt = food.lastUsedAt ?? 0;
  });

  const settingsUpdatedAt = instantOfLocal(startDate, '07:00', timeZone);
  const settings: Settings[] = [
    {
      id: 'settings',
      kcalTarget,
      proteinTarget,
      weightUnit: 'kg',
      lengthUnit: 'cm',
      weekStart: 1,
      updatedAt: settingsUpdatedAt,
      deleted: 0,
    },
  ];

  return { foods, meals, mealItems, foodLog, exercises, routines, routineItems, sessions, sets, bodyMetrics, settings };
}

function exerciseAt(exercises: Exercise[], index: Map<string, number>, name: string): Exercise {
  const i = index.get(name);
  const exercise = i === undefined ? undefined : exercises[i];
  if (!exercise) throw new Error(`unreachable: no exercise named ${name}`);
  return exercise;
}

function mealOf(
  meals: Meal[],
  mealIndex: number,
  names: readonly string[],
  foods: Food[],
  foodIndex: Map<string, number>,
): MealItem[] {
  const meal = meals[mealIndex];
  if (!meal) throw new Error(`unreachable: no meal at ${mealIndex}`);
  return names.map((name) => {
    const i = foodIndex.get(name);
    const food = i === undefined ? undefined : foods[i];
    if (!food) throw new Error(`unreachable: no food named ${name}`);
    return { id: seedId('mitm'), mealId: meal.id, foodId: food.id, qty: 1, updatedAt: 0, deleted: 0 };
  });
}

function weightedPick(rng: Rng, items: readonly CatalogueFood[]): CatalogueFood {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng.float(0, total);
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  const last = items[items.length - 1];
  if (!last) throw new Error('cannot pick from an empty catalogue');
  return last;
}

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;
/** Real barbells go up in 2.5 kg jumps; a chart of 71.83 kg squats is a tell that data is fake. */
const roundToPlate = (n: number): number => Math.round(n / 2.5) * 2.5;

/**
 * Insert generated rows into any Drizzle schema, skipping tables that schema does not define yet.
 * That tolerance is deliberate: `db-engineer` can add tables one at a time and the seeder keeps
 * working from the first one.
 */
export function insertSeed(
  db: {
    insert: (table: never) => { values: (rows: never) => { run: () => unknown } };
    transaction?: (body: (tx: unknown) => unknown) => unknown;
  },
  schema: Record<string, unknown>,
  data: SeedData,
): Record<string, number> {
  const inserted: Record<string, number> = {};
  const CHUNK = 400;
  const write = (): void => {
    for (const [name, rows] of Object.entries(data) as [keyof SeedData, object[]][]) {
      const table = schema[name];
      if (!table || rows.length === 0) continue;
      for (let i = 0; i < rows.length; i += CHUNK) {
        db.insert(table as never)
          .values(rows.slice(i, i + CHUNK) as never)
          .run();
      }
      inserted[name] = rows.length;
    }
  };
  // One transaction, not one per statement. SQLite fsyncs per commit; 400 days of seed data is
  // roughly a 10x difference, and it is the difference between the chart performance guard
  // measuring the chart and measuring the setup.
  if (typeof db.transaction === 'function') db.transaction(() => write());
  else write();
  return inserted;
}

/**
 * Seed a `makeTestDb()` handle. **The one-liner** — this is what a chart or query test should call:
 *
 *   const t = makeTestDb({ schema });
 *   seedTestDb(t, { days: 400 });
 *
 * It writes through the raw `better-sqlite3` handle with one prepared statement per table inside a
 * single transaction, rather than through Drizzle's insert builder. That is ~20x faster for a
 * 400-day history (single-digit milliseconds against a couple of hundred), which matters because
 * the performance guard has a 200ms budget and setup must not be most of it. Column names and
 * value encoding still come from the Drizzle table objects, so it stays honest about the schema.
 */
export function seedTestDb<TSchema extends TestSchema>(
  target: Pick<TestDb<TSchema>, 'sqlite' | 'schema'>,
  options: SeedOptions = {},
): SeedData {
  const data = seedData(options);
  const { sqlite } = target;
  const schema = target.schema as Record<string, unknown>;

  const foreignKeysWere = (sqlite.pragma('foreign_keys', { simple: true }) as number) === 1;
  // Seed data is generated parent-first per table but inserted table-by-table, so a child table can
  // land before its parent. The generator guarantees referential integrity by construction; the
  // check is re-enabled (and therefore still enforced for the test's own writes) immediately after.
  sqlite.pragma('foreign_keys = OFF');
  try {
    sqlite.transaction(() => {
      for (const [name, rows] of Object.entries(data) as [keyof SeedData, Record<string, unknown>[]][]) {
        const table = schema[name];
        if (!is(table, SQLiteTable) || rows.length === 0) continue;
        const columns = getTableColumns(table);
        const keys = Object.keys(columns).filter((key) => key in (rows[0] ?? {}));
        if (keys.length === 0) continue;
        const columnList = keys.map((key) => `"${columns[key]?.name ?? key}"`).join(', ');
        const placeholders = keys.map(() => '?').join(', ');
        const statement = sqlite.prepare(
          `insert into "${getTableName(table)}" (${columnList}) values (${placeholders})`,
        );
        for (const row of rows) {
          statement.run(keys.map((key) => encode(columns[key], row[key])));
        }
      }
    })();
  } finally {
    sqlite.pragma(`foreign_keys = ${foreignKeysWere ? 'ON' : 'OFF'}`);
  }
  return data;
}

function getTableName(table: SQLiteTable): string {
   
  return (table as any)[Symbol.for('drizzle:Name')] as string;
}

/** Hand the value to Drizzle's own encoder so booleans, json and dates go in the way Drizzle reads them. */
function encode(column: { mapToDriverValue: (value: unknown) => unknown } | undefined, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  return column ? column.mapToDriverValue(value) : value;
}

/**
 * A database with a full history already in it, for the price of a memcpy.
 *
 *   const { db } = makeSeededTestDb({ schema, days: 400 });
 *
 * Generating 400 days costs ~80ms and inserting it ~10ms. Doing that in every test would put the
 * data suite back in the seconds, so the seeded database is snapshotted once per worker exactly the
 * way the migrated one is. A chart test then pays microseconds for its fixture and can spend its
 * whole 200ms budget on the query it is actually measuring.
 */
export function makeSeededTestDb<TSchema extends TestSchema = TestSchema>(
  options: SeedOptions & Omit<MakeTestDbOptions<TSchema>, 'prepare' | 'cacheKey'> = {},
): TestDb<TSchema> {
  const { schema, migrationsFolder, fresh, foreignKeys, ...seedOptions } = options;
  return makeTestDb<TSchema>({
    schema,
    migrationsFolder,
    fresh,
    foreignKeys,
    cacheKey: `seed:${JSON.stringify({
      days: seedOptions.days ?? 400,
      endDate: seedOptions.endDate ?? DEFAULT_END_DATE,
      timeZone: seedOptions.timeZone ?? DEFAULT_TEST_TZ,
      seed: seedOptions.seed ?? null,
      startWeight: seedOptions.startWeight ?? null,
      kcalTarget: seedOptions.kcalTarget ?? null,
      proteinTarget: seedOptions.proteinTarget ?? null,
    })}`,
    prepare: (target) => {
      seedTestDb(target, seedOptions);
    },
  });
}

/** Row counts per table — what `scripts/seed.sh` prints. */
export function seedSummary(data: SeedData): Record<string, number> {
  return Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, (rows as unknown[]).length]));
}

/**
 * CLI, for `scripts/seed.sh <days>`.
 *
 *   npx tsx test/seed.ts --days 400 [--out <file>] [--seed <n>] [--tz <zone>]
 *
 * Writes a real SQLite file with the migrations applied and the history in it, so `scripts/demo.sh`
 * has something worth looking at. It uses whatever schema `resolveSchemaSource()` finds — the app's
 * once `src/db/schema.ts` exists, the throwaway fixture until then — so this keeps working across
 * the Sprint 1 handover without an edit.
 */
export interface SeedFileResult {
  /** Absolute path of the database written. */
  path: string;
  /** Row counts per table. */
  summary: Record<string, number>;
  /** Which schema it was built from — the app's, or the throwaway fixture. */
  label: string;
}

/** Write a seeded SQLite file. Exported so the CLI below is covered by a test rather than by hope. */
export function seedToFile(options: SeedOptions & { out: string }): SeedFileResult {
  const { out, ...seedOptions } = options;
  const source = resolveSchemaSource();
  const outPath = path.resolve(out);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.rmSync(outPath, { force: true });

  const sqlite = new Database(outPath);
  try {
    if (source.migrationsFolder) {
      migrate(drizzle(sqlite), { migrationsFolder: source.migrationsFolder });
    }
    const data = seedTestDb({ sqlite, schema: source.schema }, seedOptions);
    return { path: outPath, summary: seedSummary(data), label: source.label };
  } finally {
    sqlite.close();
  }
}

function runCli(argv: string[]): void {
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const days = Number(flag('days') ?? 400);
  const result = seedToFile({
    out: flag('out') ?? '.seed/vitals.db',
    days,
    ...(flag('seed') === undefined ? {} : { seed: Number(flag('seed')) }),
    ...(flag('tz') === undefined ? {} : { timeZone: String(flag('tz')) }),
  });

  console.log(`seeded ${days} days from ${result.label}`);
  console.log(`  -> ${result.path}`);
  for (const [table, count] of Object.entries(result.summary)) {
    console.log(`  ${table.padEnd(14)} ${String(count).padStart(6)}`);
  }
}

if (require.main === module) runCli(process.argv.slice(2));
