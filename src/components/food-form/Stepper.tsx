/**
 * `<Stepper>` — the generic − / + control behind issue #43's tap doctrine, updated by issue #87.
 * Used three times on `<FoodForm>` (serving grams, kcal, protein per serving) and once per row on
 * `<MealForm>` (a food's servings in the meal) — one component instead of four bespoke number
 * fields.
 *
 * ISSUE #87 — THE DOCTRINE, OVERTURNED ON ITS OWN TERMS. The client's original brief was "never a
 * keyboard number field": a five-unit grid of +/- taps. The client's own bug report (6.4) showed
 * why that fails at scale — 600 kcal per 100 g of nuts took 120 taps of a 5-step stepper. The
 * ruling this issue landed (`docs/decisions.md`, tech-lead) keeps the doctrine for the *common*
 * case — a small correction is still a tap, never a keyboard — and drops it for the *outlier*: the
 * value well itself is now also a button. **Tap the value** to open `decimal-pad` with the current
 * value selected, so typing replaces it outright (600 kcal = 4 taps, not 120). **Hold +/-** still
 * covers a large change without the keypad: it auto-repeats after `interaction.stepperRepeatDelayMs`
 * and accelerates to a ten-step jump after about a second held, so a big change is one hold, not
 * dozens of taps.
 *
 * Typed entry is exact — never rounded to `step`'s grid — and clamps to `[min, max]` on commit; an
 * empty or unparseable entry reverts to the value that was showing before the tap, silently, no
 * error text (this is text entry recovering from a typo, not form validation). The tap-to-type half
 * of this is `useEditableNumber` (`src/hooks`), factored out on purpose: issue #94 reuses it for the
 * portion sheet's Exact-mode readout without taking a dependency on this component's −/+ buttons.
 *
 * Both buttons are `size.stepper.buttonWidth` × `size.stepper.buttonHit` (56×48), comfortably over
 * `size.tapTargetMin` (44), the same dimensions `PortionSheet.tsx`'s `NudgeButton` already uses for
 * the same shape of control — this is that pattern generalised with a label and a configurable
 * step/min/max instead of being pinned to grams. The value well keeps that same 48 pt height as its
 * own tap target once it doubles as the "type it" button.
 *
 * TOKEN GAP (flagged for design-lead, not filled in here per this issue's scope — see the PR body).
 * `interaction.stepperRepeatDelayMs` already covers the initial hold-to-repeat delay, but there is
 * no token yet for the steady-state repeat interval, the acceleration threshold/multiplier, or a
 * dedicated "editable value" emphasis colour. This file falls back to plain constants for the first
 * three (documented right where they are used, below) and reuses `theme.color.line.strong` — the
 * existing generic emphasis/outline colour ("dashed 'add' affordances, selected-segment outlines,
 * sheet grabbers") — for the edit-mode border, rather than inventing a new semantic token for one
 * component.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import { useEditableNumber } from '../../hooks/useEditableNumber';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { haptics, interaction, radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';

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
   * wants "×1½" instead of "1.5". Resting display only — typing always works in plain numbers. */
  readonly formatValue?: (value: number) => string;
  readonly locale?: string;
  readonly theme: Theme;
  readonly testID?: string;
};

/** Steady-state auto-repeat cadence once a hold passes `interaction.stepperRepeatDelayMs` — ~8/s,
 * the rate the issue's approved mechanism names. No token yet; see the header's TOKEN GAP note. */
const REPEAT_INTERVAL_MS = 125;

/** How long into a hold the repeat jumps from one step at a time to `REPEAT_ACCELERATED_MULTIPLIER`
 * steps at a time — "~1 s held" per the issue. No token yet; see the header's TOKEN GAP note. */
const REPEAT_ACCELERATE_AFTER_MS = 1000;

/** The step multiplier a hold reaches after `REPEAT_ACCELERATE_AFTER_MS`. No token yet; see the
 * header's TOKEN GAP note. */
const REPEAT_ACCELERATED_MULTIPLIER = 10;

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
 * steps are always a clean multiple of themselves (5 kcal, 0.5 servings), never a display glitch.
 * Typed entry never goes through this — it is kept exactly as parsed, then only clamped. */
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
  const { stepper, line } = theme.color;
  const fireHaptic = useHapticFeedback();

  // Tracks the latest committed value so a fast hold's repeated ticks always step from the most
  // recent amount, never a value prop that hasn't re-rendered in from the parent yet — the same
  // reasoning `PortionSheet.tsx`'s `applyDelta` documents for its own optimistic local state.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const applyStep = useCallback(
    (sign: 1 | -1, multiplier: number) => {
      const current = valueRef.current;
      const proposed = round(current + sign * step * multiplier, step);
      const bounded = sign < 0 ? Math.max(proposed, min) : max !== undefined ? Math.min(proposed, max) : proposed;
      if (bounded === current) return;
      valueRef.current = bounded;
      onChange(bounded);
      fireHaptic(haptics.sliderDetent);
    },
    [step, min, max, onChange, fireHaptic],
  );

  // Hold-to-repeat bookkeeping — refs, not state: these are timer handles and an in-progress flag,
  // never rendered, so there is nothing here a re-render should trigger.
  const holdDelay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const accelerateDelay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHolding = useRef(false);

  const clearHold = useCallback(() => {
    if (holdDelay.current) clearTimeout(holdDelay.current);
    if (holdInterval.current) clearInterval(holdInterval.current);
    if (accelerateDelay.current) clearTimeout(accelerateDelay.current);
    holdDelay.current = null;
    holdInterval.current = null;
    accelerateDelay.current = null;
  }, []);

  useEffect(() => clearHold, [clearHold]);

  const onPressIn = useCallback(
    (sign: 1 | -1) => {
      let multiplier = 1;
      holdDelay.current = setTimeout(() => {
        isHolding.current = true;
        applyStep(sign, multiplier);
        holdInterval.current = setInterval(() => applyStep(sign, multiplier), REPEAT_INTERVAL_MS);
        accelerateDelay.current = setTimeout(() => {
          multiplier = REPEAT_ACCELERATED_MULTIPLIER;
        }, REPEAT_ACCELERATE_AFTER_MS);
      }, interaction.stepperRepeatDelayMs);
    },
    [applyStep],
  );

  const onPressOut = useCallback(() => clearHold(), [clearHold]);

  // A quick tap fires `onPressIn` then `onPressOut` well inside `stepperRepeatDelayMs`, so the
  // pending hold timer above never fires and this is the only step applied — one tap, one step, as
  // before. A hold that crossed into auto-repeat already applied its steps through the interval
  // above; `isHolding` stops the release's own trailing `onPress` from adding one more on top.
  const onTap = useCallback(
    (sign: 1 | -1) => {
      if (isHolding.current) {
        isHolding.current = false;
        return;
      }
      applyStep(sign, 1);
    },
    [applyStep],
  );

  const { editing, draft, startEditing, setDraft, commit } = useEditableNumber({
    value,
    min,
    max,
    onCommit: onChange,
  });

  const display = formatValue ? formatValue(value) : Math.round(value).toLocaleString(locale);

  return (
    <View testID={testID} style={styles.root}>
      <Text style={textStyle(type.label, theme.color.text.secondary)}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          testID={`${testID}-decrease`}
          onPressIn={() => onPressIn(-1)}
          onPressOut={onPressOut}
          onPress={() => onTap(-1)}
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

        <Pressable
          testID={`${testID}-value-well`}
          onPress={startEditing}
          disabled={editing}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${label}, currently ${display}`}
          style={[
            styles.valueWell,
            {
              minHeight: size.stepper.buttonHit,
              borderRadius: radius.md,
              backgroundColor: stepper.valueBg,
              borderWidth: editing ? StyleSheet.hairlineWidth : 0,
              borderColor: line.strong,
            },
          ]}
        >
          {editing ? (
            <TextInput
              testID={`${testID}-input`}
              style={textStyle(type.stepperValue, stepper.valueText)}
              value={draft}
              onChangeText={setDraft}
              onBlur={commit}
              onSubmitEditing={commit}
              keyboardType="decimal-pad"
              selectTextOnFocus
              autoFocus
              accessibilityLabel={`${label} value`}
            />
          ) : (
            <>
              <Text testID={`${testID}-value`} style={textStyle(type.stepperValue, stepper.valueText)}>
                {display}
              </Text>
              {unit ? (
                <Text testID={`${testID}-unit`} style={[textStyle(type.unit, stepper.unitText), styles.unit]}>
                  {unit}
                </Text>
              ) : null}
            </>
          )}
        </Pressable>

        <Pressable
          testID={`${testID}-increase`}
          onPressIn={() => onPressIn(1)}
          onPressOut={onPressOut}
          onPress={() => onTap(1)}
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
