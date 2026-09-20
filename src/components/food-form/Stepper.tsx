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
 * and accelerates to a ten-step jump after about 1.4 s held in total (the repeat delay plus
 * `REPEAT_ACCELERATE_AFTER_MS`, not `REPEAT_ACCELERATE_AFTER_MS` alone — see that constant's own
 * comment), so a big change is one hold, not dozens of taps.
 *
 * Typed entry is exact — never rounded to `step`'s grid — and clamps to `[min, max]` on commit; an
 * empty or unparseable entry reverts to the value that was showing before the tap, silently, no
 * error text (this is text entry recovering from a typo, not form validation). The tap-to-type half
 * of this is `useEditableNumber` (`src/hooks`), factored out on purpose: issue #94 reuses it for the
 * portion sheet's Exact-mode readout without taking a dependency on this component's −/+ buttons.
 *
 * SCOPE RULING (client, PR #184 review): tap-to-type and hold-to-accelerate apply everywhere this
 * component is used — `TargetsGroup` and `MealForm` included — but the food form's own step-size
 * change (5 -> 1 / 0.1, see `FoodForm.tsx`) is food-form only; `TargetsGroup`'s 50/5 and `MealForm`'s
 * 0.5 stay exactly as they were. That distinction is each caller's own `step` prop, not this
 * component's to make.
 *
 * Both buttons default to `size.stepper.buttonWidth` × `size.stepper.buttonHit` (56×48), comfortably
 * over `size.tapTargetMin` (44), the same dimensions `PortionSheet.tsx`'s `NudgeButton` already uses
 * for the same shape of control — this is that pattern generalised with a label and a configurable
 * step/min/max instead of being pinned to grams. The value well keeps that same height as its own
 * tap target once it doubles as the "type it" button. ISSUE #89: `buttonWidth`/`buttonHit`/`gap`/
 * `valueTextColor` are optional overrides, still ≥ `size.tapTargetMin` for every caller today —
 * the food form's own amount/kcal/protein steppers are narrower and tighter
 * (`size.foodForm.nutritionButtonWidth`/`nutritionHit`/`stepperGap`) to fit two side by side on a
 * 375 pt phone, and the kcal/protein wells recolour their figure (`foodForm.kcalValueText`/
 * `proteinValueText`). `TargetsGroup` and `MealForm` pass none of these and keep the defaults above.
 *
 * TOKEN GAP (flagged for design-lead, not filled in here per this issue's scope — see the PR body).
 * `interaction.stepperRepeatDelayMs` already covers the initial hold-to-repeat delay, but there is
 * still no token for the steady-state repeat interval or the acceleration threshold/multiplier —
 * this file falls back to plain constants for those (documented right where they are used, below).
 * The editable-value emphasis colour is no longer a gap: issue #88 landed `color.foodForm.fieldBorderFocus`
 * / `size.foodForm.fieldBorderWidthFocus`, and `size.foodForm.fieldBorderWidthFocus`'s own doc comment
 * names "a stepper's value well" alongside a text field, so this edit-mode border uses it here too,
 * even though `<Stepper>` itself is shared with `TargetsGroup`/`MealForm` outside the food form.
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
  /** Overrides `size.stepper.buttonWidth` — issue #89's three food-form steppers (amount, kcal,
   * protein) are narrower (`size.foodForm.nutritionButtonWidth`, 44) so two fit side by side on a
   * 375 pt phone; every other caller (`TargetsGroup`, `MealForm`) keeps the wider Workout default. */
  readonly buttonWidth?: number;
  /** Overrides `size.stepper.buttonHit` for both the −/+ buttons and the value well. */
  readonly buttonHit?: number;
  /** Overrides the −, well, + gap (`styles.row`'s default `space[3]`) — the food form's three
   * steppers use the tighter `size.foodForm.stepperGap`. */
  readonly gap?: number;
  /** Overrides `stepper.valueText` for the value well's figure — the food form's kcal and protein
   * steppers colour their value (`foodForm.kcalValueText` / `foodForm.proteinValueText`); every
   * other caller, and this form's own amount stepper, keep the plain default. */
  readonly valueTextColor?: string;
};

/** Steady-state auto-repeat cadence once a hold passes `interaction.stepperRepeatDelayMs` — ~8/s,
 * the rate the issue's approved mechanism names. No token yet; see the header's TOKEN GAP note. */
const REPEAT_INTERVAL_MS = 125;

/** How long *after the repeat interval starts* (i.e. after `interaction.stepperRepeatDelayMs` has
 * already elapsed) the repeat jumps from one step at a time to `REPEAT_ACCELERATED_MULTIPLIER` steps
 * at a time — so acceleration lands at `stepperRepeatDelayMs + REPEAT_ACCELERATE_AFTER_MS` (400 + 1000
 * = ~1.4 s) from the initial press, not the "~1 s held" the issue's mechanism describes loosely — a
 * discrepancy flagged in review (#184) as cosmetic, not a behaviour change. No token yet; see the
 * header's TOKEN GAP note. */
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
  buttonWidth = size.stepper.buttonWidth,
  buttonHit = size.stepper.buttonHit,
  gap = space[3],
  valueTextColor,
}: StepperProps) {
  const { stepper, foodForm } = theme.color;
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
      // New in #87, and — because this function is every step's only path, hold-repeat included —
      // it now fires on a plain single tap too, in `TargetsGroup`/`MealForm` as well as the food
      // form (`<Stepper>` is shared by all three). Disclosed in the PR: this Stepper had no haptic
      // at all before #87; it is now `haptics.sliderDetent`, the same "selection tick" already used
      // for `PortionSheet`'s own nudge buttons, so every − / + tap on this control now confirms the
      // same way one already did there.
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

  // `onPressOut` always runs before `onPress` for the same gesture (React Native's Pressability
  // deactivates, then activates the press, synchronously, in the same call) — so a release that
  // lands back on the button still needs `isHolding` to read `true` when `onTap` below checks it, or
  // its own trailing `onPress` would add an extra step on top of everything the hold already applied.
  // But a release *off* the button skips `onPress` for this gesture entirely (Pressability only
  // fires it when the touch ends inside the hit rect) — nothing would ever clear `isHolding`, and it
  // would wrongly swallow the next, wholly unrelated tap (issue #184 review).
  //
  // A microtask does not thread this needle: `@testing-library/react-native`'s `fireEvent` awaits
  // between simulated events, which flushes microtasks regardless of whether the real gesture they
  // stand in for was one continuous touch or two separate ones — so a microtask clears `isHolding`
  // before the on-target case's own trailing `onPress` ever runs, breaking the very suppression this
  // exists for. A macrotask does not have that problem: nothing here advances fake timers just by
  // being `await`ed, so the deferred clear below stays pending — and `isHolding` stays `true` — for
  // exactly as long as the on-target case's synchronous `onPressOut` -> `onPress` pair takes (however
  // that pair is simulated), firing only once real time has actually since passed.
  const onPressOut = useCallback(() => {
    clearHold();
    if (isHolding.current) {
      setTimeout(() => {
        isHolding.current = false;
      }, 0);
    }
  }, [clearHold]);

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
  const valueColor = valueTextColor ?? stepper.valueText;

  return (
    <View testID={testID} style={styles.root}>
      <Text style={textStyle(type.label, theme.color.text.secondary)}>{label}</Text>
      <View style={[styles.row, { gap }]}>
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
              width: buttonWidth,
              minHeight: buttonHit,
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
              minHeight: buttonHit,
              borderRadius: radius.md,
              backgroundColor: stepper.valueBg,
              borderWidth: editing ? size.foodForm.fieldBorderWidthFocus : 0,
              borderColor: foodForm.fieldBorderFocus,
            },
          ]}
        >
          {editing ? (
            <TextInput
              testID={`${testID}-input`}
              style={textStyle(type.stepperValue, valueColor)}
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
              <Text testID={`${testID}-value`} style={textStyle(type.stepperValue, valueColor)}>
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
              width: buttonWidth,
              minHeight: buttonHit,
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
