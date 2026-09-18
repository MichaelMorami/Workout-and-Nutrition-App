/**
 * `<MealForm>` — issue #43's "saved meals: create from foods". Issue #98 replaced the old long
 * all-foods `FlatList` with a search dropdown: `searchFoodsOnly` (db-engineer's contract, issue
 * #98) ranks matches across the *whole* live food library, never meals, never archived/tombstoned
 * foods. Tapping a match adds it below as an ingredient row, pre-filled at one serving — the "usual
 * portion" prediction the tap doctrine asks for, so the tap that adds a food is also the tap that
 * actually includes it (unlike the old all-foods list, where every food already had a row at zero
 * servings and a food only counted once its stepper moved). A food already added is filtered out of
 * later matches, so it is never offered twice.
 *
 * THE AMOUNT CONTROL ITSELF IS UNCHANGED (issue #99's job, not this one's): an added ingredient's
 * `<Stepper>` is servings of that food per portion of the meal (`MealItemInput['qty']`'s own
 * definition), same step, same formatting. `createMeal` still throws `empty_meal` for zero items —
 * decreasing every added row's stepper to zero, or removing every row, both save nothing, exactly as
 * before the search dropdown existed.
 *
 * A CATALOGUE WITH NO FOODS YET CANNOT BUILD A MEAL. There is nothing to search for with an empty
 * `foods` library (`listFoods`, read once — this screen is never open long enough for the catalogue
 * to change under it), so the search field never even appears: the empty state says so and offers no
 * Save button to fail against, rather than letting a tap discover the error.
 *
 * `initial` (issue #101): pre-fills name and every ingredient row at exactly what the meal currently
 * holds — `/meals/[id]` (issue #101) is the edit screen this makes possible, the same "pre-fill
 * everything that can be predicted" doctrine `<FoodForm initial={...}>` already follows for a food
 * (issue #43). Ingredients from `initial` are ordinary `Ingredient` rows once seeded: they steppe,
 * remove and get filtered out of later search matches exactly like one added by hand in this visit.
 */
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import { listFoods, searchFoodsOnly, type FoodCandidate, type MealItemInput, type VitalsDb } from '../../db';
import { formatGrams } from '../format/food';
import { deviceWhen } from '../../hooks/deviceWhen';
import { radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { Stepper } from '../food-form';

export type MealFormValues = { readonly name: string; readonly items: readonly MealItemInput[] };

/** What `/meals/[id]` (issue #101) hands in to pre-fill an edit: a `MealDetail`'s name and items,
 * reduced to the name each ingredient row needs to display (a `MealItemInput` alone has no name). */
export type MealFormInitial = {
  readonly name: string;
  readonly items: readonly { readonly id: string; readonly name: string; readonly qty: number }[];
};

export type MealFormProps = {
  readonly db: VitalsDb;
  /** `undefined`/`null` — a fresh meal, blank name, no ingredients. Given — an edit, pre-filled at
   * exactly what the meal currently holds (issue #101). */
  readonly initial?: MealFormInitial | null;
  readonly onSave: (values: MealFormValues) => void;
  readonly onCancel: () => void;
  /** Formatting locale for the dropdown's kcal/protein figures. Defaults to the device's. */
  readonly locale?: string;
  readonly theme: Theme;
  readonly testID?: string;
};

/** An ingredient the user has added, pre-filled at one serving on the tap that added it. */
type Ingredient = { readonly id: string; readonly name: string; readonly qty: number };

/** The clear-query × and the remove-ingredient × — same plain-Unicode glyph `SearchSheet` already
 * uses for "clear", no icon library installed yet (`CLAUDE.md` — raise a native dependency first). */
const CLEAR_GLYPH = '×';

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

function EmptyState({ theme, testID }: { theme: Theme; testID: string }) {
  const { sectionLabel } = theme.color;
  return (
    <View testID={testID} accessible accessibilityLabel="Add a food first — a meal is built from foods already in your catalogue." style={styles.empty}>
      <Text style={textStyle(type.body, sectionLabel.labelText)}>No foods yet.</Text>
      <Text style={[textStyle(type.label, sectionLabel.metaText), styles.emptyLine]}>
        Add a food first — a meal is built from foods already in your catalogue.
      </Text>
    </View>
  );
}

/** One row in the search dropdown. Tapping it adds the food as an ingredient below. */
function MatchRow({
  candidate,
  theme,
  locale,
  onPress,
  testID,
}: {
  candidate: FoodCandidate;
  theme: Theme;
  locale?: string;
  onPress: () => void;
  testID: string;
}) {
  const { resultRow } = theme.color;
  const kcalText = Math.round(candidate.kcal).toLocaleString(locale);
  const proteinText = Math.round(candidate.protein).toLocaleString(locale);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Add ${candidate.name}, ${kcalText} kilocalories, ${proteinText} grams protein`}
      style={[
        styles.matchRow,
        { minHeight: size.resultRow.heightHit, backgroundColor: resultRow.bg, borderBottomColor: resultRow.divider, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[textStyle(type.body, resultRow.nameText), styles.name]}>
          {candidate.name}
        </Text>
        <Text style={textStyle(type.caption, resultRow.servingText)}>
          {candidate.brand ? `${candidate.brand} · ${candidate.servingLabel}` : candidate.servingLabel}
        </Text>
      </View>
      <View style={styles.rowFigures}>
        <Text testID={`${testID}-kcal`} style={textStyle(type.numericSm, resultRow.kcalText)}>
          {`${kcalText} kcal`}
        </Text>
        <Text testID={`${testID}-protein`} style={textStyle(type.numericSm, resultRow.proteinText)}>
          {formatGrams(candidate.protein, locale)}
        </Text>
      </View>
    </Pressable>
  );
}

export function MealForm({ db, initial, onSave, onCancel, locale, theme, testID = 'meal-form' }: MealFormProps) {
  const { button, state, searchSheet, text } = theme.color;

  // Read once per mount (`SearchSheet`'s own "ranked once per visit" discipline) — this screen is
  // never open long enough for the catalogue or the clock to matter mid-visit.
  const [when] = useState(deviceWhen);
  const [hasFoods] = useState(() => listFoods(db).length > 0);

  const [name, setName] = useState(initial?.name ?? '');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<readonly Ingredient[]>(() => initial?.items ?? []);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const addedIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const results = useMemo<readonly FoodCandidate[]>(
    () => (trimmedQuery.length === 0 ? [] : searchFoodsOnly(db, { ...when, query: trimmedQuery }).filter((candidate) => !addedIds.has(candidate.id))),
    [db, when, trimmedQuery, addedIds],
  );

  const setQty = (id: string, qty: number): void => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, qty } : item)));
  };

  const removeItem = (id: string): void => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  // One tap both adds and includes the ingredient (a fresh row starts at one serving, the "usual
  // portion" prediction) — unlike the old all-foods list, where every row already existed and a food
  // only counted once its stepper left zero. Clearing the query closes the dropdown and readies the
  // field for the next search, so adding several ingredients in a row never needs an extra tap to
  // dismiss anything first.
  const addIngredient = (candidate: FoodCandidate): void => {
    setItems((current) => (current.some((item) => item.id === candidate.id) ? current : [...current, { id: candidate.id, name: candidate.name, qty: 1 }]));
    setQuery('');
  };

  const handleSave = (): void => {
    if (name.trim().length === 0) {
      setError('Name is required.');
      return;
    }
    const mealItems: MealItemInput[] = items.filter((item) => item.qty > 0).map((item) => ({ foodId: item.id, qty: item.qty }));
    if (mealItems.length === 0) {
      setError('Add at least one food to the meal.');
      return;
    }
    setError(null);
    onSave({ name: name.trim(), items: mealItems });
  };

  if (!hasFoods) {
    return (
      <View testID={testID} style={styles.root}>
        <EmptyState theme={theme} testID={`${testID}-empty`} />
        <Pressable
          testID={`${testID}-cancel`}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={[styles.actionButton, { minHeight: size.tapTargetMin, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: button.secondaryBorder }]}
        >
          <Text style={textStyle(type.button, button.secondaryText)}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView testID={testID} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.field}>
        <Text style={textStyle(type.label, text.secondary)}>Name</Text>
        <TextInput
          testID={`${testID}-name`}
          value={name}
          onChangeText={setName}
          placeholder="Breakfast bowl"
          placeholderTextColor={searchSheet.placeholderText}
          accessibilityLabel="Meal name"
          style={[
            textStyle(type.input, searchSheet.queryText),
            styles.input,
            { minHeight: size.tapTargetMin, borderRadius: radius.md, backgroundColor: searchSheet.fieldBg, borderColor: searchSheet.fieldBorder },
          ]}
        />
      </View>

      <View style={styles.field}>
        <Text style={textStyle(type.label, text.secondary)}>Add ingredient</Text>
        <View
          style={[
            styles.searchFieldRow,
            {
              minHeight: size.tapTargetMin,
              borderRadius: radius.md,
              backgroundColor: searchSheet.fieldBg,
              borderColor: trimmedQuery.length > 0 ? searchSheet.fieldBorderFocus : searchSheet.fieldBorder,
            },
          ]}
        >
          <TextInput
            testID={`${testID}-search`}
            value={query}
            onChangeText={setQuery}
            placeholder="Search foods"
            placeholderTextColor={searchSheet.placeholderText}
            selectionColor={searchSheet.caret}
            accessibilityLabel="Search foods to add"
            style={[textStyle(type.input, searchSheet.queryText), styles.input, styles.searchInput]}
          />
          {query.length > 0 ? (
            <Pressable
              testID={`${testID}-search-clear`}
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={space[2]}
              style={styles.clearButton}
            >
              <Text style={{ fontSize: size.icon.md, color: searchSheet.clearIcon }}>{CLEAR_GLYPH}</Text>
            </Pressable>
          ) : null}
        </View>

        {trimmedQuery.length > 0 ? (
          <View testID={`${testID}-dropdown`} style={[styles.dropdown, { backgroundColor: theme.color.card.bg, borderColor: theme.color.card.border }]}>
            {results.length > 0 ? (
              <FlatList
                data={results}
                keyExtractor={(candidate) => candidate.id}
                scrollEnabled={false}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <MatchRow candidate={item} theme={theme} locale={locale} onPress={() => addIngredient(item)} testID={`${testID}-match-${item.id}`} />
                )}
              />
            ) : (
              <Text testID={`${testID}-dropdown-empty`} style={[textStyle(type.label, searchSheet.sectionMetaText), styles.dropdownEmpty]}>
                No matches.
              </Text>
            )}
          </View>
        ) : null}
      </View>

      {items.length > 0 ? (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <View style={styles.itemRow}>
              <View style={styles.itemStepper}>
                <Stepper
                  label={item.name}
                  value={item.qty}
                  step={0.5}
                  unit="servings"
                  onChange={(qty) => setQty(item.id, qty)}
                  formatValue={(v) => v.toLocaleString()}
                  theme={theme}
                  testID={`${testID}-item-${item.id}`}
                />
              </View>
              <Pressable
                testID={`${testID}-item-${item.id}-remove`}
                onPress={() => removeItem(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.name}`}
                hitSlop={space[2]}
                style={styles.removeButton}
              >
                <Text style={{ fontSize: size.icon.lg, color: text.tertiary }}>{CLEAR_GLYPH}</Text>
              </Pressable>
            </View>
          )}
        />
      ) : null}

      {error ? (
        <Text testID={`${testID}-error`} style={textStyle(type.label, state.danger)}>
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          testID={`${testID}-cancel`}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={[styles.actionButton, { minHeight: size.tapTargetMin, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: button.secondaryBorder }]}
        >
          <Text style={textStyle(type.button, button.secondaryText)}>Cancel</Text>
        </Pressable>
        <Pressable
          testID={`${testID}-save`}
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Save meal"
          style={[styles.actionButton, { minHeight: size.tapTargetMin, borderRadius: radius.md, backgroundColor: button.kcalBg }]}
        >
          <Text style={textStyle(type.button, button.kcalText)}>Save</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // No horizontal padding here or on `content` below — this component fills whatever width its
  // caller (the `/meals/new` screen) gives it, the same way `<FoodForm>` does; the screen's own
  // gutter is the only horizontal margin, applied once rather than twice.
  root: {
    gap: space[6],
  },
  content: {
    gap: space[6],
    paddingBottom: space[9],
  },
  field: {
    gap: space[2],
  },
  input: {
    paddingHorizontal: space[5],
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    borderWidth: 0,
  },
  clearButton: {
    minWidth: size.tapTargetMin,
    minHeight: size.tapTargetMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdown: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  dropdownEmpty: {
    paddingHorizontal: space[5],
    paddingVertical: space[4],
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[5],
    paddingVertical: space[3],
    gap: space[4],
  },
  rowText: {
    flexShrink: 1,
    gap: space[1],
  },
  name: {
    flexShrink: 1,
  },
  rowFigures: {
    alignItems: 'flex-end',
    gap: space[1],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  itemStepper: {
    flex: 1,
  },
  removeButton: {
    minWidth: size.tapTargetMin,
    minHeight: size.tapTargetMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: space[4],
  },
  actions: {
    flexDirection: 'row',
    gap: space[4],
  },
  actionButton: {
    flex: 1,
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
