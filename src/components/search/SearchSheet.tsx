/**
 * `<SearchSheet>` — issue #69 (`docs/decisions.md` §"One search bar, under the grid"): the only way
 * into the food library beyond the six quick-add tiles. Owns the full-width "Search foods" bar and
 * the sheet it opens — a section header, six ranked tiles is `<QuickAddGrid>`'s job; finding the
 * rest of the library is this one's.
 *
 * SCOPE — SHELL AND LIST RENDERING ONLY. This issue is the sheet chrome (the bar, the field, Recent
 * vs. Results, saved-meal labelling, the two empty states). What a tap on a *result* row does
 * (log with a haptic and an undo toast, sheet closes) is #70; what a tap on the trailing *Create*
 * row does (open the add-food form, pre-filled, save-and-log) is #71. Both are exposed here only as
 * plain callbacks (`onSelect` / `onCreate`) — this component never touches `logFood`/`logMeal`/
 * `createFoodAndLog` itself.
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
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import { quickAddCandidates, recentFoods, searchFoods, type Candidate, type VitalsDb } from '../../db';
import { deviceWhen } from '../../hooks/deviceWhen';
import { interaction, radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';

/** The layered-plates glyph a saved meal carries — same choice `QuickAddTile` made: plain Unicode,
 * no icon library installed yet (`CLAUDE.md` — raise a native dependency before adding one). */
const MEAL_GLYPH = '▤';
/** A plain-Unicode magnifier and clear glyph, for the same reason. */
const SEARCH_GLYPH = '⌕';
const CLEAR_GLYPH = '×';

export type SearchSheetProps = {
  readonly db: VitalsDb;
  /** A result row was tapped. What that means (log it) is issue #70's job — this only reports it. */
  readonly onSelect?: (candidate: Candidate) => void;
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

function ResultRow({ candidate, theme, locale, onPress, testID }: { candidate: Candidate; theme: Theme; locale?: string; onPress: () => void; testID: string }) {
  const { resultRow } = theme.color;
  const kcalText = Math.round(candidate.kcal).toLocaleString(locale);
  const proteinText = Math.round(candidate.protein).toLocaleString(locale);
  const isMeal = candidate.kind === 'meal';

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rowAccessibilityLabel(candidate, kcalText, proteinText)}
      style={[
        styles.row,
        { minHeight: size.resultRow.heightHit, backgroundColor: resultRow.bg, borderBottomColor: resultRow.divider, borderBottomWidth: StyleSheet.hairlineWidth },
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
      <View style={styles.rowFigures}>
        <Text style={textStyle(type.numericSm, resultRow.kcalText)}>{`${kcalText} kcal`}</Text>
        <Text style={textStyle(type.numericSm, resultRow.proteinText)}>{`${proteinText} g`}</Text>
      </View>
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

export function SearchSheet({ db, onSelect, onCreate, locale, theme, testID = 'search-sheet' }: SearchSheetProps) {
  const { searchBar, searchSheet } = theme.color;

  // Read once per mount — the grid's own "ranked once per visit" discipline (`QuickAddGrid`'s module
  // note), and the only way this component knows which six `recentFoods` must exclude.
  const [when] = useState(deviceWhen);
  const [gridCandidates] = useState<Candidate[]>(() => quickAddCandidates(db, { ...when, limit: 6 }));
  const gridIds = useMemo(() => gridCandidates.map((c) => c.id), [gridCandidates]);
  const libraryEmpty = gridCandidates.length === 0;

  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<Candidate[]>([]);

  const openSheet = (): void => {
    setRecent(recentFoods(db, { ...when, days: interaction.recentDays, excludeIds: gridIds }));
    setQuery('');
    setVisible(true);
  };

  const closeSheet = (): void => setVisible(false);

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
        onPress={() => onSelect?.(item.candidate)}
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
