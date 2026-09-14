/**
 * `<SearchSheet>` — issue #69 (`docs/decisions.md` §"One search bar, under the grid"): the only way
 * into the food library beyond the six quick-add tiles. Owns the full-width "Search foods" bar and
 * the sheet it opens — a section header, six ranked tiles is `<QuickAddGrid>`'s job; finding the
 * rest of the library is this one's.
 *
 * ROWS BEHAVE EXACTLY LIKE TILES (issue #70). A tap goes through the same "one place decides"
 * bookkeeping `QuickAddGrid` uses (`logTracker`'s module note — it is shared across tile and row on
 * purpose): a fresh `logFood`/`logMeal` if this candidate was not logged inside
 * `interaction.repeatWindowMs`, `addPortion` on the same rows if it was. Either way: a haptic, the
 * undo toast (`useUndoToastStore`, generic across every write this app makes), a brief "Logged" beat
 * on the row itself (`resultRow.bgLogged`, held `interaction.rowLoggedHoldMs`), then the sheet
 * closes — no confirmation dialog, no save button, no navigation. A long-press dismisses any toast
 * still up and opens `<PortionSheet>` (#21) instead of logging; its own Log always writes fresh (a
 * chosen serving multiple, never an addition) and closes both sheets. A failed write is swallowed,
 * exactly `QuickAddGrid`'s own doctrine: no dialog, and the sheet stays open, as if the tap simply
 * did not count. What a tap on the trailing *Create* row does (open the add-food form, pre-filled,
 * save-and-log) is #71, exposed here only as a plain callback (`onCreate`) — this component never
 * touches `createFoodAndLog` itself.
 *
 * RECENT EXCLUDES THE SIX ON THE GRID. `quickAddCandidates` is read once per mount, exactly like
 * `<QuickAddGrid>`'s own "ranked once per visit" discipline (its module note) — not to duplicate
 * that grid's state, but because this component has no other way to know which six it must exclude
 * from `recentFoods` without threading a prop through the screen that owns both. The same read
 * doubles as the search bar's "day one" signal: an empty result is exactly `<QuickAddGrid>`'s own
 * empty-state trigger, so the bar's emphasis (`searchBar.emphasisIcon`/`emphasisLabelText`,
 * `borderEmphasis`) lights up in lockstep with the grid teaching the same first-time user.
 *
 * THE LAST ROW WHILE TYPING IS ALWAYS CREATE. Per the decisions doc, `Create "‹query›"` trails every
 * non-empty query — including when there are results, not only when there are none. A blank query
 * has nothing to create from, so Recent never carries one; a library with nothing recent instead
 * gets the "no library yet" teaching empty state, which leads the user to type (and so to Create)
 * rather than rendering a row with no query to seed it.
 *
 * NO NEW NATIVE DEPENDENCY: `Modal`'s built-in `animationType="slide"` presents the sheet, the same
 * choice `<PortionSheet>` made and for the same reason.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import {
  addPortion,
  logFood,
  logMeal,
  quickAddCandidates,
  recentFoods,
  searchFoods,
  VitalsDbError,
  type Candidate,
  type LogReceipt,
  type VitalsDb,
} from '../../db';
import { deviceWhen } from '../../hooks/deviceWhen';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { forgetLog, logTrackerKey, recentLog, trackLog } from '../../store/logTracker';
import { useUndoToastStore, type LogDelta } from '../../store/undoToast';
import { haptics, interaction, radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { PortionSheet } from '../quick-add/PortionSheet';

/** The layered-plates glyph a saved meal carries — same choice `QuickAddTile` made: plain Unicode,
 * no icon library installed yet (`CLAUDE.md` — raise a native dependency before adding one). */
const MEAL_GLYPH = '▤';
/** A plain-Unicode magnifier and clear glyph, for the same reason. */
const SEARCH_GLYPH = '⌕';
const CLEAR_GLYPH = '×';

export type SearchSheetProps = {
  readonly db: VitalsDb;
  /** Called after a *fresh* log lands — a row's first tap, or the portion sheet's own Log — with
   * the receipt (`kcal`/`protein` logged). Mirrors `QuickAddGridProps['onLogged']` exactly, so the
   * Today screen can feed both into the same running-totals reducer. Never called for a write that
   * failed, and never called for a repeat tap's `addPortion` (see `onPortionAdded`). */
  readonly onLogged?: (receipt: LogReceipt) => void;
  /** Called after a repeat tap (within `interaction.repeatWindowMs` of the candidate's last log,
   * tile or row alike) adds a portion instead of a fresh row. Mirrors
   * `QuickAddGridProps['onPortionAdded']`. */
  readonly onPortionAdded?: (delta: LogDelta) => void;
  /** The trailing Create row was tapped, with the trimmed query that seeded it. Issue #71 wires this
   * to the pre-filled add-food form. */
  readonly onCreate?: (query: string) => void;
  /** Formatting locale, forwarded to every figure. Defaults to the device's. */
  readonly locale?: string;
  readonly theme: Theme;
  readonly testID?: string;
};

type Row = { readonly key: string; readonly kind: 'candidate'; readonly candidate: Candidate } | { readonly key: 'create'; readonly kind: 'create' };

function textStyle(token: TypeStyle, color: string): TextStyle {
  return {
    fontFamily: token.fontFamily,
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    textTransform: token.textTransform,
    color,
  };
}

/** "Fage · 1 pot" / "2 eggs" for a food, "3 items" for a meal — the line under a row's name. */
function servingSummary(candidate: Candidate): string {
  if (candidate.kind === 'meal') return `${candidate.itemCount} item${candidate.itemCount === 1 ? '' : 's'}`;
  return candidate.brand ? `${candidate.brand} · ${candidate.servingLabel}` : candidate.servingLabel;
}

function rowAccessibilityLabel(candidate: Candidate, kcal: string, protein: string): string {
  const kind = candidate.kind === 'meal' ? 'meal' : 'food';
  return `${candidate.name}, ${kind}, ${kcal} kilocalories, ${protein} grams protein`;
}

function ResultRow({
  candidate,
  theme,
  locale,
  logged,
  onPress,
  onLongPress,
  testID,
}: {
  candidate: Candidate;
  theme: Theme;
  locale?: string;
  /** This row's own brief "Logged" beat (`resultRow.bgLogged`, held `interaction.rowLoggedHoldMs`)
   * — the tile's `logged` state, mirrored here (`QuickAddTile`'s module note). */
  logged: boolean;
  onPress: () => void;
  onLongPress: () => void;
  testID: string;
}) {
  const { resultRow } = theme.color;
  const kcalText = Math.round(candidate.kcal).toLocaleString(locale);
  const proteinText = Math.round(candidate.protein).toLocaleString(locale);
  const isMeal = candidate.kind === 'meal';
  // Guards the same touch from firing both `onLongPress` and `onPress` when the finger lifts —
  // `QuickAddTile`'s own guard, same reasoning: opening the portion sheet must never also log.
  const longPressed = useRef(false);

  const handlePress = (): void => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    onPress();
  };

  const handleLongPress = (): void => {
    longPressed.current = true;
    onLongPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={interaction.longPressMs}
      accessibilityRole="button"
      accessibilityLabel={rowAccessibilityLabel(candidate, kcalText, proteinText)}
      style={[
        styles.row,
        {
          minHeight: size.resultRow.heightHit,
          backgroundColor: logged ? resultRow.bgLogged : resultRow.bg,
          borderBottomColor: resultRow.divider,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={styles.rowText}>
        <View style={styles.nameLine}>
          {isMeal ? (
            <Text testID={`${testID}-meal-icon`} style={{ fontSize: size.icon.sm, color: resultRow.mealIcon, marginRight: space[1] }}>
              {MEAL_GLYPH}
            </Text>
          ) : null}
          <Text testID={`${testID}-name`} numberOfLines={1} style={[textStyle(type.body, resultRow.nameText), styles.name]}>
            {candidate.name}
          </Text>
          {isMeal ? (
            <View testID={`${testID}-meal-tag`} style={[styles.mealTag, { backgroundColor: resultRow.mealTagBg, borderRadius: radius.xs }]}>
              <Text style={textStyle(type.micro, resultRow.mealTagText)}>Meal</Text>
            </View>
          ) : null}
        </View>
        <Text testID={`${testID}-serving`} style={textStyle(type.caption, resultRow.servingText)}>
          {servingSummary(candidate)}
        </Text>
      </View>
      {logged ? (
        <View testID={`${testID}-logged`} style={styles.loggedBeat}>
          <Text style={{ fontSize: size.icon.sm, color: resultRow.loggedIcon, marginRight: space[1] }}>{'✓'}</Text>
          <Text style={textStyle(type.numericSm, resultRow.loggedText)}>Logged</Text>
        </View>
      ) : (
        <View style={styles.rowFigures}>
          <Text style={textStyle(type.numericSm, resultRow.kcalText)}>{`${kcalText} kcal`}</Text>
          <Text style={textStyle(type.numericSm, resultRow.proteinText)}>{`${proteinText} g`}</Text>
        </View>
      )}
    </Pressable>
  );
}

function CreateRow({ query, theme, onPress, testID }: { query: string; theme: Theme; onPress: () => void; testID: string }) {
  const { resultRow } = theme.color;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Create "${query}"`}
      style={[
        styles.row,
        { minHeight: size.resultRow.heightHit, backgroundColor: resultRow.bg, borderBottomColor: resultRow.divider, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <View style={[styles.createDisc, { width: size.resultRow.createDisc, height: size.resultRow.createDisc, borderRadius: size.resultRow.createDisc / 2, backgroundColor: resultRow.createIconBg }]}>
        <Text style={{ fontSize: size.icon.lg, color: resultRow.createIcon }}>+</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={textStyle(type.body, resultRow.createText)}>{`Create "${query}"`}</Text>
        <Text style={textStyle(type.caption, resultRow.createMetaText)}>New food · logs one serving</Text>
      </View>
    </Pressable>
  );
}

/** Sums `kcal`/`protein` off any row shape that carries them — mirrors `QuickAddGrid`'s own
 * `totalsOf`, the same helper both write paths need. */
function totalsOf(rows: readonly { readonly kcal: number; readonly protein: number }[]): { kcal: number; protein: number } {
  return rows.reduce((sum, row) => ({ kcal: sum.kcal + row.kcal, protein: sum.protein + row.protein }), { kcal: 0, protein: 0 });
}

/** "Skyr Pot" once, "Skyr Pot ×2" from the second portion on — mirrors `QuickAddGrid`'s own
 * `toastTitle`, so a row's undo toast reads exactly like a tile's. */
function toastTitle(name: string, portions: number): string {
  return portions > 1 ? `${name} ×${portions}` : name;
}

/** "240 kcal · 40 g protein" — mirrors `QuickAddGrid`'s own `toastMeta`. */
function toastMeta(totals: { kcal: number; protein: number }, locale?: string): string {
  const kcal = Math.round(totals.kcal).toLocaleString(locale);
  const protein = Math.round(totals.protein).toLocaleString(locale);
  return `${kcal} kcal · ${protein} g protein`;
}

function NoLibraryEmptyState({ theme, testID }: { theme: Theme; testID: string }) {
  const { sectionLabel } = theme.color;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel="No foods yet. Type a name below to add your first one."
      style={styles.empty}
    >
      <Text style={textStyle(type.body, sectionLabel.labelText)}>No foods yet.</Text>
      <Text style={[textStyle(type.label, sectionLabel.metaText), styles.emptyLine]}>Type a name below to add your first one.</Text>
    </View>
  );
}

export function SearchSheet({ db, onLogged, onPortionAdded, onCreate, locale, theme, testID = 'search-sheet' }: SearchSheetProps) {
  const { searchBar, searchSheet } = theme.color;
  const fireHaptic = useHapticFeedback();

  // Read once per mount — the grid's own "ranked once per visit" discipline (`QuickAddGrid`'s module
  // note), and the only way this component knows which six `recentFoods` must exclude.
  const [when] = useState(deviceWhen);
  const [gridCandidates] = useState<Candidate[]>(() => quickAddCandidates(db, { ...when, limit: 6 }));
  const gridIds = useMemo(() => gridCandidates.map((c) => c.id), [gridCandidates]);
  const libraryEmpty = gridCandidates.length === 0;

  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<Candidate[]>([]);
  const [sheetCandidate, setSheetCandidate] = useState<Candidate | null>(null);
  // The row currently showing its "Logged" beat (`logTrackerKey`-shaped), or `null` at rest.
  const [loggedKey, setLoggedKey] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const openSheet = (): void => {
    setRecent(recentFoods(db, { ...when, days: interaction.recentDays, excludeIds: gridIds }));
    setQuery('');
    setVisible(true);
  };

  const closeSheet = (): void => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setLoggedKey(null);
    setVisible(false);
  };

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

  // The row's brief "Logged" beat, then the sheet closes — `QuickAddTile`'s hold-then-revert,
  // ending in a close instead of a revert: a search row's whole job is done the instant its one
  // write lands, so there is nothing left here to go back to resting figures for.
  const scheduleClose = (): void => {
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      closeSheet();
    }, interaction.rowLoggedHoldMs);
  };

  const handleRowPress = (candidate: Candidate): void => {
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
        fireHaptic(haptics.foodLogged);
        publishToast(candidate, next, totals, delta);
        onPortionAdded?.(delta);
        setLoggedKey(key);
        scheduleClose();
        return;
      }

      const receipt = logFreshCandidate(candidate, now);
      trackLog(key, receipt, now.at);
      const totals = totalsOf(receipt.entries);
      const delta: LogDelta = { kcal: totals.kcal, protein: totals.protein, entryCountDelta: receipt.entries.length };
      fireHaptic(haptics.foodLogged);
      publishToast(candidate, receipt, totals, delta);
      onLogged?.(receipt);
      setLoggedKey(key);
      scheduleClose();
    } catch (err) {
      // No dialog, no crash — a failed write is not a user-visible event, and the sheet stays open,
      // exactly as if the tap simply did not count (`QuickAddGrid`'s own doctrine).
      if (!(err instanceof VitalsDbError)) throw err;
      forgetLog(key);
    }
  };

  const handleRowLongPress = (candidate: Candidate): void => {
    // `interaction.undoDismissedBy` includes `'sheetOpened'` — a toast from the tap before this
    // long-press must not survive into a decision the portion sheet is about to make instead.
    useUndoToastStore.getState().dismiss();
    setSheetCandidate(candidate);
  };

  const handlePortionSheetClose = (): void => setSheetCandidate(null);

  const handlePortionSheetLog = (candidate: Candidate, portions: number): void => {
    const now = deviceWhen();
    try {
      const receipt = logFreshCandidate(candidate, now, portions);
      trackLog(logTrackerKey(candidate), receipt, now.at);
      const totals = totalsOf(receipt.entries);
      const delta: LogDelta = { kcal: totals.kcal, protein: totals.protein, entryCountDelta: receipt.entries.length };
      fireHaptic(haptics.foodLogged);
      publishToast(candidate, receipt, totals, delta);
      onLogged?.(receipt);
      setSheetCandidate(null);
      closeSheet();
    } catch (err) {
      if (!(err instanceof VitalsDbError)) throw err;
      setSheetCandidate(null);
    }
  };

  const trimmedQuery = query.trim();
  const results = useMemo<Candidate[]>(
    () => (trimmedQuery.length === 0 ? [] : searchFoods(db, { ...when, query: trimmedQuery })),
    [db, when, trimmedQuery],
  );

  const typing = trimmedQuery.length > 0;
  const rows: Row[] = typing
    ? [...results.map((candidate) => ({ key: `${candidate.kind}-${candidate.id}`, kind: 'candidate' as const, candidate })), { key: 'create', kind: 'create' as const }]
    : recent.map((candidate) => ({ key: `${candidate.kind}-${candidate.id}`, kind: 'candidate' as const, candidate }));

  // Keyed off `libraryEmpty` (`quickAddCandidates`, the whole library), not `recent` — `recentFoods`
  // only covers the last `interaction.recentDays` days, so a library with real items that simply
  // have not been logged recently must never see "No foods yet".
  const showNoLibraryEmptyState = !typing && libraryEmpty;

  const renderRow = ({ item }: { item: Row }) =>
    item.kind === 'create' ? (
      <CreateRow query={trimmedQuery} theme={theme} onPress={() => onCreate?.(trimmedQuery)} testID={`${testID}-create`} />
    ) : (
      <ResultRow
        candidate={item.candidate}
        theme={theme}
        locale={locale}
        logged={loggedKey === logTrackerKey(item.candidate)}
        onPress={() => handleRowPress(item.candidate)}
        onLongPress={() => handleRowLongPress(item.candidate)}
        testID={`${testID}-row-${item.candidate.kind}-${item.candidate.id}`}
      />
    );

  const header = typing
    ? results.length > 0
      ? { title: 'Results', meta: `${results.length} match${results.length === 1 ? '' : 'es'}`, testID: `${testID}-section-results` }
      : null
    : recent.length > 0
      ? { title: 'Recent', meta: `${interaction.recentDays} days`, testID: `${testID}-section-recent` }
      : null;

  return (
    <View testID={testID}>
      <Pressable
        testID={`${testID}-bar`}
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={libraryEmpty ? 'Add your first food' : 'Search foods'}
        style={[
          styles.bar,
          {
            height: size.searchBar.heightHit,
            minHeight: size.tapTargetMin,
            borderRadius: radius.lg,
            backgroundColor: searchBar.bg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: libraryEmpty ? searchBar.borderEmphasis : searchBar.border,
          },
        ]}
      >
        <Text style={{ fontSize: size.icon.lg, color: libraryEmpty ? searchBar.emphasisIcon : searchBar.searchIcon, marginRight: space[3] }}>{SEARCH_GLYPH}</Text>
        <Text style={textStyle(type.body, libraryEmpty ? searchBar.emphasisLabelText : searchBar.labelText)}>
          {libraryEmpty ? 'Add your first food' : 'Search foods'}
        </Text>
      </Pressable>

      {visible ? (
        <Modal visible transparent animationType="slide" onRequestClose={closeSheet} testID={`${testID}-modal`}>
          <Pressable
            testID={`${testID}-scrim`}
            accessibilityRole="button"
            accessibilityLabel="Close search"
            onPress={closeSheet}
            style={[styles.topScrim, { height: size.searchSheet.topInset, backgroundColor: theme.color.bg.scrim }]}
          />
          <View style={[styles.sheet, { backgroundColor: searchSheet.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }]}>
            <View
              style={[styles.grabber, { width: size.searchSheet.grabberWidth, height: size.searchSheet.grabberHeight, borderRadius: radius.pill, backgroundColor: searchSheet.grabber }]}
            />

            <View style={styles.fieldRow}>
              <View style={[styles.field, { height: size.searchSheet.fieldHeight, borderRadius: radius.md, backgroundColor: searchSheet.fieldBg, borderColor: searchSheet.fieldBorderFocus }]}>
                <Text style={{ fontSize: size.icon.md, color: searchSheet.fieldIcon, marginRight: space[2] }}>{SEARCH_GLYPH}</Text>
                <TextInput
                  testID={`${testID}-input`}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search foods"
                  placeholderTextColor={searchSheet.placeholderText}
                  selectionColor={searchSheet.caret}
                  autoFocus
                  style={[textStyle(type.input, searchSheet.queryText), styles.input]}
                  accessibilityLabel="Search foods"
                />
                {query.length > 0 ? (
                  <Pressable
                    testID={`${testID}-clear`}
                    onPress={() => setQuery('')}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    hitSlop={space[2]}
                    style={{ minWidth: size.searchSheet.clearHit, minHeight: size.searchSheet.clearHit, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: size.icon.md, color: searchSheet.clearIcon }}>{CLEAR_GLYPH}</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                testID={`${testID}-cancel`}
                onPress={closeSheet}
                accessibilityRole="button"
                accessibilityLabel="Cancel search"
                hitSlop={space[2]}
                style={{ minHeight: size.searchSheet.cancelHit, justifyContent: 'center', paddingLeft: space[4] }}
              >
                <Text style={textStyle(type.button, searchSheet.cancelText)}>Cancel</Text>
              </Pressable>
            </View>

            {showNoLibraryEmptyState ? (
              <NoLibraryEmptyState theme={theme} testID={`${testID}-empty`} />
            ) : (
              <FlatList
                data={rows}
                keyExtractor={(row) => row.key}
                renderItem={renderRow}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                  header ? (
                    <View testID={header.testID} style={styles.sectionHeader}>
                      <Text style={textStyle(type.micro, searchSheet.sectionText)}>{header.title}</Text>
                      <Text style={textStyle(type.label, searchSheet.sectionMetaText)}>{header.meta}</Text>
                    </View>
                  ) : null
                }
              />
            )}
          </View>
        </Modal>
      ) : null}

      <PortionSheet
        candidate={sheetCandidate}
        theme={theme}
        locale={locale}
        onLog={handlePortionSheetLog}
        onClose={handlePortionSheetClose}
        testID={`${testID}-portion-sheet`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[5],
  },
  topScrim: {
    width: '100%',
  },
  sheet: {
    flex: 1,
    paddingTop: space[3],
    gap: space[3],
  },
  grabber: {
    alignSelf: 'center',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[6],
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[4],
  },
  input: {
    flex: 1,
    padding: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: space[6],
    paddingVertical: space[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[6],
    paddingVertical: space[4],
    gap: space[4],
  },
  rowText: {
    flexShrink: 1,
    gap: space[1],
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  name: {
    flexShrink: 1,
  },
  mealTag: {
    paddingHorizontal: space[2],
    // `space[1]` (4) — the tightest step on the scale. No step is as small as the previous
    // hardcoded 1px; this is the closest token to the small pill the tag calls for.
    paddingVertical: space[1],
  },
  rowFigures: {
    alignItems: 'flex-end',
    gap: space[1],
  },
  loggedBeat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  createDisc: {
    alignItems: 'center',
    justifyContent: 'center',
  },
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
