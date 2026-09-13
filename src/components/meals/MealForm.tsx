/**
 * `<MealForm>` — issue #43's "saved meals: create from foods". A meal needs a name and at least one
 * food; each food's amount is a `<Stepper>` in servings of that food per portion of the meal
 * (`MealItemInput['qty']`'s own definition), starting at 0 — nudging it above 0 is what includes the
 * food, so there is no second checkbox control to keep in sync with the amount.
 *
 * A CATALOGUE WITH NO FOODS YET CANNOT BUILD A MEAL. `createMeal` throws `empty_meal` for zero
 * items, and there is nothing to pick from with an empty `foods` list — the empty state says so and
 * offers no Save button to fail against, rather than letting a tap discover the error.
 */
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import type { FoodRow, MealItemInput } from '../../db';
import { radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { Stepper } from '../food-form';

export type MealFormValues = { readonly name: string; readonly items: readonly MealItemInput[] };

export type MealFormProps = {
  /** Every live food the meal can be built from (`listFoods`). */
  readonly foods: readonly FoodRow[];
  readonly onSave: (values: MealFormValues) => void;
  readonly onCancel: () => void;
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

export function MealForm({ foods, onSave, onCancel, theme, testID = 'meal-form' }: MealFormProps) {
  const { button, state, searchSheet, text } = theme.color;

  const [name, setName] = useState('');
  const [qtyByFoodId, setQtyByFoodId] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const setQty = (foodId: string, qty: number): void => {
    setQtyByFoodId((current) => ({ ...current, [foodId]: qty }));
  };

  const handleSave = (): void => {
    if (name.trim().length === 0) {
      setError('Name is required.');
      return;
    }
    const items: MealItemInput[] = foods
      .map((food) => ({ foodId: food.id, qty: qtyByFoodId[food.id] ?? 0 }))
      .filter((item) => item.qty > 0);
    if (items.length === 0) {
      setError('Add at least one food to the meal.');
      return;
    }
    setError(null);
    onSave({ name: name.trim(), items });
  };

  if (foods.length === 0) {
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
    <ScrollView testID={testID} contentContainerStyle={styles.content}>
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

      <FlatList
        data={foods}
        keyExtractor={(food) => food.id}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <Stepper
            label={item.name}
            value={qtyByFoodId[item.id] ?? 0}
            step={0.5}
            unit="servings"
            onChange={(qty) => setQty(item.id, qty)}
            formatValue={(v) => v.toLocaleString()}
            theme={theme}
            testID={`${testID}-item-${item.id}`}
          />
        )}
      />

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
