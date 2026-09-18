import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MealForm, type MealFormInitial, type MealFormValues } from '../../src/components/meals';
import { deviceWhen } from '../../src/hooks/deviceWhen';
import { useDb } from '../../src/hooks/useDb';
import { useTheme } from '../../src/hooks/useTheme';
import { getMeal, updateMeal, type MealDetail } from '../../src/db';
import { layout, space, type } from '../../src/theme/tokens';

/** `MealDetail` -> `<MealForm initial={...}>`'s pre-fill shape: each live item reduced to the food's
 * id/name and the item's own `qty` — a `MealItemInput` alone has no name for the row to display. */
function initialFromMeal(meal: MealDetail): MealFormInitial {
  return {
    name: meal.name,
    items: meal.items.map(({ item, food }) => ({ id: food.id, name: food.name, qty: item.qty })),
  };
}

/**
 * `/meals/[id]` — issue #101's edit-meal screen. `<MealForm initial={...}>` pre-fills at exactly
 * what the meal currently holds; Save calls `updateMeal`, which replaces the meal's live items with
 * whatever the form now holds and bumps `updated_at` — it never touches `food_log`, so a row already
 * logged from this meal keeps its own literal `kcal`/`protein` (`CLAUDE.md`'s immutability rule).
 */
export default function EditMealScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const theme = useTheme();
  const router = useRouter();
  const [meal] = useState<MealDetail | null>(() => getMeal(db, id));

  if (!meal) {
    return (
      <View style={[styles.screen, styles.notFound, { backgroundColor: theme.color.bg.canvas }]}>
        <Stack.Screen options={{ title: 'Meal not found' }} />
        <Text
          testID="meal-form-not-found"
          accessibilityLabel="This meal could not be found. It may have been deleted."
          style={{
            fontFamily: type.body.fontFamily,
            fontSize: type.body.fontSize,
            lineHeight: type.body.lineHeight,
            color: theme.color.text.secondary,
          }}
        >
          This meal could not be found.
        </Text>
      </View>
    );
  }

  const handleSave = (values: MealFormValues): void => {
    updateMeal(db, { at: deviceWhen().at, id: meal.id, patch: { name: values.name, items: values.items } });
    router.back();
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.color.bg.canvas }]}>
      <Stack.Screen options={{ title: meal.name }} />
      <MealForm db={db} initial={initialFromMeal(meal)} onSave={handleSave} onCancel={() => router.back()} theme={theme} testID="meal-form" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: layout.gutter,
    paddingTop: layout.gutter,
  },
  notFound: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
});
