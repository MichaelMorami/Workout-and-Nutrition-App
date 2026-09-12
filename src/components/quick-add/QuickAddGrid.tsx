/**
 * `<QuickAddGrid>` — the Today screen's quick-add section (issue #40): a section header, six
 * ranked tiles (or fewer while the catalogue is still small), and a teaching empty state for a
 * first-time user with nothing logged yet.
 *
 * RANKED ONCE PER VISIT. `quickAddCandidates` is read once, in a lazy `useState` initialiser, not
 * on every render or after every log. Re-ranking right after a tap would reorder or disappear the
 * tile the user just watched confirm with a haptic and a wash — the ranking is for "what to show
 * when I open Today", not a live leaderboard. A pull-to-refresh or the next app open re-ranks it.
 *
 * ONLY SIX ITEMS, NEVER AN UNBOUNDED LIST. `quickAddCandidates(..., { limit: 6 })` guarantees a
 * fixed, small array — this is a bounded grid, not a scrolling list, so a plain `View`/`map` is the
 * right tool here, not `FlashList` (`CLAUDE.md`'s virtualisation rule is about unbounded lists:
 * the day's log, search results).
 *
 * THE WRITE IS OPTIMISTIC AND NEVER BLOCKS THE TILE. `logFood`/`logMeal` are synchronous local
 * SQLite writes (`src/db`'s contract) — there is no network round trip to wait on, so the tile's
 * own "Logged" wash (`QuickAddTile`) already _is_ the confirmation. A write failure is swallowed
 * here, not surfaced as a dialog (the tap doctrine: undo, not confirmation, and there is nothing to
 * undo from a failed write) — the resting UI resumes on the next hold-timeout as if the tap simply
 * did not count.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { logFood, logMeal, quickAddCandidates, VitalsDbError, type Candidate, type LogReceipt } from '../../db';
import { deviceWhen } from '../../hooks/deviceWhen';
import { useDb } from '../../hooks/useDb';
import { useTheme } from '../../hooks/useTheme';
import { layout, radius, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { QuickAddTile } from './QuickAddTile';

export type QuickAddGridProps = {
  /** Called after a tap's write lands, with the receipt (`kcal`/`protein` logged, for #41's arcs
   * and any other listener). Never called for a tap that failed to write. */
  readonly onLogged?: (receipt: LogReceipt) => void;
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

export function QuickAddGrid({ onLogged, locale, testID = 'quick-add-grid' }: QuickAddGridProps) {
  const db = useDb();
  const theme = useTheme();
  const { sectionLabel } = theme.color;

  // Captured once per mount — see the module note on why re-ranking is not tied to render.
  const [when] = useState(deviceWhen);
  const [candidates] = useState<Candidate[]>(() => quickAddCandidates(db, { ...when, limit: 6 }));

  const handleLog = (candidate: Candidate): void => {
    try {
      const receipt =
        candidate.kind === 'food'
          ? logFood(db, { ...deviceWhen(), foodId: candidate.id })
          : logMeal(db, { ...deviceWhen(), mealId: candidate.id });
      onLogged?.(receipt);
    } catch (err) {
      // See the module note: no dialog, no crash — a failed write is not a user-visible event.
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
                    onLog={handleLog}
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
