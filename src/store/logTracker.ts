/**
 * "Was this candidate just logged?" — the bookkeeping double-tap needs (issue #21).
 *
 * A tap on a tile or a search row means one of two different database calls depending on timing:
 * a fresh `logFood`/`logMeal` if nothing was logged for that candidate recently, or `addPortion`
 * on the SAME row if a tap landed within `interaction.repeatWindowMs` of the last one
 * (`docs/decisions.md` §2 — double-tap adds a portion, it does not create a second log entry).
 *
 * Module-level, not component state, on purpose: `QuickAddGrid` records a log here on every tap,
 * and `UndoToast` (a sibling mounted outside the scrolling content, so it can float above the tab
 * bar) needs to forget the same entry the moment its action is undone — a row `undo()` just
 * tombstoned cannot receive `addPortion` on the next tap (it would throw `not_found`, and that tap
 * would silently do nothing, which is exactly the silent failure the tap doctrine forbids). Neither
 * component can own this map alone, so it lives here, at the module scope both share.
 *
 * Not a store: nothing here is rendered directly, so there is no reactive state to subscribe to —
 * plain functions over a `Map` are the whole contract.
 */
import type { LogReceipt } from '../db';
import { interaction } from '../theme/tokens';

interface TrackedLog {
  readonly receipt: LogReceipt;
  readonly at: number;
}

const lastLogs = new Map<string, TrackedLog>();

/** Stable key for a candidate — a food and a meal can share numeric ids, so the kind is part of it. */
export function logTrackerKey(candidate: { readonly kind: 'food' | 'meal'; readonly id: string }): string {
  return `${candidate.kind}-${candidate.id}`;
}

/** Records what a fresh log or an `addPortion` just wrote, so the next tap can find it. */
export function trackLog(key: string, receipt: LogReceipt, at: number): void {
  lastLogs.set(key, { receipt, at });
}

/** The tracked log for `key`, or `undefined` if there is none or it has aged out of the repeat
 * window — the caller's cue to log fresh instead of adding a portion. */
export function recentLog(key: string, now: number): LogReceipt | undefined {
  const entry = lastLogs.get(key);
  if (!entry) return undefined;
  if (now - entry.at >= interaction.repeatWindowMs) return undefined;
  return entry.receipt;
}

/** Drops the tracked entry — after an undo, so the next tap starts fresh rather than trying to add
 * a portion to a row that no longer exists. */
export function forgetLog(key: string): void {
  lastLogs.delete(key);
}

/** Test-only: every agent's suite runs in one process, and this module's state would otherwise leak
 * between test files that both import it. */
export function __resetLogTracker(): void {
  lastLogs.clear();
}
