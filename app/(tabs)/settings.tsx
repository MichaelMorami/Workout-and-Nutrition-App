import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
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
 * The Settings tab. Issue #44 (kcal/protein targets) adds the "TARGETS" group this screen is
 * still missing — this slice (issue #43) is the "LIBRARY" group: the only way into the food
 * catalogue and saved-meal management, per `<MealList>`'s own module note that those lists are
 * reached "via Settings, not the Today screen's main loop". Deliberately no more than that: this
 * is a navigation entry point, not a redesign of the whole screen ahead of #44.
 */
export default function SettingsScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const { color } = theme;

  return (
    <ScrollView style={{ backgroundColor: color.bg.canvas }} contentContainerStyle={styles.content}>
      <Text style={textStyle(type.micro, color.settings.groupTitleText)}>Library</Text>
      <View style={[styles.group, { borderRadius: radius.lg, backgroundColor: color.settings.groupBg }]}>
        <SettingsRow label="Foods" onPress={() => router.push('/foods')} theme={theme} testID="settings-foods" />
        <View style={[styles.divider, { backgroundColor: color.line.hairline }]} />
        <SettingsRow label="Meals" onPress={() => router.push('/meals')} theme={theme} testID="settings-meals" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[9],
    paddingBottom: space[9],
    gap: space[3],
  },
  group: {
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
