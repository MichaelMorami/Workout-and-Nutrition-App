import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MealForm, type MealFormValues } from '../../src/components/meals';
import { deviceWhen } from '../../src/hooks/deviceWhen';
import { useDb } from '../../src/hooks/useDb';
import { useTheme } from '../../src/hooks/useTheme';
import { createMeal } from '../../src/db';
import { layout } from '../../src/theme/tokens';

/**
 * `/meals/new` — issue #43's "saved meals: create from foods". Issue #98: `<MealForm>` owns its own
 * search of the food library (`searchFoodsOnly`) now, so this screen only hands it `db`; saving
 * calls `createMeal` with the entered name and items, then pops back to `/meals`, whose own
 * focus-effect refetch is what shows the new meal there.
 */
export default function NewMealScreen(): React.JSX.Element {
  const db = useDb();
  const theme = useTheme();
  const router = useRouter();

  const handleSave = (values: MealFormValues): void => {
    createMeal(db, { at: deviceWhen().at, name: values.name, items: values.items });
    router.back();
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.color.bg.canvas }]}>
      <Stack.Screen options={{ title: 'New meal' }} />
      <MealForm db={db} onSave={handleSave} onCancel={() => router.back()} theme={theme} testID="meal-form" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: layout.gutter,
    paddingTop: layout.gutter,
  },
});
