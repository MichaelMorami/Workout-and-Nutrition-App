/**
 * `<DayLogList>` — issue #42, the day's log itself: below the search bar slot on the Today screen
 * (#20's revised layout note). Tap a row to correct its amount through #21's already-landed
 * `<PortionSheet>`; swipe it to reveal Delete, with undo — never a confirmation dialog, the same tap
 * doctrine `docs/decisions.md` states for the quick-add grid.
 *
 * READ ONCE, REFRESHED BY A TOKEN, NOT A POLL. `dayLog(db, localDate)` runs once in a lazy
 * `useState` initialiser, exactly `<QuickAddGrid>`'s own "once per visit" discipline. It does not,
 * on its own, know about a write `<QuickAddGrid>` makes — `refreshToken` is the seam: the Today
 * screen bumps it from the same handlers that already keep its rings live
 * (`handleLogged`/`handlePortionAdded`/`handleUndo`), and this list re-reads `dayLog` only when that
 * token actually changes, never on the first mount (the initial state already did that read).
 *
 * THIS LIST'S OWN WRITES ARE OPTIMISTIC LOCALLY, TOO. An edit or a delete updates `rows` directly,
 * in the same tick as the write — it does not wait for the parent's `refreshToken` round trip to
 * reflect on screen, even though that round trip will also happen and land on the same state
 * (`CLAUDE.md`: the UI never waits, even on a synchronous local write).
 *
 * ONE UNDO TOAST, ALREADY BUILT. `updateLogEntry`/`softDeleteLogEntries` return the exact
 * `UndoToken` shape `undo()` already knows how to reverse (`revert`/`restore`), and
 * `useUndoToastStore`/`<UndoToast>` are already generic across every token kind (#21) — this list
 * only has to publish the right payload, never new undo machinery.
 *
 * `FlatList`, `scrollEnabled={false}`. The Today screen is one `ScrollView` (#41); a day's log is
 * realistically a handful to a few dozen rows, not the unbounded history a virtualised window
 * exists for, but `FlatList` still gives this list correct list semantics (keys, empty-state
 * slotting) without nesting a second independently-scrolling `VirtualizedList` inside the page's
 * `ScrollView`, which React Native warns against. A future "all history" screen, if it ever needs
 * real windowing, is its own scrollable list, not this one.
 */
import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import {
  dayLog,
  getMeal,
  localDateOf,
  softDeleteLogEntries,
  updateLogEntry,
  VitalsDbError,
  type Candidate,
  type DayLogEntry,
} from '../../db';
import { deviceWhen } from '../../hooks/deviceWhen';
import { useDb } from '../../hooks/useDb';
import { useTheme } from '../../hooks/useTheme';
import { forgetLog, logTrackerKey } from '../../store/logTracker';
import { useUndoToastStore, type LogDelta } from '../../store/undoToast';
import { PortionSheet } from '../quick-add/PortionSheet';
import { space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { candidateForEntry } from './entry-candidate';
import { DayLogRow, entryName } from './DayLogRow';

export type DayLogListProps = {
  /** Formatting locale, forwarded to every row and the portion sheet. Defaults to the device's. */
  readonly locale?: string;
  /** Bumped by the caller whenever a write elsewhere (the quick-add grid, or an undo of one) may
   * have changed today's log — see the module note on why this list does not poll on its own. */
  readonly refreshToken?: number;
  /** Called after an edit or a delete lands, with the same `LogDelta` shape
   * `QuickAddGridProps['onPortionAdded']` carries — the Today screen can feed both into the one
   * running-totals reducer that already keeps its rings live. */
  readonly onChanged?: (delta: LogDelta) => void;
  readonly testID?: string;
};

type Editing = { readonly entry: DayLogEntry; readonly candidate: Candidate };

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

/** The exact amount a row already holds, as a servings multiple of its own per-serving size — what
 * `<PortionSheet>`'s Exact mode should pre-fill an edit at, per the module's "pre-fill everything
 * that can be predicted" doctrine. A food's `qty` already is that multiple; a meal's `qty` is too. */
function currentPortions(entry: DayLogEntry): number {
  return entry.qty;
}

/** "120 kcal · 20 g protein" — the undo toast's meta line, mirroring `QuickAddGrid`'s own `toastMeta`
 * so an edit or a delete's toast reads exactly like a fresh log's. */
function toastMeta(kcal: number, protein: number, locale?: string): string {
  return `${Math.round(kcal).toLocaleString(locale)} kcal · ${Math.round(protein).toLocaleString(locale)} g protein`;
}

function EmptyState({ theme, testID }: { theme: Theme; testID: string }) {
  const { labelText, metaText } = theme.color.sectionLabel;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel="Nothing logged yet today. Tap a quick-add tile above to log your first food."
      style={styles.empty}
    >
      <Text style={textStyle(type.body, labelText)}>Nothing logged yet today.</Text>
      <Text style={[textStyle(type.label, metaText), styles.emptyLine]}>
        Tap a quick-add tile above to log your first food.
      </Text>
    </View>
  );
}

export function DayLogList({ locale, refreshToken, onChanged, testID = 'day-log-list' }: DayLogListProps) {
  const db = useDb();
  const theme = useTheme();
  const { sectionLabel } = theme.color;

  const [when] = useState(deviceWhen);
  const localDate = localDateOf(when.at, when.timeZone);

  const [rows, setRows] = useState<DayLogEntry[]>(() => dayLog(db, localDate));
  const [editing, setEditing] = useState<Editing | null>(null);

  // See the module note: only a genuine `refreshToken` change refetches — the initial mount's read
  // already happened above, in the lazy `useState` initialiser.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setRows(dayLog(db, localDate));
    // `db`/`localDate` do not change within one screen's lifetime, and re-running this on every
    // render of theirs (a fresh object/string each render) would defeat the whole point: refetch
    // only when the caller says something changed, never otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const handleRowPress = (entry: DayLogEntry): void => {
    const meal = entry.mealId ? getMeal(db, entry.mealId) : null;
    setEditing({ entry, candidate: candidateForEntry(entry, meal) });
  };

  const handleSheetClose = (): void => setEditing(null);

  const handleSheetLog = (_candidate: Candidate, portions: number): void => {
    if (!editing) return;
    const { entry, candidate } = editing;
    const now = deviceWhen();
    try {
      const { entry: updated, undo: token } = updateLogEntry(db, { at: now.at, id: entry.id, amount: { servings: portions } });
      setRows((current) => current.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
      const delta: LogDelta = { kcal: updated.kcal - entry.kcal, protein: updated.protein - entry.protein, entryCountDelta: 0 };
      useUndoToastStore.getState().show({
        token,
        candidateKey: logTrackerKey(candidate),
        title: entryName(entry),
        meta: toastMeta(updated.kcal, updated.protein, locale),
        delta,
      });
      onChanged?.(delta);
    } catch (err) {
      if (!(err instanceof VitalsDbError)) throw err;
      forgetLog(logTrackerKey(candidate));
    } finally {
      setEditing(null);
    }
  };

  const handleRowDelete = (entry: DayLogEntry): void => {
    const now = deviceWhen();
    const candidateKey = logTrackerKey({ kind: entry.mealId ? 'meal' : 'food', id: entry.mealId ?? entry.foodId ?? entry.id });
    try {
      const { undo: token } = softDeleteLogEntries(db, { at: now.at, ids: [entry.id] });
      setRows((current) => current.filter((row) => row.id !== entry.id));
      const delta: LogDelta = { kcal: -entry.kcal, protein: -entry.protein, entryCountDelta: -1 };
      useUndoToastStore.getState().show({
        token,
        candidateKey,
        title: entryName(entry),
        meta: toastMeta(entry.kcal, entry.protein, locale),
        delta,
      });
      onChanged?.(delta);
    } catch (err) {
      if (!(err instanceof VitalsDbError)) throw err;
      forgetLog(candidateKey);
    }
  };

  return (
    <View testID={testID}>
      <Text style={textStyle(type.micro, sectionLabel.labelText)}>{"Today's log"}</Text>

      {rows.length === 0 ? (
        <EmptyState theme={theme} testID={`${testID}-empty`} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <DayLogRow
              entry={item}
              theme={theme}
              locale={locale}
              onPress={handleRowPress}
              onDelete={handleRowDelete}
              testID={`${testID}-row-${item.id}`}
            />
          )}
        />
      )}

      <PortionSheet
        candidate={editing?.candidate ?? null}
        theme={theme}
        locale={locale}
        onLog={handleSheetLog}
        onClose={handleSheetClose}
        initialMode="exact"
        initialPortions={editing ? currentPortions(editing.entry) : 1}
        testID={`${testID}-portion-sheet`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: space[7],
    paddingHorizontal: space[6],
    alignItems: 'center',
    gap: space[2],
  },
  emptyLine: {
    textAlign: 'center',
  },
});
