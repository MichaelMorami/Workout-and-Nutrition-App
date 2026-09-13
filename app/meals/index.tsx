import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MealList } from '../../src/components/meals';
import { UndoToast } from '../../src/components/quick-add';
import { useDb } from '../../src/hooks/useDb';
import { useTheme } from '../../src/hooks/useTheme';
import { listMeals, type MealSummary } from '../../src/db';

/**
 * `/meals` — issue #43's saved-meals screen. Reached from Settings, same reasoning as `/foods`
 * (`<MealList>`'s own module note: this list is reached far less often than the Today screen's
 * main loop). Tapping a meal logs it immediately — `<MealList>`'s own one-tap doctrine, unchanged
 * — so `<UndoToast>` mounts here too, the only way this screen's own log taps get an undo.
 *
 * `listMeals` is re-read on every focus, the same reasoning as `/foods`'s own `listFoods` refetch:
 * `/meals/new` is pushed on top of this screen and pops back to it, and that pop is exactly the
 * moment a newly created meal needs to show up here.
 */
export default function MealsScreen(): React.JSX.Element {
  const db = useDb();
  const theme = useTheme();
  const router = useRouter();
  const [meals, setMeals] = useState<readonly MealSummary[]>(() => listMeals(db));

  useFocusEffect(
    useCallback(() => {
      setMeals(listMeals(db));
    }, [db]),
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.color.bg.canvas }]}>
      <MealList db={db} meals={meals} onCreate={() => router.push('/meals/new')} theme={theme} testID="meals-screen-list" />
      <UndoToast testID="meals-screen-undo-toast" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
