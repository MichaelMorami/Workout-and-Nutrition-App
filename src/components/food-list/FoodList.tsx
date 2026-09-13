/**
 * `<FoodList>` — issue #43's food management list: every live food (`listFoods`), name order, tap
 * one to edit it through `<FoodForm>`, "+ Add food" to create one. `FlatList`, not a `map` — the
 * catalogue grows without bound over the app's lifetime (`CLAUDE.md`'s virtualisation rule).
 *
 * Row figures reuse `resultRow.*` — the same tokens the (future, #24) search sheet paints a food
 * row with: this list and that sheet show the same fact (a food's name, serving, kcal, protein), so
 * they share the same look rather than inventing a second row style for it.
 */
import { FlatList, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import type { FoodRow } from '../../db';
import { size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';

export type FoodListProps = {
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

export function FoodList({ foods, onSelect, onAdd, locale, theme, testID = 'food-list' }: FoodListProps) {
  const { resultRow, sectionLabel } = theme.color;

  const renderRow = ({ item }: { item: FoodRow }) => (
    <Pressable
      testID={`${testID}-row-${item.id}`}
      onPress={() => onSelect(item)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.name}`}
      style={[styles.row, { minHeight: size.tapTargetMin, backgroundColor: resultRow.bg, borderBottomColor: resultRow.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}
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
        <Text style={textStyle(type.numeric, resultRow.kcalText)}>{`${Math.round(item.kcalPerServing).toLocaleString(locale)} kcal`}</Text>
        <Text style={textStyle(type.numeric, resultRow.proteinText)}>{`${Math.round(item.proteinPerServing).toLocaleString(locale)} g`}</Text>
      </View>
    </Pressable>
  );

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

      {foods.length === 0 ? (
        <EmptyState theme={theme} testID={`${testID}-empty`} />
      ) : (
        <FlatList data={foods} keyExtractor={(food) => food.id} renderItem={renderRow} />
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
