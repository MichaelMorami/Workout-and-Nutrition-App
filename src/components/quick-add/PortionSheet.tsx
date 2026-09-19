/**
 * `<PortionSheet>` — the long-press sheet (issue #21, `docs/decisions.md` §2): normalised presets by
 * default, an "any amount" Exact control one tap away. Neither mode has a save button of its own
 * separate from "Log" — Presets logs the instant a step is tapped, Exact only because a drag must
 * not commit on release by accident (the design canvas's own reasoning for why Exact alone gets a
 * button).
 *
 * SCOPE CUT — ONE UNIT, NOT THREE. The canvas mocks a unit chooser ("1 pot · 150g" / "100g" /
 * "1 tbsp · 15g") for foods with more than one normalised unit. `FoodCandidate` carries exactly one
 * `servingLabel`/`servingGrams` pair — the data model has nowhere to store a second unit — so this
 * sheet always presets multiples of THE food's one serving (½, 1, 1½, 2, 3), which is what
 * `portionSheet.stepBg` and friends are actually sized for. A unit chooser is a data-model change,
 * not a UI one; raised as a follow-up, not guessed at here.
 *
 * ALWAYS A SERVINGS MULTIPLE, EVEN IN EXACT MODE. `onLog` reports a plain `portions` number in every
 * case — Presets multiplies the food's serving directly; Exact (for a food with `servingGrams`) is a
 * grams slider converted back to servings on Log, so `QuickAddGrid` has one `logFresh` path instead
 * of two. A meal has no grams at all, so its Exact control is a servings stepper in 0.5 steps
 * instead of a slider — still no typing, just a coarser instrument for a candidate the data model
 * cannot weigh.
 *
 * NO NEW NATIVE DEPENDENCY. The slider track is `PanResponder` (React Native core) driving plain
 * component state, not `@react-native-community/slider` — CLAUDE.md requires raising a native
 * dependency in the issue before adding one, and this need not wait on that. The sheet's own
 * presentation uses `Modal`'s built-in `animationType="slide"` for the same reason: `sheetIn`/
 * `sheetOut` describe a spring worth revisiting once a native bottom-sheet dependency is on the
 * table, but are not implementable from RN core alone without reaching for one now.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type TextStyle,
} from 'react-native';
import type { Candidate } from '../../db';
import { formatGrams } from '../format/food';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { haptics, interaction, radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';

/**
 * The Servings strip's step list (issue #91) — a single function so a later per-serving-type rule
 * (issue #93) has exactly one place to plug into instead of every call site guessing its own list.
 * Default: half-servings from ½ up to 8, the same list for a food and a meal candidate until #93
 * varies it by `candidate`. Built from `n / 2` rather than repeated `+= 0.5` so every entry is an
 * exact binary float (halves of an integer always are) — no drift to round away.
 */
export function servingSteps(_candidate: Candidate): readonly number[] {
  const steps: number[] = [];
  for (let half = 1; half <= 16; half += 1) steps.push(half / 2);
  return steps;
}

/** "½", "1", "1½", "2" … the step's own value and nothing else — issue #91 drops the per-step kcal
 * line, so the Servings strip's buttons are value-only. */
function servingStepLabel(multiple: number): string {
  const whole = Math.trunc(multiple);
  const isHalf = multiple - whole === 0.5;
  if (!isHalf) return `${whole}`;
  return whole === 0 ? '½' : `${whole}½`;
}

/** The step in `steps` nearest `target` — how the strip picks what to scroll to and mark selected:
 * the usual ×1 serving on a fresh log, or the amount already logged when editing (issue #91). */
function nearestStep(steps: readonly number[], target: number): number {
  return steps.reduce((closest, step) => (Math.abs(step - target) < Math.abs(closest - target) ? step : closest), steps[0] ?? target);
}

export type PortionSheetProps = {
  /** `null` closes the sheet — there is deliberately no separate `visible` flag to fall out of sync with. */
  readonly candidate: Candidate | null;
  readonly theme: Theme;
  /** Formatting locale, forwarded to every figure. Defaults to the device's. */
  readonly locale?: string;
  /** A step, or Exact's Log button — always a servings multiple of the candidate's own serving. */
  readonly onLog: (candidate: Candidate, portions: number) => void;
  readonly onClose: () => void;
  /**
   * Opens directly in this mode. Defaults to `'presets'` — a fresh long-press from the grid, where
   * "the usual serving" is the useful starting guess (issue #21). Issue #42's day-log row edit
   * passes `'exact'` with `initialPortions`, so correcting an already-logged amount starts from
   * what was actually logged instead of resetting to the food's usual serving — "pre-fill
   * everything that can be predicted" applies to editing exactly as it does to a fresh log.
   */
  readonly initialMode?: 'presets' | 'exact';
  /** The starting amount, as a servings multiple of the candidate's own serving. Defaults to 1
   * (fresh logging's "usual serving" start). Exact mode pre-fills its slider/stepper from it; the
   * Servings strip (issue #91) uses it only to pick which step it opens scrolled to and marked
   * selected — editing an already-logged amount lands on that step instead of resetting to ×1. */
  readonly initialPortions?: number;
  /**
   * `'modal'` (default) presents the sheet in its own native `Modal`. `'overlay'` draws the same
   * scrim and sheet as a full-bleed view instead, for a host that is itself already inside a
   * `Modal` — iOS presents one `Modal` from a given view controller at a time, so a second one
   * mounted beside `<SearchSheet>`'s never appears (issue #79).
   */
  readonly presentation?: 'modal' | 'overlay';
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

/**
 * The subtitle's serving phrase (issue #90) — "1 pot serving", "100 g serving" for a food; "meal"
 * for a meal, since the figures above it are already the meal's one-portion totals and an item
 * count (`QuickAddTile`'s own label) has nothing to do with "per what". Guards against a doubled
 * "serving serving" when the label already ends in the word — `entry-candidate.ts`'s `'1 serving'`
 * fallback for a pre-#86 log row with no stored label is exactly that case.
 */
function servingUnitLabel(candidate: Candidate): string {
  if (candidate.kind === 'meal') return 'meal';
  const label = candidate.servingLabel;
  return /\bserving$/i.test(label.trim()) ? label : `${label} serving`;
}

/** Nearest 0.5-serving multiple to `portions`, for the Exact grams slider's detents. */
function nearestHalfServing(portions: number): number {
  return Math.round(portions * 2) / 2;
}

function Segmented({
  theme,
  mode,
  onChange,
  testID,
}: {
  theme: Theme;
  mode: 'presets' | 'exact';
  onChange: (mode: 'presets' | 'exact') => void;
  testID: string;
}) {
  const { segmented } = theme.color;
  return (
    <View
      testID={testID}
      style={[styles.segmentTrack, { backgroundColor: segmented.trackBg, borderRadius: radius.sm, height: size.portionSheet.segmentHit }]}
    >
      {(['presets', 'exact'] as const).map((option) => {
        const selected = option === mode;
        return (
          <Pressable
            key={option}
            testID={`${testID}-${option}`}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option === 'presets' ? 'Servings' : 'Exact'}
            style={[
              styles.segmentOption,
              {
                height: size.portionSheet.segmentPainted,
                borderRadius: radius.sm,
                backgroundColor: selected ? segmented.selectedBg : 'transparent',
                borderWidth: selected ? StyleSheet.hairlineWidth : 0,
                borderColor: segmented.selectedBorder,
              },
            ]}
          >
            <Text style={textStyle(selected ? type.controlSelected : type.control, selected ? segmented.selectedText : segmented.optionText)}>
              {option === 'presets' ? 'Servings' : 'Exact'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The Servings strip (issue #91) — a horizontal scroll of value-only step buttons, not a fixed
 * five-across row: `servingSteps` now goes up to 8, more than a sheet-width row could ever hold
 * without shrinking the touch targets below `size.portionSheet.stepHit`. Only this strip scrolls —
 * `ScrollView` is sized by its own content, so the sheet around it never grows.
 *
 * Opens scrolled so the nearest step to `initialPortions` (the usual ×1 serving fresh, or the
 * already-logged amount when editing) sits at the strip's leading edge via `contentOffset`, which
 * — unlike an imperative `scrollTo` — takes effect on the very first frame, so there's no visible
 * jump from "0" to the anchor after mount. Whatever steps follow past the visible width peek at the
 * trailing edge for free: the strip's own width is the sheet's content width, no token of its own
 * needed for that (a peek inset would only matter if a device's width happened to divide evenly by
 * the step pitch — worth a dedicated token from design-lead if that ever needs guaranteeing).
 */
function ServingSteps({
  candidate,
  theme,
  locale,
  onPick,
  initialPortions = 1,
  testID,
}: {
  candidate: Candidate;
  theme: Theme;
  locale?: string;
  onPick: (portions: number) => void;
  initialPortions?: number;
  testID: string;
}) {
  const { portionSheet } = theme.color;
  const steps = servingSteps(candidate);
  const anchor = nearestStep(steps, initialPortions);
  const anchorIndex = Math.max(0, steps.indexOf(anchor));
  const pitch = size.portionSheet.stepWidth + space[2];

  return (
    <ScrollView
      testID={`${testID}-steps`}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentOffset={{ x: anchorIndex * pitch, y: 0 }}
      contentContainerStyle={styles.stepsRow}
    >
      {steps.map((multiple) => {
        const selected = multiple === anchor;
        const kcal = Math.round(candidate.kcal * multiple).toLocaleString(locale);
        return (
          <Pressable
            key={multiple}
            testID={`${testID}-step-${multiple}`}
            onPress={() => onPick(multiple)}
            accessibilityRole="button"
            accessibilityLabel={`Log ${servingStepLabel(multiple)} times the usual serving, ${kcal} kilocalories`}
            style={[
              styles.step,
              {
                width: size.portionSheet.stepWidth,
                minHeight: size.portionSheet.stepHit,
                borderRadius: radius.md,
                backgroundColor: selected ? portionSheet.stepSelectedBg : portionSheet.stepBg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: portionSheet.stepBorder,
              },
            ]}
          >
            <Text style={textStyle(type.numericLg, selected ? portionSheet.stepSelectedText : portionSheet.stepText)}>
              {servingStepLabel(multiple)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function NudgeButton({
  theme,
  label,
  onPress,
  testID,
}: {
  theme: Theme;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { slider } = theme.color;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label === '−' ? 'Decrease amount' : 'Increase amount'}
      style={[
        styles.nudge,
        {
          width: size.slider.nudgeWidth,
          minHeight: size.slider.nudgeHit,
          borderRadius: radius.md,
          backgroundColor: slider.nudgeBg,
        },
      ]}
    >
      <Text style={textStyle(type.numericLg, slider.nudgeIcon)}>{label}</Text>
    </Pressable>
  );
}

/** The Exact slider track — `PanResponder`-driven, `value` and `max` in the same unit (grams for a
 * food, servings for a meal). Detents fall at every half of `unitSize` (one serving), snapped within
 * `interaction.sliderDetentSnapG` of a detent with `haptics.sliderDetent`.
 *
 * `max` is `ExactControl`'s current *range* (issue #92), not a hard cap — it grows there as the value
 * passes it, and this component only ever reads whatever `max` it is handed, so a grown range takes
 * effect the moment it's re-rendered with. There is no ceiling logic left in here to reset.
 *
 * ISSUE #92 FIX (the finger-catch jump). `onPanResponderMove`/`Release` still read
 * `event.nativeEvent.locationX` relative to *this* outer view — the bug was that `trackFill` (and now
 * the thumb) could themselves become the touch target once the finger was over them, making
 * `locationX` jump to being relative to that child's own origin instead. Both are `pointerEvents="none"`
 * below, which removes them from hit-testing entirely, so this outer view is always the target and
 * `locationX` stays in one consistent frame for the whole gesture — no ref, no `gestureState.dx` math
 * needed. The thumb hit area (`size.slider.thumbHit`, 44pt) is this same outer view, so a drag can
 * start from the thumb or anywhere else on the track.
 */
function SliderTrack({
  theme,
  value,
  max,
  unitSize,
  onChange,
  onSnap,
  testID,
}: {
  theme: Theme;
  value: number;
  max: number;
  unitSize: number;
  onChange: (next: number) => void;
  onSnap: () => void;
  testID: string;
}) {
  const { slider } = theme.color;
  // Plain state, not a ref: the `PanResponder` handlers below are functions created during render
  // and only invoked later by the responder system, but the lint rule that catches stray ref reads
  // during render cannot tell the two apart — state sidesteps the question entirely.
  const [trackWidth, setTrackWidth] = useState(0);
  const detentStep = unitSize / 2;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (event: GestureResponderEvent) => {
          if (trackWidth <= 0) return;
          const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / trackWidth));
          onChange(Math.round(ratio * max));
        },
        onPanResponderRelease: (event: GestureResponderEvent) => {
          if (trackWidth <= 0) return;
          const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / trackWidth));
          const raw = ratio * max;
          const nearestDetent = Math.round(raw / detentStep) * detentStep;
          if (Math.abs(raw - nearestDetent) <= interaction.sliderDetentSnapG) {
            onSnap();
            onChange(nearestDetent);
          } else {
            onChange(Math.round(raw));
          }
        },
      }),
    // `onChange`/`onSnap` are `useCallback`-stabilised by `ExactControl`, so this only actually
    // rebuilds on the rare events that change `max` (range growth) or `trackWidth` (first layout) —
    // never once per drag-move the way a fresh inline arrow would force it to.
    [max, detentStep, trackWidth, onChange, onSnap],
  );

  const handleLayout = (event: LayoutChangeEvent): void => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const fillPct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const thumbDiameter = size.slider.thumb;
  const thumbLeft =
    trackWidth > 0 ? Math.min(trackWidth - thumbDiameter, Math.max(0, (fillPct / 100) * trackWidth - thumbDiameter / 2)) : 0;

  return (
    <View
      testID={testID}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel="Amount"
      accessibilityValue={{ min: 0, max: Math.round(max), now: Math.round(value) }}
      style={[styles.trackHitArea, { minHeight: size.slider.thumbHit }]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.track,
          {
            top: (size.slider.thumbHit - size.slider.track) / 2,
            height: size.slider.track,
            borderRadius: radius.pill,
            backgroundColor: slider.track,
          },
        ]}
      >
        <View style={[styles.trackFill, { width: `${fillPct}%`, borderRadius: radius.pill, backgroundColor: slider.fill }]} />
      </View>
      <View
        testID={`${testID}-thumb`}
        pointerEvents="none"
        style={[
          styles.thumb,
          {
            top: (size.slider.thumbHit - thumbDiameter) / 2,
            left: thumbLeft,
            width: thumbDiameter,
            height: thumbDiameter,
            borderRadius: radius.pill,
            backgroundColor: slider.thumb,
            borderWidth: size.slider.thumbRing,
            borderColor: slider.thumbRing,
            boxShadow: theme.shadow.sliderThumb,
          },
        ]}
      />
    </View>
  );
}

/** Grows `prevRange` to fit `next` in whole `baseRange`-sized steps, never shrinks it. Issue #92: the
 * slider has no hard cap — `ExactControl` starts at `baseRange` (today, `interaction.sliderMaxServings`
 * worth of the food's serving; 8 servings per #91 once that lands) and this is what lets the value and
 * the visible range keep climbing past it instead of the old clamp-to-max jump-down. */
function growRangeTo(next: number, prevRange: number, baseRange: number): number {
  if (next <= prevRange) return prevRange;
  const chunks = Math.ceil(next / baseRange);
  return Math.max(prevRange, chunks * baseRange);
}

function ExactControl({
  candidate,
  theme,
  locale,
  onLog,
  testID,
  initialPortions = 1,
}: {
  candidate: Candidate;
  theme: Theme;
  locale?: string;
  onLog: (portions: number) => void;
  testID: string;
  initialPortions?: number;
}) {
  const { portionSheet } = theme.color;
  const fireHaptic = useHapticFeedback();
  const isGrams = candidate.kind === 'food' && candidate.servingGrams != null;
  const unitSize = isGrams ? (candidate as { servingGrams: number }).servingGrams : 1;
  // The slider's starting range — not a cap. See `growRangeTo`.
  const baseRange = unitSize * interaction.sliderMaxServings;
  const nudgeStep = isGrams ? interaction.sliderNudgeG : 0.5;

  const [amount, setAmount] = useState<number>(unitSize * initialPortions);
  // A log-entry edit (issue #42) can open already above `baseRange` — start the range grown to fit
  // rather than clamping the pre-filled amount down on first paint.
  const [rangeMax, setRangeMax] = useState<number>(() => Math.max(baseRange, unitSize * initialPortions));

  // Both callbacks are `useCallback`-stabilised (deps only on `baseRange`, constant for the life of
  // this candidate's sheet) so `SliderTrack`'s `PanResponder` isn't rebuilt on every value change —
  // only when the range actually grows. Functional `setState` throughout means neither one closes
  // over a stale `amount`/`rangeMax`, so no ref is needed either (see `SliderTrack`'s own note on why
  // this codebase avoids refs inside `PanResponder` handlers).
  const applyAbsolute = useCallback(
    (next: number) => {
      const bounded = Math.max(0, next);
      setRangeMax((prevRange) => growRangeTo(bounded, prevRange, baseRange));
      setAmount(bounded);
    },
    [baseRange],
  );
  const applyDelta = useCallback(
    (delta: number) => {
      setAmount((prev) => {
        const bounded = Math.max(0, prev + delta);
        setRangeMax((prevRange) => growRangeTo(bounded, prevRange, baseRange));
        return bounded;
      });
    },
    [baseRange],
  );
  const onSnap = useCallback(() => fireHaptic(haptics.sliderDetent), [fireHaptic]);

  const portions = amount / unitSize;
  const kcalText = Math.round(candidate.kcal * portions).toLocaleString(locale);
  const proteinText = formatGrams(candidate.protein * portions, locale);
  const readout = isGrams ? formatGrams(amount, locale) : `×${nearestHalfServing(portions)}`;
  const logLabel = isGrams ? `Log ${formatGrams(amount, locale)}` : `Log ×${nearestHalfServing(portions)}`;

  return (
    <View testID={testID}>
      <Text testID={`${testID}-readout`} style={textStyle(type.portionReadout, portionSheet.readoutText)}>
        {readout}
      </Text>
      <View style={styles.figuresRow}>
        <Text style={textStyle(type.numericLg, portionSheet.kcalText)}>{`${kcalText} kcal`}</Text>
        <Text style={textStyle(type.numericLg, portionSheet.proteinText)}>{`${proteinText} protein`}</Text>
      </View>

      <View style={styles.sliderRow}>
        <NudgeButton theme={theme} label="−" onPress={() => applyDelta(-nudgeStep)} testID={`${testID}-nudge-down`} />
        <View style={styles.sliderTrackWrap}>
          <SliderTrack
            theme={theme}
            value={amount}
            max={rangeMax}
            unitSize={unitSize}
            onChange={applyAbsolute}
            onSnap={onSnap}
            testID={`${testID}-track`}
          />
        </View>
        <NudgeButton theme={theme} label="+" onPress={() => applyDelta(nudgeStep)} testID={`${testID}-nudge-up`} />
      </View>

      <Pressable
        testID={`${testID}-log`}
        onPress={() => onLog(isGrams ? portions : nearestHalfServing(portions))}
        accessibilityRole="button"
        accessibilityLabel={logLabel}
        style={[
          styles.logButton,
          { minHeight: size.portionSheet.logButtonHit, borderRadius: radius.md, backgroundColor: portionSheet.logButtonBg },
        ]}
      >
        <Text style={textStyle(type.button, portionSheet.logButtonText)}>{logLabel}</Text>
      </Pressable>
    </View>
  );
}

export function PortionSheet({
  candidate,
  theme,
  locale,
  onLog,
  onClose,
  initialMode = 'presets',
  initialPortions = 1,
  presentation = 'modal',
  testID = 'portion-sheet',
}: PortionSheetProps) {
  const { bg, portionSheet } = theme.color;
  const [mode, setMode] = useState<'presets' | 'exact'>(initialMode);

  // Exact's slider position is per-candidate — reset the mode back to `initialMode` each time a
  // different tile (or log-entry edit) opens the sheet, so the last food's Exact drag never leaks
  // onto the next.
  const openKey = candidate ? `${candidate.kind}-${candidate.id}` : null;
  const [lastOpenKey, setLastOpenKey] = useState<string | null>(null);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (mode !== initialMode) setMode(initialMode);
  }

  if (!candidate) return null;

  const handlePick = (portions: number): void => {
    onLog(candidate, portions);
    onClose();
  };

  const kcalText = Math.round(candidate.kcal).toLocaleString(locale);
  const proteinText = formatGrams(candidate.protein, locale);
  const unit = servingUnitLabel(candidate);

  const content = (
    <>
      <Pressable
        testID={`${testID}-scrim`}
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={onClose}
        style={[styles.scrim, { backgroundColor: bg.scrim }]}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: portionSheet.bg,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            boxShadow: theme.shadow.sheet,
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: portionSheet.grabber, borderRadius: radius.pill }]} />
        <Text testID={`${testID}-title`} style={textStyle(type.title, portionSheet.titleText)}>
          {candidate.name}
        </Text>
        <Text testID={`${testID}-subtitle`} style={textStyle(type.label, portionSheet.metaText)}>
          {`${kcalText} kcal · ${proteinText} protein per ${unit}`}
        </Text>

        <Segmented theme={theme} mode={mode} onChange={setMode} testID={`${testID}-mode`} />

        {mode === 'presets' ? (
          <ServingSteps
            candidate={candidate}
            theme={theme}
            locale={locale}
            onPick={handlePick}
            initialPortions={initialPortions}
            testID={testID}
          />
        ) : (
          <ExactControl
            candidate={candidate}
            theme={theme}
            locale={locale}
            onLog={handlePick}
            initialPortions={initialPortions}
            testID={`${testID}-exact`}
          />
        )}
      </View>
    </>
  );

  return presentation === 'overlay' ? (
    <View testID={testID} style={StyleSheet.absoluteFill}>
      {content}
    </View>
  ) : (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} testID={testID}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
  },
  sheet: {
    paddingHorizontal: space[6],
    paddingTop: space[3],
    paddingBottom: space[7],
    gap: space[4],
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
  },
  segmentTrack: {
    flexDirection: 'row',
    padding: 2,
    gap: space[1],
  },
  segmentOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsRow: {
    flexDirection: 'row',
    gap: space[2],
  },
  step: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  figuresRow: {
    flexDirection: 'row',
    gap: space[4],
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  sliderTrackWrap: {
    flex: 1,
  },
  trackHitArea: {
    width: '100%',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  trackFill: {
    height: '100%',
  },
  thumb: {
    position: 'absolute',
  },
  nudge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
