import { Tabs } from 'expo-router';
import React from 'react';
import { useTheme } from '../../src/hooks/useTheme';
import { size, type, type ColorTokens } from '../../src/theme/tokens';

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
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarActiveTintColor: color.tabBar.todayActiveText }} />
      <Tabs.Screen
        name="workout"
        options={{ title: 'Workout', tabBarActiveTintColor: color.tabBar.workoutActiveText }}
      />
      <Tabs.Screen name="charts" options={{ title: 'Charts', tabBarActiveTintColor: color.tabBar.chartsActiveText }} />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarActiveTintColor: color.tabBar.settingsActiveText }}
      />
    </Tabs>
  );
}
