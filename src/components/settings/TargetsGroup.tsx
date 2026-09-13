/**
 * `<TargetsGroup>` — issue #44's "TARGETS" section of the Settings screen: the only place
 * `kcalTarget`/`proteinTarget` (`getSettings`/`updateSettings`, #35/#36) are ever changed. Two
 * disclosure rows open one shared sheet with a `<Stepper>` per target — "never make the user type a
 * number a stepper could set" applies here exactly as it does on `<FoodForm>`.
 *
 * NO SAVE BUTTON — EACH STEPPER TAP IS THE WRITE. Unlike `<FoodForm>` (a multi-field creation flow
 * with nothing sane to commit mid-edit), a target is one number with an always-valid current value:
 * every +/- tap calls `updateSettings` immediately and updates local state optimistically, the same
 * "instant" commit `<PortionSheet>`'s presets use. The sheet's "Done" only dismisses; there is
 * nothing left to persist when it is pressed.
 *
 * DAY-ONE "SET". `getSettings` returns `DEFAULT_SETTINGS` with `isDefault: true` before this user
 * has ever written a settings row — both rows show "Set" instead of a number so day one does not
 * read as "you are already at 2,000 kcal", per the issue's acceptance criteria. The instant either
 * target is changed, `updateSettings` clears `isDefault` for the whole row (it is one flag on one
 * singleton settings row, not per-field) and both rows show their real numbers together.
 *
 * NO WEIGHT/LENGTH HERE — NO #39 FORMATTER CALL. kcal and grams-of-protein are food quantities, not
 * a weight or a length in `docs/decisions.md`'s sense (body weight in kg, body measurements in cm);
 * `formatWeightKg`/`formatLengthCm` do not apply to this screen's two fields. Nothing on this
 * component renders a weight or a length.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { type SettingsInput, type SettingsView, getSettings, updateSettings, type VitalsDb } from '../../db';
import { deviceWhen } from '../../hooks/deviceWhen';
import { radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { Stepper } from '../food-form/Stepper';

export type TargetsGroupProps = {
  readonly db: VitalsDb;
  readonly theme: Theme;
  readonly locale?: string;
  readonly testID?: string;
};

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

function kcalLabel(value: number, locale: string | undefined): string {
  return `${Math.round(value).toLocaleString(locale)} kcal`;
}

function proteinLabel(value: number, locale: string | undefined): string {
  return `${Math.round(value).toLocaleString(locale)} g`;
}

function TargetRow({
  label,
  valueText,
  valueColor,
  theme,
  onPress,
  testID,
}: {
  label: string;
  valueText: string;
  valueColor: string;
  theme: Theme;
  onPress: () => void;
  testID: string;
}) {
  const { settings } = theme.color;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${valueText === 'Set' ? 'not set' : valueText}`}
      style={({ pressed }) => [styles.row, { minHeight: size.row.settingsHit, backgroundColor: pressed ? settings.rowBgPress : settings.groupBg }]}
    >
      <Text style={[textStyle(type.body, settings.labelText), styles.rowLabel]}>{label}</Text>
      <Text testID={`${testID}-value`} style={textStyle(type.numericRow, valueColor)}>
        {valueText}
      </Text>
      <Text style={textStyle(type.body, settings.chevronIcon)} accessibilityElementsHidden>
        {'›'}
      </Text>
    </Pressable>
  );
}

/** The shared sheet behind both rows — a kcal stepper and a protein stepper, each one committing
 * through `onChangeKcal`/`onChangeProtein` the instant it moves. */
function TargetsSheet({
  visible,
  kcalTarget,
  proteinTarget,
  onChangeKcal,
  onChangeProtein,
  onClose,
  theme,
  testID,
}: {
  visible: boolean;
  kcalTarget: number;
  proteinTarget: number;
  onChangeKcal: (value: number) => void;
  onChangeProtein: (value: number) => void;
  onClose: () => void;
  theme: Theme;
  testID: string;
}) {
  const { bg, line, text, button } = theme.color;
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} testID={testID}>
      <Pressable
        testID={`${testID}-scrim`}
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={[styles.scrim, { backgroundColor: bg.scrim }]}
      />
      <View style={[styles.sheet, { backgroundColor: bg.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, boxShadow: theme.shadow.sheet }]}>
        <View style={[styles.grabber, { backgroundColor: line.strong, borderRadius: radius.pill }]} />
        <Text style={textStyle(type.title, text.primary)}>Targets</Text>

        <Stepper
          label="Daily calories"
          value={kcalTarget}
          step={50}
          max={10000}
          unit="kcal"
          onChange={onChangeKcal}
          theme={theme}
          testID={`${testID}-kcal`}
        />
        <Stepper
          label="Daily protein"
          value={proteinTarget}
          step={5}
          max={500}
          unit="g"
          onChange={onChangeProtein}
          theme={theme}
          testID={`${testID}-protein`}
        />

        <Pressable
          testID={`${testID}-done`}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Done"
          style={[styles.done, { minHeight: size.button.primaryHit, borderRadius: radius.md, backgroundColor: button.kcalBg }]}
        >
          <Text style={textStyle(type.button, button.kcalText)}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export function TargetsGroup({ db, theme, locale, testID = 'targets' }: TargetsGroupProps) {
  const { data, settings } = theme.color;
  const [current, setCurrent] = useState<SettingsView>(() => getSettings(db));
  const [sheetOpen, setSheetOpen] = useState(false);

  const commit = (patch: Partial<SettingsInput>): void => {
    setCurrent(updateSettings(db, { at: deviceWhen().at, ...patch }));
  };

  const kcalText = current.isDefault ? 'Set' : kcalLabel(current.kcalTarget, locale);
  const proteinText = current.isDefault ? 'Set' : proteinLabel(current.proteinTarget, locale);

  return (
    <View testID={testID} style={styles.group}>
      <Text style={textStyle(type.micro, settings.groupTitleText)}>Targets</Text>
      <View style={[styles.card, { borderRadius: radius.lg, backgroundColor: settings.groupBg }]}>
        <TargetRow label="Daily calories" valueText={kcalText} valueColor={data.kcal} theme={theme} onPress={() => setSheetOpen(true)} testID={`${testID}-kcal`} />
        <View style={[styles.divider, { backgroundColor: theme.color.line.hairline }]} />
        <TargetRow label="Daily protein" valueText={proteinText} valueColor={data.protein} theme={theme} onPress={() => setSheetOpen(true)} testID={`${testID}-protein`} />
      </View>
      <Text style={textStyle(type.label, settings.noteText)}>
        Carbs and fat are deliberately not tracked. Two numbers you will actually hit beat four you will not.
      </Text>

      <TargetsSheet
        visible={sheetOpen}
        kcalTarget={current.kcalTarget}
        proteinTarget={current.proteinTarget}
        onChangeKcal={(value) => commit({ kcalTarget: value })}
        onChangeProtein={(value) => commit({ proteinTarget: value })}
        onClose={() => setSheetOpen(false)}
        theme={theme}
        testID={`${testID}-sheet`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: space[2],
  },
  card: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[6],
  },
  rowLabel: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  scrim: {
    flex: 1,
  },
  sheet: {
    paddingHorizontal: space[7],
    paddingTop: space[4],
    paddingBottom: space[9],
    gap: space[6],
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
  },
  done: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
