import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { TargetsGroup } from '../../src/components/settings/TargetsGroup';
import { useDb } from '../../src/hooks/useDb';
import { useTheme } from '../../src/hooks/useTheme';
import { layout, radius, size, space, type, type Theme, type TypeStyle } from '../../src/theme/tokens';

function textStyle(token: TypeStyle, color: string): TextStyle {
  return {
    fontFamily: token.fontFamily,
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    textTransform: token.textTransform,
    color,
  };
}

/** A disclosure row inside a settings group — a label, a chevron, nothing else. Every row here
 * navigates; none of them write anything themselves. */
function SettingsRow({ label, onPress, theme, testID }: { label: string; onPress: () => void; theme: Theme; testID: string }) {
  const { settings } = theme.color;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, { minHeight: size.row.settingsHit, backgroundColor: pressed ? settings.rowBgPress : settings.groupBg }]}
    >
      <Text style={textStyle(type.body, settings.labelText)}>{label}</Text>
      <Text style={textStyle(type.body, settings.chevronIcon)} accessibilityElementsHidden>
        {'›'}
      </Text>
    </Pressable>
  );
}

/**
 * The Settings tab. Issue #44 adds the "TARGETS" group below — kcal and protein targets through
 * `getSettings`/`updateSettings`, `<TargetsGroup>`'s own module note has the tap-doctrine reasoning.
 * Issue #43 built the "LIBRARY" group: the only way into the food catalogue and saved-meal
 * management, per `<MealList>`'s own module note that those lists are reached "via Settings, not
 * the Today screen's main loop".
 *
 * `layout.groupGap` between the two groups, not the tighter `space[3]` #43 shipped with when this
 * screen only had one group — a single group's own top padding read fine alone, but two groups
 * back to back need the token actually named for the job so "Targets" and "Library" don't collide.
 */
export default function SettingsScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const db = useDb();
  const { color } = theme;

  return (
    <ScrollView style={{ backgroundColor: color.bg.canvas }} contentContainerStyle={styles.content}>
      <TargetsGroup db={db} theme={theme} testID="settings-targets" />

      <View style={styles.group}>
        <Text style={textStyle(type.micro, color.settings.groupTitleText)}>Library</Text>
        <View style={[styles.card, { borderRadius: radius.lg, backgroundColor: color.settings.groupBg }]}>
          <SettingsRow label="Foods" onPress={() => router.push('/foods')} theme={theme} testID="settings-foods" />
          <View style={[styles.divider, { backgroundColor: color.line.hairline }]} />
          <SettingsRow label="Meals" onPress={() => router.push('/meals')} theme={theme} testID="settings-meals" />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[9],
    paddingBottom: space[9],
    gap: layout.groupGap,
  },
  group: {
    gap: space[2],
  },
  card: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[6],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
