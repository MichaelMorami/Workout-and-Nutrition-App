/**
 * `<FoodList>` — issue #43's food management list: every live food (`listFoods`), name order, tap
 * one to edit it through `<FoodForm>`, "+ Add food" to create one. `FlatList`, not a `map` — the
 * catalogue grows without bound over the app's lifetime (`CLAUDE.md`'s virtualisation rule).
 *
 * Row figures reuse `resultRow.*` — the same tokens the (future, #24) search sheet paints a food
 * row with: this list and that sheet show the same fact (a food's name, serving, kcal, protein), so
 * they share the same look rather than inventing a second row style for it.
 *
 * SWIPE-LEFT DELETES, WITH UNDO (issue #100). Tap edits; swipe reveals the same trash button
 * `<SwipeToDelete>` gives `DayLogRow` (issue #85/#141) — one gesture, one danger button, defined
 * once. Delete here is `setFoodArchived(..., { archived: true })`, never a tombstone: a saved meal
 * that already contains this food keeps logging it (the ruling on #100), and undoing just calls
 * `setFoodArchived(..., { archived: false })` again — there is no `UndoToken` for an archive, so the
 * toast payload carries `action` instead of `token` (`src/store/undoToast.ts`'s own doc comment).
 *
 * OPTIMISTIC, LOCAL-ONLY HIDING. `hiddenIds` is this component's own state, not a prop — swiping
 * delete must hide the row the same instant it fires, without waiting for the parent's next
 * `listFoods()` refetch (`CLAUDE.md`: the UI never waits on a round trip for its own write). An
 * undo removes the id from the set, restoring the row in place; a genuine refetch (the screen
 * refocusing) naturally supersedes it either way, since an archived food no longer comes back from
 * `listFoods()`.
 *
 * THE "STILL IN THESE MEALS" NOTICE RIDES THE SAME TOAST, NOT A SEPARATE ONE. `mealsContainingFood`
 * runs once, at the moment of delete — the toast's `meta` line names them ("Still in Breakfast,
 * Post-workout") after the usual kcal/protein figures, or omits the clause entirely when the food
 * is in no saved meal. This is deliberately the *toast*'s job, not a second dialog: the ruling on
 * #100 only requires the user be told, not stopped.
 *
 * A TEMPORARY DEEP IMPORT, FLAGGED FOR db-engineer. `mealsContainingFood` and `MealRef` (issue
 * #153, PR #156) are implemented and tested in `src/db/queries/catalog.ts` / `src/db/types.ts`, but
 * neither is re-exported from the `src/db` barrel (`src/db/index.ts`) yet — every other symbol this
 * file needs comes from `../../db` as the module's own contract requires. `src/db/index.ts` is
 * db-engineer's file, not `ui-engineer`'s, so this file reaches around the barrel for just these
 * two names rather than editing it — see the PR body for the one-line fix this is waiting on.
 */
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent, type TextStyle } from 'react-native';
import { setFoodArchived, VitalsDbError, type FoodRow, type VitalsDb } from '../../db';
// TEMPORARY: see the module note above. `mealsContainingFood`/`MealRef` are not yet re-exported
// from the `../../db` barrel — this reaches past it for just these two names (issue #100).
import { mealsContainingFood } from '../../db/queries/catalog';
import type { MealRef } from '../../db/types';
import { deviceWhen } from '../../hooks/deviceWhen';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { formatGrams } from '../format/food';
import { SwipeToDelete } from '../shared/SwipeToDelete';
import { useUndoToastStore } from '../../store/undoToast';
import { haptics, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';

export type FoodListProps = {
  readonly db: VitalsDb;
  readonly foods: readonly FoodRow[];
  readonly onSelect: (food: FoodRow) => void;
  readonly onAdd: () => void;
  /** Formatting locale for the kcal/protein figures. Defaults to the device's. */
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

/** "Fage · 1 pot" / "1 pot" — brand only shown when the food has one. */
function servingSummary(food: FoodRow): string {
  return food.brand ? `${food.brand} · ${food.servingLabel}` : food.servingLabel;
}

/** "120 kcal · 20 g protein", plus "· Still in Breakfast, Post-workout" when a saved meal still
 * references this food (the ruling on #100: the user is told which, never blocked). */
export function archiveToastMeta(food: FoodRow, meals: readonly MealRef[], locale?: string): string {
  const kcalText = Math.round(food.kcalPerServing).toLocaleString(locale);
  const base = `${kcalText} kcal · ${formatGrams(food.proteinPerServing, locale)} protein`;
  if (meals.length === 0) return base;
  return `${base} · Still in ${meals.map((meal) => meal.name).join(', ')}`;
}

function EmptyState({ theme, testID }: { theme: Theme; testID: string }) {
  const { sectionLabel } = theme.color;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel="No foods yet. Tap Add food to create your first one."
      style={styles.empty}
    >
      <Text style={textStyle(type.body, sectionLabel.labelText)}>No foods yet.</Text>
      <Text style={[textStyle(type.label, sectionLabel.metaText), styles.emptyLine]}>Tap Add food to create your first one.</Text>
    </View>
  );
}

export function FoodList({ db, foods, onSelect, onAdd, locale, theme, testID = 'food-list' }: FoodListProps) {
  const { resultRow, sectionLabel } = theme.color;
  const fireHaptic = useHapticFeedback();

  // See the module note: local-only, optimistic hiding of a just-deleted row. A real refetch
  // (the screen regaining focus) supersedes this either way, since `listFoods()` already excludes
  // an archived food on its own.
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const visibleFoods = foods.filter((food) => !hiddenIds.has(food.id));

  const handleDelete = (food: FoodRow): void => {
    const now = deviceWhen();
    let meals: readonly MealRef[];
    try {
      meals = mealsContainingFood(db, food.id);
      setFoodArchived(db, { at: now.at, id: food.id, archived: true });
    } catch (err) {
      // Same doctrine as every write in `QuickAddGrid`: no dialog, no crash for a failed delete.
      if (!(err instanceof VitalsDbError)) throw err;
      return;
    }
    setHiddenIds((current) => new Set(current).add(food.id));
    fireHaptic(haptics.destructiveConfirm);
    useUndoToastStore.getState().show({
      title: food.name,
      meta: archiveToastMeta(food, meals, locale),
      verb: 'deleting',
      action: () => {
        setFoodArchived(db, { at: deviceWhen().at, id: food.id, archived: false });
        setHiddenIds((current) => {
          const next = new Set(current);
          next.delete(food.id);
          return next;
        });
      },
    });
  };

  const renderRow = ({ item }: { item: FoodRow }) => {
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
              <Text testID={`${testID}-row-${item.id}-serving`} style={textStyle(type.caption, resultRow.servingText)}>
                {servingSummary(item)}
              </Text>
            </View>
            <View style={styles.rowFigures}>
              <Text testID={`${testID}-row-${item.id}-kcal`} style={textStyle(type.numeric, resultRow.kcalText)}>
                {`${Math.round(item.kcalPerServing).toLocaleString(locale)} kcal`}
              </Text>
              <Text testID={`${testID}-row-${item.id}-protein`} style={textStyle(type.numeric, resultRow.proteinText)}>
                {formatGrams(item.proteinPerServing, locale)}
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
        <Text style={textStyle(type.micro, sectionLabel.labelText)}>Foods</Text>
        <Pressable
          testID={`${testID}-add`}
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add food"
          hitSlop={space[3]}
          style={styles.addLink}
        >
          <Text style={textStyle(type.button, resultRow.createText)}>{'+ Add food'}</Text>
        </Pressable>
      </View>

      {visibleFoods.length === 0 ? (
        <EmptyState theme={theme} testID={`${testID}-empty`} />
      ) : (
        <FlatList data={visibleFoods} keyExtractor={(food) => food.id} renderItem={renderRow} />
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
