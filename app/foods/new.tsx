import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { FoodForm } from '../../src/components/food-form';
import { deviceWhen } from '../../src/hooks/deviceWhen';
import { useDb } from '../../src/hooks/useDb';
import { useTheme } from '../../src/hooks/useTheme';
import type { FoodInput } from '../../src/db';
import { createFood } from '../../src/db';
import { layout } from '../../src/theme/tokens';

/**
 * `/foods/new` — issue #43's add-food screen: `<FoodForm>` with no `initial`, so every field
 * starts blank/zero (its own module note). Save writes the food once and pops back to `/foods`,
 * whose focus-effect refetch (see that screen's module note) is what shows it there — no second
 * write path, no navigation beyond a single `back()`.
 */
export default function NewFoodScreen(): React.JSX.Element {
  const db = useDb();
  const theme = useTheme();
  const router = useRouter();

  const handleSave = (input: FoodInput): void => {
    createFood(db, { at: deviceWhen().at, food: input });
    router.back();
  };

  return (
    <View testID="new-food-screen" style={[styles.screen, { backgroundColor: theme.color.bg.canvas }]}>
      <Stack.Screen options={{ title: 'Add food' }} />
      <FoodForm onSave={handleSave} onCancel={() => router.back()} theme={theme} testID="food-form" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    // No `paddingHorizontal` here — `<FormFrame>` (issue #207, inside `<FoodForm>`) owns the side
    // gutter on its own body and footer now, so this screen stays edge-to-edge.
    flex: 1,
    paddingTop: layout.gutter,
  },
});
