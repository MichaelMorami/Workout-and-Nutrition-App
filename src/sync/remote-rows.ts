/**
 * The remote row shapes, exactly as `supabase/migrations/**` defines them — snake_case, flat, and
 * with a `user_id` the local database does not have (local SQLite is single-user).
 *
 * `updated_at` and `logged_at` are `bigint` remotely and `number` here. PostgREST serialises a
 * bigint as a JSON number, and a ms epoch is far inside the 2^53 range a double represents exactly,
 * so this is lossless — but it is an assumption, so the mapping checks the value is finite rather
 * than trusting it.
 *
 * Types only. Nothing here imports a client.
 */
import type { FoodBasis } from '@/src/db';

/** Columns every synced table carries. `deleted` is a tombstone flag, never an absent row. */
interface RemoteSyncColumns {
  readonly id: string;
  readonly user_id: string;
  /** ms epoch written by the device that made the edit. Never stamped by the server. */
  readonly updated_at: number;
  /** 0 or 1. */
  readonly deleted: number;
}

export interface RemoteFoodRow extends RemoteSyncColumns {
  readonly name: string;
  readonly brand: string | null;
  readonly basis: FoodBasis;
  readonly serving_label: string;
  /** One serving in the canonical unit of `basis`: grams, or millilitres. */
  readonly serving_amount: number;
  readonly kcal_per_100: number;
  readonly protein_per_100: number;
  /** 0 or 1. Hidden from the grid, not deleted. */
  readonly archived: number;
}

export interface RemoteFoodLogRow extends RemoteSyncColumns {
  readonly logged_at: number;
  /** `YYYY-MM-DD` in the user's zone at log time. Carried, never derived from `logged_at`. */
  readonly local_date: string;
  /** Minutes after local midnight, 0–1439. */
  readonly local_minute: number;
  readonly food_id: string | null;
  readonly meal_id: string | null;
  readonly qty: number;
  /** Weight logs only. Mutually exclusive with `ml`; both null for rows predating #86. */
  readonly grams: number | null;
  /** Volume logs only. */
  readonly ml: number | null;
  readonly kcal: number;
  readonly protein: number;
  readonly slot: string;
}
