/**
 * `<MealList>` — issue #101's "Meals (Settings): tap to edit, swipe to delete". The ruling on #101
 * retired the old #43 tap-to-log behaviour for this list: tapping a row now opens `/meals/[id]`
 * through `onSelect` (`<MealForm initial={...}>`, pre-filled), exactly as `<FoodList>` already does
 * for a food (#100). Saved meals are still logged in one tap — from the quick-add grid and search —
 * just never from here. `FlatList`, not a `map` — the saved-meals catalogue, like the foods list, has
 * no bound on how it grows.
 *
 * SWIPE-LEFT DELETES, WITH UNDO (issue #101). Tap edits; swipe reveals the same `<SwipeToDelete>`
 * trash button `<FoodList>`/`DayLogRow` give (issue #80/#85/#141) — one gesture, one danger button,
 * defined once. Delete here is `deleteMeal`, which tombstones the meal and its live items in one
 * transaction but never touches `food_log` — a row already logged from this meal keeps its own
 * literal `kcal`/`protein` (`CLAUDE.md`'s immutability rule), so deleting the meal it came from
 * changes nothing about the past. Undo calls `restoreMeal` with the exact receipt `deleteMeal`
 * returned, the mechanism db-engineer built in #154/#157 for precisely this: it can only resurrect
 * items that were live at delete time, scoped to this meal, so double-undo and an earlier
 * `updateMeal` removal both stay correct.
 *
 * `UndoToken` HAS NO PATH TO UN-TOMBSTONE A MEAL (raised on #101, same trap #100 found for a food
 * archive). The toast payload here carries `action`, not `token` — `src/store/undoToast.ts`'s own
 * doc comment covers exactly this case, and #100/`FoodList` already set the precedent for reusing it
 * rather than widening the `UndoToken` union for a second, unrelated write shape.
 *
 * OPTIMISTIC, LOCAL-ONLY HIDING. `hiddenIds` is this component's own state, not a prop — swiping
 * delete must hide the row the same instant it fires, without waiting for the parent's next
 * `listMeals()` refetch (`CLAUDE.md`: the UI never waits on a round trip for its own write). An undo
 * removes the id from the set, restoring the row in place; a genuine refetch (the screen refocusing)
 * naturally supersedes it either way, since a deleted meal no longer comes back from `listMeals()`.
 */
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent, type TextStyle } from 'react-native';
import { deleteMeal, restoreMeal, VitalsDbError, type MealSummary, type VitalsDb } from '../../db';
import { formatGrams } from '../format/food';
import { deviceWhen } from '../../hooks/deviceWhen';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { SwipeToDelete } from '../shared/SwipeToDelete';
import { useUndoToastStore } from '../../store/undoToast';
import { haptics, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';

export type MealListProps = {
  readonly db: VitalsDb;
  readonly meals: readonly MealSummary[];
  /** Tapping a row calls this with the meal to edit — the caller navigates to `/meals/[id]`. */
  readonly onSelect: (meal: MealSummary) => void;
  readonly onCreate: () => void;
  readonly locale?: string;
  readonly theme: Theme;
  readonly testID?: string;
};

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

function toastMeta(kcal: number, protein: number, locale?: string): string {
  return `${Math.round(kcal).toLocaleString(locale)} kcal · ${formatGrams(protein, locale)} protein`;
}

function EmptyState({ theme, testID }: { theme: Theme; testID: string }) {
  const { sectionLabel } = theme.color;
  return (
    <View testID={testID} accessible accessibilityLabel="No saved meals yet. Create one from foods you've already added." style={styles.empty}>
      <Text style={textStyle(type.body, sectionLabel.labelText)}>No saved meals yet.</Text>
      <Text style={[textStyle(type.label, sectionLabel.metaText), styles.emptyLine]}>Create one from foods you&apos;ve already added.</Text>
    </View>
  );
}

export function MealList({ db, meals, onSelect, onCreate, locale, theme, testID = 'meal-list' }: MealListProps) {
  const { resultRow, sectionLabel } = theme.color;
  const fireHaptic = useHapticFeedback();

  // See the module note: local-only, optimistic hiding of a just-deleted row. A real refetch (the
  // screen regaining focus) supersedes this either way, since `listMeals()` already excludes a
  // tombstoned meal on its own.
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const visibleMeals = meals.filter((meal) => !hiddenIds.has(meal.id));

  const handleDelete = (meal: MealSummary): void => {
    const now = deviceWhen();
    let itemIds: readonly string[];
    try {
      itemIds = deleteMeal(db, { at: now.at, id: meal.id }).itemIds;
    } catch (err) {
      // Same doctrine as every write in `QuickAddGrid`: no dialog, no crash for a failed delete.
      if (!(err instanceof VitalsDbError)) throw err;
      return;
    }
    setHiddenIds((current) => new Set(current).add(meal.id));
    fireHaptic(haptics.destructiveConfirm);
    useUndoToastStore.getState().show({
      title: meal.name,
      meta: toastMeta(meal.kcal, meal.protein, locale),
      verb: 'deleting',
      action: () => {
        restoreMeal(db, { at: deviceWhen().at, mealId: meal.id, itemIds });
        setHiddenIds((current) => {
          const next = new Set(current);
          next.delete(meal.id);
          return next;
        });
      },
    });
  };

  const renderRow = ({ item }: { item: MealSummary }) => {
    const kcalText = Math.round(item.kcal).toLocaleString(locale);

    const handleAccessibilityAction = (event: AccessibilityActionEvent): void => {
      if (event.nativeEvent.actionName === 'delete') handleDelete(item);
    };

    const rowTestID = `${testID}-row-${item.id}`;

    return (
      <SwipeToDelete
        theme={theme}
        deleteLabel={item.name}
        onDelete={() => handleDelete(item)}
        style={{ minHeight: size.tapTargetMin }}
        testID={rowTestID}
      >
        {({ revealed, close }) => (
          <Pressable
            testID={rowTestID}
            onPress={revealed ? close : () => onSelect(item)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.name}`}
            accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
            onAccessibilityAction={handleAccessibilityAction}
            style={[
              styles.row,
              { minHeight: size.tapTargetMin, backgroundColor: resultRow.bg, borderBottomColor: resultRow.divider, borderBottomWidth: StyleSheet.hairlineWidth },
            ]}
          >
            <View style={styles.rowText}>
              <Text testID={`${testID}-row-${item.id}-name`} style={textStyle(type.body, resultRow.nameText)}>
                {item.name}
              </Text>
              <Text testID={`${testID}-row-${item.id}-meta`} style={textStyle(type.caption, resultRow.servingText)}>
                {`${item.itemCount} item${item.itemCount === 1 ? '' : 's'}`}
              </Text>
            </View>
            <View style={styles.rowFigures}>
              <Text testID={`${testID}-row-${item.id}-kcal`} style={textStyle(type.numeric, resultRow.kcalText)}>
                {`${kcalText} kcal`}
              </Text>
              <Text testID={`${testID}-row-${item.id}-protein`} style={textStyle(type.numeric, resultRow.proteinText)}>
                {formatGrams(item.protein, locale)}
              </Text>
            </View>
          </Pressable>
        )}
      </SwipeToDelete>
    );
  };

  return (
    <View testID={testID} style={styles.root}>
      <View style={styles.header}>
        <Text style={textStyle(type.micro, sectionLabel.labelText)}>Saved meals</Text>
        <Pressable
          testID={`${testID}-add`}
          onPress={onCreate}
          accessibilityRole="button"
          accessibilityLabel="New meal"
          hitSlop={space[3]}
          style={styles.addLink}
        >
          <Text style={textStyle(type.button, resultRow.createText)}>{'+ New meal'}</Text>
        </Pressable>
      </View>

      {visibleMeals.length === 0 ? (
        <EmptyState theme={theme} testID={`${testID}-empty`} />
      ) : (
        <FlatList data={visibleMeals} keyExtractor={(meal) => meal.id} renderItem={renderRow} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
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
  },
  rowText: {
    flexShrink: 1,
    gap: space[1],
  },
  rowFigures: {
    alignItems: 'flex-end',
    gap: space[1],
  },
  addLink: {
    minHeight: size.tapTargetMin,
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
