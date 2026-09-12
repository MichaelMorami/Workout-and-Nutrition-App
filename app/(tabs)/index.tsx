import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { getSettings, localDateOf, todayTotals, type DayTotals, type LogReceipt, type SettingsView } from '../../src/db';
import { QuickAddGrid } from '../../src/components/quick-add';
import { TodayHeader, WeightChip } from '../../src/components/today';
import { deviceWhen } from '../../src/hooks/deviceWhen';
import { useDb } from '../../src/hooks/useDb';
import { useTheme } from '../../src/hooks/useTheme';
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
 * The "Search foods" bar (#24, decision 4 in `docs/decisions.md`) still has no slot here — its
 * issue lands it between the grid and the weight chip.
 */
export default function TodayScreen(): React.JSX.Element {
  const db = useDb();
  const theme = useTheme();

  const [when] = useState(deviceWhen);
  const [settings] = useState<SettingsView>(() => getSettings(db));
  const [totals, setTotals] = useState<DayTotals>(() => todayTotals(db, localDateOf(when.at, when.timeZone)));

  const handleLogged = (receipt: LogReceipt): void => {
    const kcal = receipt.entries.reduce((sum, entry) => sum + entry.kcal, 0);
    const protein = receipt.entries.reduce((sum, entry) => sum + entry.protein, 0);
    setTotals((current) => ({
      ...current,
      kcal: current.kcal + kcal,
      protein: current.protein + protein,
      entryCount: current.entryCount + receipt.entries.length,
    }));
  };

  return (
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
      <QuickAddGrid onLogged={handleLogged} />
      {/* TODO(#24): "Search foods" bar goes here, between the grid and the weight chip. */}
      <WeightChip testID="weight-chip" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.gutterToday,
    paddingTop: space[9],
    paddingBottom: space[9],
    gap: space[6],
  },
});
