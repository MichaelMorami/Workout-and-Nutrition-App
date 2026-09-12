import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { QuickAddGrid } from '../../src/components/quick-add';
import { useTheme } from '../../src/hooks/useTheme';
import { layout, space } from '../../src/theme/tokens';

/**
 * The Today screen (issue #20). This slice (#40) builds the quick-add grid — the product. Two
 * slots are deliberately left for sibling issues rather than built here:
 *
 *   - Above the grid: the date header and the calorie/protein arcs (#41). Until then `paddingTop`
 *     is a plain token, not a real safe-area inset — #41 owns the header that will sit in that
 *     space and is the right place to wire `react-native-safe-area-context`.
 *   - Below the grid: the "Search foods" bar (#24, decision 4 in `docs/decisions.md`) and the
 *     weight/workout chip row (#41).
 *
 * `ScrollView` rather than a bare `View`: decision — "the day's log is deliberately half below the
 * fold" (issue #20) — this screen is expected to grow taller than one viewport once #41 and #24
 * land, so the container that will hold all of it needs to scroll from day one.
 */
export default function TodayScreen(): React.JSX.Element {
  const { color } = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: color.bg.canvas }}
      contentContainerStyle={styles.content}
      testID="today-screen"
    >
      {/* TODO(#41): date header + calorie/protein arcs go here. */}
      <QuickAddGrid />
      {/* TODO(#24): "Search foods" bar. TODO(#41): weight/workout chip row. */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.gutterToday,
    paddingTop: space[9],
    paddingBottom: space[9],
  },
});
