import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FoodList } from '../../src/components/food-list';
import { useDb } from '../../src/hooks/useDb';
import { useTheme } from '../../src/hooks/useTheme';
import { listFoods, type FoodRow } from '../../src/db';

/**
 * `/foods` — issue #43's food-management list. Reached from Settings, not the Today screen's main
 * loop (`MealList`'s own module note makes the same call for saved meals) — this is where the
 * catalogue itself is curated, not where it is logged from.
 *
 * `listFoods` is re-read on every focus, not just on mount: `/foods/new` and `/foods/[id]` are
 * both pushed on top of this screen and pop back to it, so "focus" is exactly the moment a create
 * or an edit needs to show up here, with no separate refresh affordance for the user to find.
 */
export default function FoodsScreen(): React.JSX.Element {
  const db = useDb();
  const theme = useTheme();
  const router = useRouter();
  const [foods, setFoods] = useState<readonly FoodRow[]>(() => listFoods(db));

  useFocusEffect(
    useCallback(() => {
      setFoods(listFoods(db));
    }, [db]),
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.color.bg.canvas }]}>
      <FoodList
        foods={foods}
        onSelect={(food) => router.push(`/foods/${food.id}`)}
        onAdd={() => router.push('/foods/new')}
        theme={theme}
        testID="foods-screen-list"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
