/**
 * `<MealList>` — issue #43's "saved meals: log as one tap". Tapping a row logs one portion of that
 * meal immediately (`logMeal`) — the same tap doctrine `QuickAddTile` follows for a food: no
 * confirmation, no navigation, a haptic and an undo toast are the only feedback. `FlatList`, not a
 * `map` — the saved-meals catalogue, like the foods list, has no bound on how it grows.
 *
 * ONE TAP, NOT A DOUBLE-TAP-ADDS-A-PORTION. Issue #21's `logTracker`/`addPortion` double-tap
 * machinery lives on the quick-add grid, where the six most-used items are re-tapped constantly —
 * this management list is reached far less often (via Settings, not the Today screen's main loop),
 * so a second tap here simply logs a second, independent portion rather than needing that repeat-
 * window bookkeeping. Nothing about the undo path changes: `logMeal`'s own `UndoToken` still
 * reverses exactly the entries this tap created.
 */
import { FlatList, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { logMeal, VitalsDbError, type MealSummary, type VitalsDb } from '../../db';
import { deviceWhen } from '../../hooks/deviceWhen';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { logTrackerKey } from '../../store/logTracker';
import { useUndoToastStore, type LogDelta } from '../../store/undoToast';
import { haptics, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { candidateForMeal } from './meal-candidate';

export type MealListProps = {
  readonly db: VitalsDb;
  readonly meals: readonly MealSummary[];
  /** Called after a meal logs successfully, with the delta a caller's running totals need. */
  readonly onLogged?: (delta: LogDelta) => void;
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
  return `${Math.round(kcal).toLocaleString(locale)} kcal · ${Math.round(protein).toLocaleString(locale)} g protein`;
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

export function MealList({ db, meals, onLogged, onCreate, locale, theme, testID = 'meal-list' }: MealListProps) {
  const { resultRow, sectionLabel } = theme.color;
  const fireHaptic = useHapticFeedback();

  const handleTap = (meal: MealSummary): void => {
    const now = deviceWhen();
    try {
      const receipt = logMeal(db, { ...now, mealId: meal.id });
      fireHaptic(haptics.foodLogged);
      const kcal = receipt.entries.reduce((sum, entry) => sum + entry.kcal, 0);
      const protein = receipt.entries.reduce((sum, entry) => sum + entry.protein, 0);
      const delta: LogDelta = { kcal, protein, entryCountDelta: receipt.entries.length };
      useUndoToastStore.getState().show({
        token: receipt.undo,
        candidateKey: logTrackerKey(candidateForMeal(meal)),
        title: meal.name,
        meta: toastMeta(kcal, protein, locale),
        delta,
      });
      onLogged?.(delta);
    } catch (err) {
      // See the module note: a failed write is never a user-visible event, and there is nothing to
      // undo from a log that never landed.
      if (!(err instanceof VitalsDbError)) throw err;
    }
  };

  const renderRow = ({ item }: { item: MealSummary }) => {
    const kcalText = Math.round(item.kcal).toLocaleString(locale);
    const proteinText = Math.round(item.protein).toLocaleString(locale);
    return (
      <Pressable
        testID={`${testID}-row-${item.id}`}
        onPress={() => handleTap(item)}
        accessibilityRole="button"
        accessibilityLabel={`Log ${item.name}, ${kcalText} kilocalories, ${proteinText} grams protein`}
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
          <Text style={textStyle(type.numeric, resultRow.kcalText)}>{`${kcalText} kcal`}</Text>
          <Text style={textStyle(type.numeric, resultRow.proteinText)}>{`${proteinText} g`}</Text>
        </View>
      </Pressable>
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

      {meals.length === 0 ? (
        <EmptyState theme={theme} testID={`${testID}-empty`} />
      ) : (
        <FlatList data={meals} keyExtractor={(meal) => meal.id} renderItem={renderRow} />
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
