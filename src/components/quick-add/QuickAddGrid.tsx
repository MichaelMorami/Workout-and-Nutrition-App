/**
 * `<QuickAddGrid>` — the Today screen's quick-add section (issue #40): a section header, six
 * ranked tiles (or fewer while the catalogue is still small), and a teaching empty state for a
 * first-time user with nothing logged yet.
 *
 * RANKED ONCE PER VISIT, RE-RANKED ONLY AT THREE RETURN POINTS (issue #103). `quickAddCandidates`
 * is read once, in a lazy `useState` initialiser, not on every render or after every log —
 * re-ranking right after a tap would reorder or disappear the tile the user just watched confirm
 * with a haptic and a wash, and the user's own ruling on #103 is explicit: no re-rank while Today
 * stays focused, whatever the trigger (a tile tap, a double-tap portion add, an undo). It refetches
 * only when Today is genuinely being *returned to*:
 *
 *   1. Navigation focus — `useFocusEffect` (the `app/meals`, `app/foods` precedent), covering a
 *      switch back from another tab or a pop from a pushed screen such as Settings → Foods/Meals.
 *      The hook also fires on the very first focus, which lands the moment after this component's
 *      own mount already read the same data — `focused` below is the same "skip the first
 *      call" guard `DayLogList`'s own `refreshToken` effect uses, so that first focus is a no-op,
 *      not a redundant second read.
 *   2. The app returning to the foreground — an `AppState` `'change'` listener, refetching only on
 *      a transition *to* `'active'` (backgrounding and foregrounding again is its own "return").
 *   3. `refreshToken` — bumped by the Today screen when the search sheet or the create-food sheet
 *      logs and then closes. Both render *inside* Today (never pushed, never a separate route), so
 *      neither one fires a navigation focus event on its own; `refreshToken` is the seam, mirroring
 *      `DayLogList`'s own prop of the same name and the same "skip the first call" discipline. The
 *      Today screen bumps it from the search sheet's own `onLogged`/`onPortionAdded` — the grid is
 *      hidden behind that sheet's modal at that instant, so re-ranking then is invisible, and by
 *      the time the sheet's own close animation finishes the grid is already showing the result.
 *
 * A refetch never remounts a surviving tile — `key={`${candidate.kind}-${candidate.id}`}` below is
 * unchanged, so `QuickAddTile`'s own "Logged" wash and portion badge (`QuickAddTile`'s local state)
 * stay with the right candidate even if its position in the row shifts.
 *
 * ONLY SIX ITEMS, NEVER AN UNBOUNDED LIST. `quickAddCandidates(..., { limit: 6 })` guarantees a
 * fixed, small array — this is a bounded grid, not a scrolling list, so a plain `View`/`map` is the
 * right tool here, not `FlashList` (`CLAUDE.md`'s virtualisation rule is about unbounded lists:
 * the day's log, search results).
 *
 * THE WRITE IS OPTIMISTIC AND NEVER BLOCKS THE TILE. `logFood`/`logMeal`/`addPortion` are
 * synchronous local SQLite writes (`src/db`'s contract) — there is no network round trip to wait
 * on, so the tile's own "Logged" wash (`QuickAddTile`) already _is_ the confirmation. A write
 * failure is swallowed here, not surfaced as a dialog (the tap doctrine: undo, not confirmation,
 * and there is nothing to undo from a failed write) — the resting UI resumes on the next
 * hold-timeout as if the tap simply did not count.
 *
 * THREE WAYS TO LOG, ONE PLACE THAT DECIDES (issue #21). A tap goes through `handleTap`, which
 * asks `logTracker` whether this candidate was logged inside `interaction.repeatWindowMs` — a
 * fresh `logFood`/`logMeal` if not, `addPortion` on the same rows if so (`onLogged` vs.
 * `onPortionAdded`, so a caller summing running totals never double-counts a portion add against
 * rows it already counted once). A long-press opens `<PortionSheet>` instead of logging, and
 * dismisses any toast still up (`interaction.undoDismissedBy` includes `'sheetOpened'`) so a stale
 * undo from the tap before it never survives into a different decision. The sheet's own "Log"
 * always writes fresh — a chosen serving multiple, not an addition to whatever's already there —
 * and lands back on the same `onLogged` path a plain tap uses. Every one of the three raises the
 * undo toast (`useUndoToastStore`) with the token the write returned.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { addPortion, logFood, logMeal, quickAddCandidates, VitalsDbError, type Candidate, type LogReceipt } from '../../db';
import { deviceWhen } from '../../hooks/deviceWhen';
import { useDb } from '../../hooks/useDb';
import { useTheme } from '../../hooks/useTheme';
import { forgetLog, logTrackerKey, recentLog, trackLog } from '../../store/logTracker';
import { useUndoToastStore, type LogDelta } from '../../store/undoToast';
import { layout, radius, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { PortionSheet } from './PortionSheet';
import { QuickAddTile } from './QuickAddTile';

export type QuickAddGridProps = {
  /** Called after a *fresh* log lands — a first tap, or the portion sheet's own Log — with the
   * receipt (`kcal`/`protein` logged, for #41's arcs and any other listener). Never called for a
   * write that failed, and never called for a double-tap's `addPortion` (see `onPortionAdded`). */
  readonly onLogged?: (receipt: LogReceipt) => void;
  /** Called after a double-tap adds a portion to an existing row. Carries only what changed —
   * `receipt.entries` after an `addPortion` holds the rows' new, larger totals, not an addition, so
   * a caller summing running totals from `onLogged` alone would double-count them. */
  readonly onPortionAdded?: (delta: LogDelta) => void;
  /** Bumped by the Today screen when the search sheet or the create-food sheet logs and then
   * closes — see the module note on why that pair needs its own seam, distinct from navigation
   * focus and `AppState`. Only a genuine change refetches, never the first render. */
  readonly refreshToken?: number;
  /** Formatting locale, forwarded to every tile and the "Ranked for" hour. Defaults to the device's. */
  readonly locale?: string;
  readonly testID?: string;
};

function textStyle(token: TypeStyle, color: string) {
  return {
    fontFamily: token.fontFamily,
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    textTransform: token.textTransform,
    color,
  };
}

/** "4 PM" (or "16" in a 24-hour locale) — the hour the grid was ranked for. */
function hourLabel(at: number, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone }).format(at);
}

/** [a, b, c, d, e] -> [[a, b], [c, d], [e]] — exactly two tiles per row, the last row short if the
 * count is odd (a small catalogue on day one rarely fills all six). */
function pairs<T>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

/** Sums `kcal`/`protein` off any row shape that carries them — `FoodLogRow` (`receipt.entries`) and
 * `LogAmount` (`addPortion`'s `undo.previous`) both qualify, so one function serves both. */
function totalsOf(rows: readonly { readonly kcal: number; readonly protein: number }[]): { kcal: number; protein: number } {
  return rows.reduce((sum, row) => ({ kcal: sum.kcal + row.kcal, protein: sum.protein + row.protein }), { kcal: 0, protein: 0 });
}

/** "Skyr Pot" once, "Skyr Pot ×2" from the second portion on — the undo toast's title. */
function toastTitle(name: string, portions: number): string {
  return portions > 1 ? `${name} ×${portions}` : name;
}

/** "240 kcal · 40 g protein" — the toast's meta line: the entries' current total, not just the delta. */
function toastMeta(totals: { kcal: number; protein: number }, locale?: string): string {
  const kcal = Math.round(totals.kcal).toLocaleString(locale);
  const protein = Math.round(totals.protein).toLocaleString(locale);
  return `${kcal} kcal · ${protein} g protein`;
}

function EmptyState({ theme, testID }: { theme: Theme; testID: string }) {
  const { sectionLabel, tile } = theme.color;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel="No usual foods yet. Log your first food and it will appear here next time."
      style={[styles.empty, { borderColor: tile.ghostBorder }]}
    >
      <Text style={textStyle(type.body, sectionLabel.labelText)}>No usual foods yet.</Text>
      <Text style={[textStyle(type.label, sectionLabel.metaText), styles.emptyLine]}>
        Log your first food and it will appear here next time.
      </Text>
    </View>
  );
}

export function QuickAddGrid({ onLogged, onPortionAdded, refreshToken, locale, testID = 'quick-add-grid' }: QuickAddGridProps) {
  const db = useDb();
  const theme = useTheme();
  const { sectionLabel } = theme.color;

  // Captured once per mount — see the module note on why re-ranking is not tied to render.
  const [when] = useState(deviceWhen);
  const [candidates, setCandidates] = useState<Candidate[]>(() => quickAddCandidates(db, { ...when, limit: 6 }));
  const [sheetCandidate, setSheetCandidate] = useState<Candidate | null>(null);

  // The module note's three return points. None of them fire from a tap, a double-tap or an
  // undo — those only ever touch `handleTap`/`handleSheetLog` below, never this state.
  const refetch = useCallback((): void => {
    setCandidates(quickAddCandidates(db, { ...when, limit: 6 }));
    // `db`/`when` are stable for this component's whole lifetime (a fresh `when` object per render
    // would defeat "ranked once per visit" the same way `DayLogList`'s own refetch effect notes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  // 1. Navigation focus — skips the very first focus, which lands right after the lazy `useState`
  // initialiser above already did this exact read (mirrors `app/meals`, `app/foods`).
  const everFocused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!everFocused.current) {
        everFocused.current = true;
        return;
      }
      refetch();
    }, [refetch]),
  );

  // 2. The app returning to the foreground. `AppState`'s `'change'` event only fires on an actual
  // transition, never on mount, so this never duplicates the initial read either.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refetch();
    });
    return () => subscription.remove();
  }, [refetch]);

  // 3. `refreshToken` — the search/create-food sheet's own seam (module note). Skips the first
  // render, exactly `DayLogList`'s own `refreshToken` effect.
  const tokenSeen = useRef(false);
  useEffect(() => {
    if (!tokenSeen.current) {
      tokenSeen.current = true;
      return;
    }
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const logFreshCandidate = (candidate: Candidate, at: { at: number; timeZone: string }, portions?: number): LogReceipt =>
    candidate.kind === 'food'
      ? logFood(db, { ...at, foodId: candidate.id, amount: portions === undefined ? undefined : { servings: portions } })
      : logMeal(db, { ...at, mealId: candidate.id, portions });

  const publishToast = (candidate: Candidate, receipt: LogReceipt, totals: { kcal: number; protein: number }, delta: LogDelta): void => {
    useUndoToastStore.getState().show({
      token: receipt.undo,
      candidateKey: logTrackerKey(candidate),
      title: toastTitle(candidate.name, receipt.portions),
      meta: toastMeta(totals, locale),
      delta,
    });
  };

  const handleTap = (candidate: Candidate): number => {
    const key = logTrackerKey(candidate);
    const now = deviceWhen();
    try {
      const previous = recentLog(key, now.at);
      if (previous) {
        const next = addPortion(db, { at: now.at, receipt: previous });
        trackLog(key, next, now.at);
        const totals = totalsOf(next.entries);
        const prevTotals = next.undo.kind === 'revert' ? totalsOf(next.undo.previous) : totalsOf(previous.entries);
        const delta: LogDelta = { kcal: totals.kcal - prevTotals.kcal, protein: totals.protein - prevTotals.protein, entryCountDelta: 0 };
        publishToast(candidate, next, totals, delta);
        onPortionAdded?.(delta);
        return next.portions;
      }

      const receipt = logFreshCandidate(candidate, now);
      trackLog(key, receipt, now.at);
      const totals = totalsOf(receipt.entries);
      const delta: LogDelta = { kcal: totals.kcal, protein: totals.protein, entryCountDelta: receipt.entries.length };
      publishToast(candidate, receipt, totals, delta);
      onLogged?.(receipt);
      return receipt.portions;
    } catch (err) {
      // See the module note: no dialog, no crash — a failed write is not a user-visible event.
      if (!(err instanceof VitalsDbError)) throw err;
      forgetLog(key);
      return 1;
    }
  };

  const handleLongPress = (candidate: Candidate): void => {
    // `interaction.undoDismissedBy` includes `'sheetOpened'` — a toast from the tap before this
    // long-press must not survive into a decision the sheet is about to make instead.
    useUndoToastStore.getState().dismiss();
    setSheetCandidate(candidate);
  };

  const handleSheetLog = (candidate: Candidate, portions: number): void => {
    const now = deviceWhen();
    try {
      const receipt = logFreshCandidate(candidate, now, portions);
      trackLog(logTrackerKey(candidate), receipt, now.at);
      const totals = totalsOf(receipt.entries);
      const delta: LogDelta = { kcal: totals.kcal, protein: totals.protein, entryCountDelta: receipt.entries.length };
      publishToast(candidate, receipt, totals, delta);
      onLogged?.(receipt);
    } catch (err) {
      if (!(err instanceof VitalsDbError)) throw err;
    }
  };

  return (
    <View testID={testID}>
      <View style={styles.header}>
        <Text style={textStyle(type.micro, sectionLabel.labelText)}>Quick add</Text>
        {candidates.length > 0 ? (
          <Text testID={`${testID}-ranked-for`} style={textStyle(type.label, sectionLabel.metaText)}>
            {`Ranked for ${hourLabel(when.at, when.timeZone, locale)}`}
          </Text>
        ) : null}
      </View>

      {candidates.length === 0 ? (
        <EmptyState theme={theme} testID={`${testID}-empty`} />
      ) : (
        <View style={styles.rows}>
          {pairs(candidates).map((row, i) => (
            // Rows are order-stable within one mount (candidates are fetched once); the index is a
            // safe key here, and each candidate below keys on its own id.
            <View key={i} style={styles.row}>
              {row.map((candidate) => (
                <View key={`${candidate.kind}-${candidate.id}`} style={styles.cell}>
                  <QuickAddTile
                    candidate={candidate}
                    onLog={handleTap}
                    onLongPress={handleLongPress}
                    theme={theme}
                    locale={locale}
                    testID={`${testID}-tile-${candidate.id}`}
                  />
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      <PortionSheet
        candidate={sheetCandidate}
        theme={theme}
        locale={locale}
        onLog={handleSheetLog}
        onClose={() => setSheetCandidate(null)}
        testID={`${testID}-portion-sheet`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space[3],
  },
  rows: {
    gap: layout.tileGap,
  },
  row: {
    flexDirection: 'row',
    gap: layout.tileGap,
  },
  cell: {
    flex: 1,
  },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    paddingVertical: space[7],
    paddingHorizontal: space[6],
    alignItems: 'center',
    gap: space[2],
  },
  emptyLine: {
    textAlign: 'center',
  },
});
