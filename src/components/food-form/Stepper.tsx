/**
 * `<Stepper>` — the generic − / + control behind issue #43's tap doctrine: "never make the user
 * type a number a stepper could set." Used three times on `<FoodForm>` (serving grams, kcal,
 * protein per serving) and once per row on `<MealForm>` (a food's servings in the meal) — one
 * component instead of four bespoke number fields.
 *
 * Both buttons are `size.stepper.buttonWidth` × `size.stepper.buttonHit` (56×48), comfortably over
 * `size.tapTargetMin` (44), the same dimensions `PortionSheet.tsx`'s `NudgeButton` already uses for
 * the same shape of control — this is that pattern generalised with a label and a configurable
 * step/min/max instead of being pinned to grams.
 */
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';

export type StepperProps = {
  readonly label: string;
  readonly value: number;
  readonly step: number;
  /** Defaults to 0 — nothing on this form is ever negative (a serving, a kcal, a gram). */
  readonly min?: number;
  readonly max?: number;
  readonly unit?: string;
  readonly onChange: (value: number) => void;
  /** Defaults to a rounded, locale-formatted number. Overridable for a food-servings stepper that
   * wants "×1½" instead of "1.5". */
  readonly formatValue?: (value: number) => string;
  readonly locale?: string;
  readonly theme: Theme;
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

/** Rounds away the floating-point crumbs a repeated `+ step` leaves behind (0.1 + 0.2 territory) —
 * steps are always a clean multiple of themselves (5 kcal, 0.5 servings), never a display glitch. */
function round(value: number, step: number): number {
  const precision = step < 1 ? 100 : 1;
  return Math.round(value * precision) / precision;
}

export function Stepper({
  label,
  value,
  step,
  min = 0,
  max,
  unit,
  onChange,
  formatValue,
  locale,
  theme,
  testID = 'stepper',
}: StepperProps) {
  const { stepper } = theme.color;

  const decrease = (): void => {
    const next = round(value - step, step);
    if (next < min) return;
    onChange(next);
  };

  const increase = (): void => {
    const next = round(value + step, step);
    if (max !== undefined && next > max) return;
    onChange(next);
  };

  const display = formatValue ? formatValue(value) : Math.round(value).toLocaleString(locale);

  return (
    <View testID={testID} style={styles.root}>
      <Text style={textStyle(type.label, theme.color.text.secondary)}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          testID={`${testID}-decrease`}
          onPress={decrease}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          style={[
            styles.button,
            {
              width: size.stepper.buttonWidth,
              minHeight: size.stepper.buttonHit,
              borderRadius: radius.md,
              backgroundColor: stepper.buttonBg,
            },
          ]}
        >
          <Text style={textStyle(type.numericLg, stepper.buttonIcon)}>−</Text>
        </Pressable>

        <View style={[styles.valueWell, { minHeight: size.stepper.buttonHit, borderRadius: radius.md, backgroundColor: stepper.valueBg }]}>
          <Text testID={`${testID}-value`} style={textStyle(type.stepperValue, stepper.valueText)}>
            {display}
          </Text>
          {unit ? (
            <Text testID={`${testID}-unit`} style={[textStyle(type.unit, stepper.unitText), styles.unit]}>
              {unit}
            </Text>
          ) : null}
        </View>

        <Pressable
          testID={`${testID}-increase`}
          onPress={increase}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          style={[
            styles.button,
            {
              width: size.stepper.buttonWidth,
              minHeight: size.stepper.buttonHit,
              borderRadius: radius.md,
              backgroundColor: stepper.buttonBg,
            },
          ]}
        >
          <Text style={textStyle(type.numericLg, stepper.buttonIcon)}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueWell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: space[1],
  },
  unit: {
    marginBottom: 1,
  },
});
