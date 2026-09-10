import { Tabs } from 'expo-router';

// Placeholder tab bar. No icons, no colors, no theming — design-lead has not
// signed off on a visual design yet. Wire up real tab bar icons/styling once
// src/theme/tokens.ts exists.
export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="workout" options={{ title: 'Workout' }} />
      <Tabs.Screen name="charts" options={{ title: 'Charts' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
