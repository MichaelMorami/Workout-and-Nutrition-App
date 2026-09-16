import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FoodForm } from '../../src/components/food-form';
import { deviceWhen } from '../../src/hooks/deviceWhen';
import { useDb } from '../../src/hooks/useDb';
import { useTheme } from '../../src/hooks/useTheme';
import { getFood, updateFood, type FoodInput, type FoodRow } from '../../src/db';
import { layout, space, type } from '../../src/theme/tokens';

/** `FoodRow` -> the six fields `<FoodForm>`/`updateFood` care about — never the usage cache or
 * sync columns riding along on the row. The per-100 fields, not the derived per-serving ones
 * (issue #86): `<FoodForm>`'s own `FoodInput` is the stored shape, and `servingGrams`/
 * `kcalPerServing`/`proteinPerServing` are read-side conveniences with no honest way back to a
 * per-100 number without the serving amount already in hand here. */
function inputFromFood(food: FoodRow): FoodInput {
  return {
    name: food.name,
    brand: food.brand,
    servingLabel: food.servingLabel,
    basis: food.basis,
    servingAmount: food.servingAmount,
    kcalPer100: food.kcalPer100,
    proteinPer100: food.proteinPer100,
  };
}

/**
 * `/foods/[id]` — issue #43's edit-food screen. `<FoodForm initial={...}>` pre-fills at exactly
 * what the food currently holds; Save calls `updateFood`, which patches the catalogue row only —
 * `food_log` stores `kcal`/`protein` directly at the moment of logging (`CLAUDE.md`'s immutability
 * rule), so a past entry never moves underneath this edit (`[id].test.tsx` proves it end to end,
 * through this screen's own save path, not just `updateFood` in isolation).
 */
export default function EditFoodScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const theme = useTheme();
  const router = useRouter();
  const [food] = useState<FoodRow | null>(() => getFood(db, id));

  if (!food) {
    return (
      <View style={[styles.screen, styles.notFound, { backgroundColor: theme.color.bg.canvas }]}>
        <Stack.Screen options={{ title: 'Food not found' }} />
        <Text
          testID="food-form-not-found"
          accessibilityLabel="This food could not be found. It may have been deleted."
          style={{
            fontFamily: type.body.fontFamily,
            fontSize: type.body.fontSize,
            lineHeight: type.body.lineHeight,
            color: theme.color.text.secondary,
          }}
        >
          This food could not be found.
        </Text>
      </View>
    );
  }

  const handleSave = (input: FoodInput): void => {
    updateFood(db, { at: deviceWhen().at, id: food.id, patch: input });
    router.back();
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.color.bg.canvas }]}>
      <Stack.Screen options={{ title: food.name }} />
      <FoodForm initial={inputFromFood(food)} onSave={handleSave} onCancel={() => router.back()} theme={theme} testID="food-form" />
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
