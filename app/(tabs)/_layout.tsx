import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';
import { useTheme } from '../../src/hooks/useTheme';
import { glyph, size, type, type ColorTokens } from '../../src/theme/tokens';

/** The four bottom-tab routes, in the order `glyph.tab` names them. */
export const tabNames = Object.keys(glyph.tab) as readonly (keyof typeof glyph.tab)[];
type TabName = (typeof tabNames)[number];

/**
 * The icon for one tab (issue #81): a pure function returning the small component `Tabs.Screen`
 * hands to `tabBarIcon`, so a test can render it directly with no router harness. React Navigation
 * calls it with `{ focused, color, size }` on every focus change; `color` is the per-tab active or
 * inactive tint already resolved by `screenOptions`/`options` (never hard-coded here), and the size
 * is always `size.icon.tab` from tokens — the `size` React Navigation offers is ignored so this
 * never drifts from the token. At rest a tab shows `glyph.tab[tab].inactive`; the focused tab swaps
 * to the filled `active` cut — shape as well as colour, per the token's own doc comment.
 */
export function tabBarIcon(tab: TabName) {
  return function TabIcon({ focused, color }: { focused: boolean; color: ColorValue; size: number }) {
    const name = focused ? glyph.tab[tab].active : glyph.tab[tab].inactive;
    // No accessibility props of its own: React Navigation's tab button already groups this icon
    // with its visible label under one accessible element (`options.title`), so a separate label
    // here would only double-announce it.
    return <Ionicons name={name} size={size.icon.tab} color={color} testID={`tab-icon-${tab}`} />;
  };
}

/**
 * Chrome shared by every tab, per the tech-lead hand-off on #20: no blur (that needs `expo-blur`,
 * an undiscussed native dependency — the translucent fill alone reads fine without it) and the
 * light theme's 0.92 opacity, which lives in `color.tabBar.bg` and is never repeated here as a
 * literal. A pure function so a test can assert on it without mounting the router.
 */
export function sharedTabBarOptions(color: ColorTokens) {
  return {
    headerShown: false,
    tabBarStyle: {
      backgroundColor: color.tabBar.bg,
      borderTopColor: color.tabBar.border,
      height: size.tabBar.height,
    },
    tabBarInactiveTintColor: color.tabBar.inactiveText,
    tabBarLabelStyle: {
      fontFamily: type.tabLabel.fontFamily,
      fontSize: type.tabLabel.fontSize,
      letterSpacing: type.tabLabel.letterSpacing,
    },
  } as const;
}

export default function TabLayout(): React.JSX.Element {
  const { color } = useTheme();

  return (
    <Tabs screenOptions={sharedTabBarOptions(color)}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarActiveTintColor: color.tabBar.todayActiveText,
          tabBarIcon: tabBarIcon('today'),
        }}
      />
      <Tabs.Screen
        name="workout"
        options={{
          title: 'Workout',
          tabBarActiveTintColor: color.tabBar.workoutActiveText,
          tabBarIcon: tabBarIcon('workout'),
        }}
      />
      <Tabs.Screen
        name="charts"
        options={{
          title: 'Charts',
          tabBarActiveTintColor: color.tabBar.chartsActiveText,
          tabBarIcon: tabBarIcon('charts'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarActiveTintColor: color.tabBar.settingsActiveText,
          tabBarIcon: tabBarIcon('settings'),
        }}
      />
    </Tabs>
  );
}
