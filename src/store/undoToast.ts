/**
 * The undo toast's state (issue #21) — a zustand store because `QuickAddGrid` (which logs) and
 * `<UndoToast>` (which shows and reverses the log) are siblings under the Today screen, not a
 * parent/child pair: `<UndoToast>` has to float above the tab bar, clear of the scrolling grid
 * (`docs/decisions.md`), so it is mounted outside the `ScrollView` that `QuickAddGrid` lives in.
 * A store is what lets either side reach the same toast without threading it through a screen.
 *
 * The 2026-09-20 client ruling (issue #83, `docs/decisions.md` ruling 2): the toast auto-dismisses
 * `interaction.undoAutoDismissMs` (ten seconds) after `show()`, wall-clock — the clock keeps
 * running while the phone is locked or the app is backgrounded, there is no pause. That is this
 * store's only timed dismissal; every other trigger in `interaction.undoDismissedBy` is a
 * deliberate call from a component (`show()` replacing a toast still up counts as "anotherLog";
 * opening the portion sheet calls `dismiss()` directly) rather than something this store times
 * itself. `interaction.undoSurvives` lists scroll, screen lock and backgrounding on purpose — this
 * store has no scroll listener, and none should be added without a decision to change that.
 */
import { create } from 'zustand';
import type { UndoToken } from '../db';
import { interaction } from '../theme/tokens';

/** What undoing an action must subtract from the running Today totals — `QuickAddGrid` computes
 * this once, at the moment of the write, so `<UndoToast>` never has to re-derive it from a token. */
export interface LogDelta {
  readonly kcal: number;
  readonly protein: number;
  readonly entryCountDelta: number;
}

export interface UndoToastPayload {
  /** Reversed through `undo(db, { token })` — every log/edit/delete path on the day's log and the
   * quick-add grid produces one of these. Omit it only when `action` below does the reversing
   * instead (issue #100: a food archive is not a logged row, so there is no `UndoToken` for it). */
  readonly token?: UndoToken;
  /** `logTracker`'s key for the candidate this action logged — `<UndoToast>` forgets it here on
   * undo, so the next tap on the same tile logs fresh instead of trying to add a portion to a row
   * `undo()` just tombstoned. Only meaningful alongside `token`. */
  readonly candidateKey?: string;
  /** "Whey + Milk" or, after a double-tap, "Whey + Milk  ×2". */
  readonly title: string;
  /** "240 kcal · 40 g protein" — the entries' current total, not just what this action added. */
  readonly meta: string;
  /** What undoing this must subtract from a running Today total. Omitted when the action never
   * touched one — issue #100's food-archive delete changes no log total. */
  readonly delta?: LogDelta;
  /** An alternative reversal for an action `UndoToken` cannot express — e.g. issue #100's food
   * delete, where undo is just calling `setFoodArchived` again, not reverting a logged row. When
   * given, `<UndoToast>` calls this instead of `undo(db, { token })`/`forgetLog`, and swallows the
   * same way: a thrown `VitalsDbError` leaves the toast up and dismisses nothing. */
  readonly action?: () => void;
  /** The verb the Undo button's accessibility label reads before the title — "Undo `verb` X".
   * Defaults to `'logging'`, the original (and still by far the most common) case. */
  readonly verb?: string;
}

interface UndoToastState {
  readonly toast: UndoToastPayload | null;
  readonly show: (payload: UndoToastPayload) => void;
  readonly dismiss: () => void;
}

let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

function clearAutoDismiss(): void {
  if (autoDismissTimer !== null) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }
}

export const useUndoToastStore = create<UndoToastState>((set) => ({
  toast: null,
  show: (payload) => {
    clearAutoDismiss();
    autoDismissTimer = setTimeout(() => {
      autoDismissTimer = null;
      set({ toast: null });
    }, interaction.undoAutoDismissMs);
    set({ toast: payload });
  },
  dismiss: () => {
    clearAutoDismiss();
    set({ toast: null });
  },
}));
