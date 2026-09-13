import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { getSettings, localDateOf, todayTotals, type DayTotals, type LogReceipt, type SettingsView } from '../../src/db';
import { DayLogList } from '../../src/components/day-log';
import { QuickAddGrid, UndoToast } from '../../src/components/quick-add';
import { SearchSheet } from '../../src/components/search';
import { TodayHeader, WeightChip } from '../../src/components/today';
import { deviceWhen } from '../../src/hooks/deviceWhen';
import { useDb } from '../../src/hooks/useDb';
import { useTheme } from '../../src/hooks/useTheme';
import type { LogDelta } from '../../src/store/undoToast';
import { layout, space } from '../../src/theme/tokens';

/**
 * The Today screen (issue #20). #40 built the quick-add grid; this slice (#41) adds the two slots
 * left either side of it:
 *
 *   - Above: the date header and the calorie/protein rings (`<TodayHeader>`).
 *   - Below: the weight chip (`<WeightChip>`). The workout chip is Sprint 3 (#20's tracker
 *     comment) — until then this row holds the weight chip alone, per that decision.
 *
 * `todayTotals`/`getSettings` are read once, the same "once per visit" discipline
 * `<QuickAddGrid>` already uses for `quickAddCandidates` — re-reading on every render would fight
 * the optimistic update below. `handleLogged` is what keeps the rings live: `<QuickAddGrid>`'s
 * write is a synchronous local SQLite write with no round trip to wait on, so adding its receipt's
 * kcal/protein straight into this screen's running total is what makes a tap move the ring in the
 * same frame as the tile's own "Logged" wash — no second database read, no network involved either
 * way (`CLAUDE.md` — the app never blocks on the network).
 *
 * The "Search foods" bar (#69, decision 4 in `docs/decisions.md`) sits right under the grid, in the
 * same `layout.tileGap` rhythm as the tiles themselves — `<SearchSheet>` owns the bar and the sheet
 * it opens; row *behaviour* (tap-to-log, long-press, create) is #70/#71, so `onSelect`/`onCreate`
 * are left unwired here.
 *
 * `<UndoToast>` MOUNTS OUTSIDE THE `ScrollView` (issue #21). It floats above the tab bar, clear of
 * the grid's own scrolling content (`docs/decisions.md`, `UndoToast.tsx`'s own module note) — a
 * sibling of the `ScrollView`, not a child, so scrolling the log never carries it off-screen and it
 * never fights the content's own layout. `handlePortionAdded`/`handleUndo` mirror `handleLogged`:
 * every one of the three logging paths, and undo of any of them, keeps the rings live from the same
 * running `totals` state, with no second database read either way.
 *
 * `<DayLogList>` (issue #42) SITS BELOW THE SEARCH BAR SLOT, ABOVE THE WEIGHT CHIP — #20's revised
 * layout note. It reads `dayLog` itself, once per visit, the same way this screen reads
 * `todayTotals` once — so it needs telling, not polling, whenever a write elsewhere might have
 * changed today's log. `dayLogVersion` is that tell: every one of this screen's own three totals
 * handlers already fires on exactly those writes (a grid tap, a portion add, an undo of either —
 * and now the day log's own edits/deletes, routed back through the same `handlePortionAdded` via
 * `onChanged`), so bumping it there costs nothing new to wire up.
 */
export default function TodayScreen(): React.JSX.Element {
  const db = useDb();
  const theme = useTheme();

  const [when] = useState(deviceWhen);
  const [settings] = useState<SettingsView>(() => getSettings(db));
  const [totals, setTotals] = useState<DayTotals>(() => todayTotals(db, localDateOf(when.at, when.timeZone)));
  // Bumped by every handler below — `<DayLogList>`'s cue to re-read `dayLog` (see the module note).
  const [dayLogVersion, setDayLogVersion] = useState(0);

  const handleLogged = (receipt: LogReceipt): void => {
    const kcal = receipt.entries.reduce((sum, entry) => sum + entry.kcal, 0);
    const protein = receipt.entries.reduce((sum, entry) => sum + entry.protein, 0);
    setTotals((current) => ({
      ...current,
      kcal: current.kcal + kcal,
      protein: current.protein + protein,
      entryCount: current.entryCount + receipt.entries.length,
    }));
    setDayLogVersion((v) => v + 1);
  };

  const handlePortionAdded = (delta: LogDelta): void => {
    setTotals((current) => ({
      ...current,
      kcal: current.kcal + delta.kcal,
      protein: current.protein + delta.protein,
      entryCount: current.entryCount + delta.entryCountDelta,
    }));
    setDayLogVersion((v) => v + 1);
  };

  const handleUndo = (delta: LogDelta): void => {
    setTotals((current) => ({
      ...current,
      kcal: current.kcal - delta.kcal,
      protein: current.protein - delta.protein,
      entryCount: current.entryCount - delta.entryCountDelta,
    }));
    setDayLogVersion((v) => v + 1);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={{ backgroundColor: theme.color.bg.canvas }}
        contentContainerStyle={styles.content}
        testID="today-screen"
      >
        <TodayHeader
          kcal={totals.kcal}
          protein={totals.protein}
          kcalTarget={settings.kcalTarget}
          proteinTarget={settings.proteinTarget}
          isDefault={settings.isDefault}
          at={when.at}
          timeZone={when.timeZone}
          theme={theme}
          testID="today-header"
        />
        <View style={styles.quickAddGroup}>
          <QuickAddGrid onLogged={handleLogged} onPortionAdded={handlePortionAdded} />
          <SearchSheet db={db} theme={theme} testID="today-search-sheet" />
        </View>
        <DayLogList refreshToken={dayLogVersion} onChanged={handlePortionAdded} testID="day-log-list" />
        <WeightChip testID="weight-chip" />
      </ScrollView>
      <UndoToast onUndo={handleUndo} testID="today-undo-toast" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.gutterToday,
    paddingTop: space[9],
    paddingBottom: space[9],
    gap: space[6],
  },
  // The grid and the search bar share `layout.tileGap` — tighter than the `space[6]` rhythm between
  // every other section on this screen (`docs/decisions.md` §4).
  quickAddGroup: {
    gap: layout.tileGap,
  },
});
