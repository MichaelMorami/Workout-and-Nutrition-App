/**
 * `<FoodForm>` — issue #89's serving picker, replacing #86's always-typed "Serving label" +
 * Weight/Volume toggle pair with a one-tap chip row: `100 g · 100 ml · 1 cup · 1 tbsp · 1 tsp ·
 * Custom…` (client ruling, 2026-09-15). A preset chip fills and locks the serving label, basis and
 * amount together — most packs need no serving tap at all, because a fresh food already opens on
 * 100 g. Only Custom opens the three fields the old form always showed (Label, Measured by, Amount),
 * and it grows the form downward into the same slot the locked read-out used — the chips never move.
 *
 * PRESET TABLE, ONE PLACE. `src/db/servings.ts`'s `SERVING_PRESETS` is the metric conversion table
 * (client ruling 5) and the source of each preset's stable `key` (issue #185) — this file never
 * re-implements either. The chip row renders straight off `SERVING_PRESETS`, in table order, and
 * `resolvePresetKey` (`../serving-preset.ts`) resolves an edited food's chip by reading a matching
 * preset's own `.key`, shared with `<PortionSheet>` (issue #93, retired the index-zipped
 * `matchingPresetKey`/`PRESET_BY_KEY` in issue #198).
 *
 * CUSTOM NEVER RESETS. Picking Custom seeds its basis + amount from whichever chip was selected just
 * before it (`customTouchedRef`, below) — never a reset to 0. The label starts blank for a brand-new
 * food (it is the one thing only the user can name), but for an edit it always starts pre-filled
 * from `initial.servingLabel` — including when a preset matched on basis + amount but not on label,
 * so the original name is one tap away, never discarded (PR #188 review, B1). Once Custom has been
 * explicitly picked once, further preset taps stop touching its state, so switching back finds
 * exactly what was typed (or, for an edit, exactly what was there to begin with).
 *
 * VALIDATION, EDIT PRE-SELECTION: see the two block comments further down, at `firstError` and the
 * `initial` resolution in `FoodForm` itself.
 *
 * SAVE IS A REAL BUTTON, NOT AUTO-COMMIT — same doctrine as #86's form: a multi-field entry form has
 * no single value to auto-commit the instant it changes, so Save (never a confirmation dialog on top
 * of it) is the only sane commit point. Cancel discards, with nothing written either way.
 *
 * `variant` — issue #89's contract: `'sheet'` (`CreateFoodSheet`, always a fresh food) reads Save as
 * "Save & log ‹serving›" and paints the footer `foodForm.footerBg` (the sheet's own ground);
 * `'screen'` (`/foods/new`, `/foods/[id]`, the default) reads "Save food" for a fresh food or "Save
 * changes" plus a history note when editing, and paints the footer `foodForm.footerBgScreen` (the
 * canvas). Never both at once — a screen is never inside the create sheet's own footer band.
 *
 * CUSTOM REVEAL (issue #191, item 1). `motion.events.customReveal` (height + fade) now drives
 * `<CustomReveal>` below through `react-native-reanimated`, the same `useReducedMotion` +
 * `useSharedValue` + `useEffect`-keyed-`withTiming` shape `QuickAddTile`'s `tilePressIn`/`tilePressOut`
 * and `UndoToast`'s `toastIn`/`toastOut` already use for every other `motion.events.*` token in this
 * codebase.
 *  - Reanimated has no "auto height" primitive, so the reveal's own `onLayout` (`handleLayout`)
 *    drives the height tween directly rather than a `useEffect` keyed only to `visible` — an effect
 *    fires before the native layout pass has produced a measurement, so keying the open tween to it
 *    alone left the very first open fade-only (review #209, S1). Driving it from `onLayout` instead
 *    also means the box tracks the fields' own height if it changes while still open (Dynamic Type,
 *    rotation), rather than staying pinned at whatever was first measured. `hasToggledRef` keeps this
 *    passive on the very first paint when a form lands straight on Custom (an edit with no matching
 *    preset) — nothing tweens in on mount, only on an actual open/close after that. RNTL's renderer
 *    does not fire `onLayout` on its own, but a test can invoke the `View`'s `onLayout` prop by hand
 *    with a synthetic event, `act()`-wrapped so the mock's re-render lands before the next assertion
 *    reads it — `FoodForm.test.tsx`'s "reopening Custom mid-close returns the fields to their
 *    measured height" test (review #209 round 2, B4) exercises this path directly, open → grow →
 *    close → reopen. Whether `handleLayout` is ever *called* on a given path is a property of the
 *    tree (does the measured frame actually change, does the subtree unmount), not of the harness —
 *    on device, `useAnimatedStyle` itself needs no React re-render at all, so nothing here depends on
 *    RNTL's rendering model beyond that one caveat.
 *  - The fields stay mounted through their own close tween (`UndoToast`'s held-payload shape), per
 *    `motion.events.customReveal`'s own doc (`tokens.ts`, "interruptible: a second chip tap
 *    mid-animation reverses it from where it is") and this reveal's promise that a chip tap back to
 *    Custom mid-close reverses it from wherever it is, rather than a hard cut. Reopening *during* the
 *    close hold never gets a new `onLayout` — `revealContent`'s own frame never changes across the
 *    cycle, so RN never re-fires the layout event, and the subtree never unmounts either — so the
 *    visibility effect below carries an explicit `visible` branch that retargets `height` for exactly
 *    that case (review #209 round 2, B4; guarded by `heightKnown.value` so `handleLayout` still owns
 *    a genuine first open). `FoodForm.test.tsx`'s "removes the Custom fields once the close tween has
 *    run" test (review #209, B1) guards the end of an uninterrupted hold — the fields are gone once
 *    the token's own duration has elapsed. For the hold itself, the `Animated.View` also drops
 *    `pointerEvents` to `'none'` and hides itself from the accessibility tree
 *    (`accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`) the instant
 *    `visible` goes false, so a screen reader never announces a field that is already fading out
 *    underneath the locked read-out.
 *
 * DISCLOSED GAPS (see this issue's PR body):
 *  - The locked read-out's padlock glyph has a colour token (`foodForm.lockIcon`) but no icon *name*
 *    token — `glyph` (`src/theme/tokens.ts`) has no lock entry. Rendered without an icon rather than
 *    hard-coding an Ionicons name design-lead never published.
 *  - The footer is the last item inside the form's own `ScrollView`, not a true pinned/keyboard-
 *    avoiding footer — `PortionSheet.tsx` already has a `KeyboardAvoidingView` precedent, but this
 *    form does not follow it yet (tracked separately as issue #207, out of scope for #191 — see that
 *    issue for why). Not changed here. `footerDivider` still appears once the content has scrolled,
 *    via a plain `onScroll` check.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type TextStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { SERVING_PRESETS, UNIT_OF_BASIS, servingOf, servingPresetByKey, type FoodBasis, type FoodInput, type ServingPresetKey } from '../../db';
import { formatGrams, formatMl, formatPreviewProtein } from '../format/food';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { resolvePresetKey } from '../serving-preset';
import { haptics, motion, radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { Stepper } from './Stepper';

type ServingKey = ServingPresetKey | 'custom';

/** "100 g" / "100 ml" — the amount in its basis's canonical unit, through the same formatter every
 * other food amount renders through (issue #124). */
function amountText(basis: FoodBasis, amount: number): string {
  return basis === 'weight' ? formatGrams(amount) : formatMl(amount);
}

/** "Per 100 g" / "Per 100 ml" — the nutrition section's eyebrow, following whichever basis is in
 * effect (a preset's own basis, or Custom's own Measured-by choice). */
function per100Heading(basis: FoodBasis): string {
  return `Per ${amountText(basis, 100)}`;
}

export type FoodFormProps = {
  /** `undefined`/`null` — a fresh food, every field starts blank/zero and the 100 g preset is
   * selected. Given — an edit, pre-selecting the matching preset or falling back to Custom
   * (see `resolvePresetKey`). */
  readonly initial?: FoodInput | null;
  readonly onSave: (input: FoodInput) => void;
  readonly onCancel: () => void;
  /** `'sheet'` — inside `CreateFoodSheet`, always a fresh food: Save reads "Save & log ‹serving›"
   * and the footer paints `foodForm.footerBg`. `'screen'` (default) — `/foods/new`/`/foods/[id]`:
   * Save reads "Save food" or "Save changes" (with a history note) depending on `initial`, and the
   * footer paints `foodForm.footerBgScreen`. */
  readonly variant?: 'sheet' | 'screen';
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

/** `null`/empty checks the way `validateFoodInput` does, so this form's own gate agrees with the
 * database's — see the module note on why this is a courtesy, not the source of truth. Only Custom
 * has a typed label to check; a preset's label is never blank. */
function firstError(name: string, servingKey: ServingKey, customLabel: string): string | null {
  if (name.trim().length === 0) return 'Name is required.';
  if (servingKey === 'custom' && customLabel.trim().length === 0) return 'Name the serving, e.g. 1 scoop.';
  return null;
}

function Field({
  label,
  value,
  onChangeText,
  theme,
  placeholder,
  testID,
  hasError,
  inputRef,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  theme: Theme;
  placeholder?: string;
  testID: string;
  hasError?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
}) {
  const { foodForm } = theme.color;
  return (
    <View style={styles.field}>
      <Text style={textStyle(type.label, foodForm.fieldLabelText)}>{label}</Text>
      <TextInput
        ref={inputRef}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={foodForm.placeholderText}
        accessibilityLabel={label}
        style={[
          textStyle(type.input, foodForm.inputText),
          styles.input,
          {
            minHeight: size.foodForm.fieldHit,
            borderRadius: radius.md,
            backgroundColor: foodForm.fieldBg,
            borderWidth: hasError ? size.foodForm.fieldBorderWidthFocus : size.foodForm.fieldBorderWidth,
            borderColor: hasError ? foodForm.fieldBorderError : foodForm.fieldBorder,
          },
        ]}
      />
    </View>
  );
}

/** The Custom serving's own Weight/Volume choice — `size.foodForm.fieldBorderWidth`'s own doc names
 * "the selected Weight | Volume segment" as one of the hairlines this form measures, so this keeps
 * the existing `segmented.*` tokens (issue #89's own contract, section 6: "Weight | Volume toggle
 * keeps `segmented.*`"). Only rendered under Custom — a preset already implies its basis. */
function BasisToggle({ basis, onChange, theme, testID }: { basis: FoodBasis; onChange: (basis: FoodBasis) => void; theme: Theme; testID: string }) {
  const { segmented, foodForm } = theme.color;
  return (
    <View style={styles.field}>
      <Text style={textStyle(type.label, foodForm.fieldLabelText)}>Measured by</Text>
      <View testID={testID} style={styles.toggleRow}>
        {(['weight', 'volume'] as const).map((option) => {
          const selected = option === basis;
          return (
            <Pressable
              key={option}
              testID={`${testID}-${option}`}
              onPress={() => onChange(option)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option === 'weight' ? 'Weight (grams)' : 'Volume (millilitres)'}
              style={[
                styles.toggleChip,
                {
                  minHeight: size.tapTargetMin,
                  borderRadius: radius.sm,
                  backgroundColor: selected ? segmented.selectedBg : segmented.trackBg,
                  borderColor: segmented.selectedBorder,
                  borderWidth: selected ? StyleSheet.hairlineWidth : 0,
                },
              ]}
            >
              <Text style={textStyle(selected ? type.controlSelected : type.control, selected ? segmented.selectedText : segmented.optionText)}>
                {option === 'weight' ? 'Weight' : 'Volume'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** One serving chip — a preset, or the trailing "Custom…"/"Custom" chip. Tapping the chip already
 * selected does nothing (issue #89, section 1); every other tap selects at once and fires
 * `haptics.servingPicked`, the same "selection change" feel a picker detent gives. */
function Chip({
  label,
  selected,
  onPress,
  theme,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: Theme;
  testID: string;
}) {
  const { foodForm } = theme.color;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        {
          minHeight: size.foodForm.chipHit,
          borderRadius: radius.sm,
          backgroundColor: selected ? foodForm.chipSelectedBg : foodForm.chipBg,
          borderWidth: selected ? size.foodForm.chipBorderSelected : size.foodForm.chipBorder,
          borderColor: selected ? foodForm.chipSelectedBorder : foodForm.chipBorder,
        },
      ]}
    >
      <Text style={textStyle(selected ? type.controlSelected : type.control, selected ? foodForm.chipSelectedText : foodForm.chipText)}>{label}</Text>
    </Pressable>
  );
}

/**
 * Drives `motion.events.customReveal` (height + fade) through `react-native-reanimated` for the
 * Custom fields — same `useReducedMotion` + `useSharedValue` + `useEffect`-keyed-`withTiming` shape
 * as `QuickAddTile`'s `tilePressIn`/`tilePressOut` and `UndoToast`'s `toastIn`/`toastOut` (module doc,
 * "CUSTOM REVEAL"). Mounted once for the form's lifetime — `visible` toggles rather than this
 * component being conditionally created/destroyed by its caller — so the refs and shared values
 * below persist across every open/close instead of resetting each time.
 *
 * HELD THROUGH ITS OWN CLOSE, same shape as `UndoToast`'s payload hold: `rendered` keeps the fields
 * (and their typed-in state, which in fact lives one level up in `FoodForm` itself — issue #89's
 * "switching is never a reset") in the tree until the close tween's own duration has elapsed, so a
 * chip tap back to Custom mid-close reverses the animation from wherever it is rather than cutting
 * it. Opening is immediate — the fields must exist to be tapped into the instant Custom is picked.
 *
 * HEIGHT IS MEASURED, NOT GUESSED. There is no "auto height" primitive in Reanimated — `onLayout` on
 * the unclipped content below reports its natural height once it has rendered, and only once that is
 * known does this stop rendering an unclipped (`height: undefined`) box and start tweening a real
 * number between it and 0. The first-ever open (including an edit that lands straight on Custom) has
 * nothing measured yet, so it renders unclipped and un-tweened — nothing to reveal when it was
 * already there at first paint.
 */
function CustomReveal({
  visible,
  reducedMotion,
  children,
  testID,
}: {
  visible: boolean;
  reducedMotion: boolean;
  children: ReactNode;
  testID: string;
}) {
  const [rendered, setRendered] = useState(visible);
  const removalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measuredHeight = useRef<number | null>(null);
  const mountedRef = useRef(false);
  // True once this reveal has undergone at least one visible transition since mount. Landing
  // straight on Custom at mount (an edit with no matching preset) is not a transition — nothing
  // tweens in, per the "renders unclipped and un-tweened" doc note above — so `handleLayout` below
  // only starts actively tweening height once the user has actually opened or closed it once.
  const hasToggledRef = useRef(false);
  const height = useSharedValue(0);
  const heightKnown = useSharedValue(false);
  const opacity = useSharedValue(visible ? 1 : 0);

  const revealEvent = motion.events.customReveal;
  const duration = reducedMotion ? revealEvent.reduced.duration : revealEvent.duration;
  const curve = motion.easing[revealEvent.easing];

  // Adopted the instant `visible` turns true — the same derived-state escape hatch `UndoToast` uses
  // for its own payload, rather than a `setState` tucked inside an effect body.
  if (visible && !rendered) setRendered(true);

  // Declared ahead of the effects below on purpose: both `height` and `heightKnown` also appear in
  // the second effect's dependency array, and this codebase's lint rule (`react-hooks/immutability`)
  // refuses a direct (non-`withTiming`) snap-write to a shared value from code that comes *after* an
  // effect the same value was named in — a bare `height.value = 0` reads too much like the kind of
  // effect-driven state write React's own compiler rejects, even though a Reanimated shared value
  // isn't render state. Snapping here, before either effect, keeps the snap and the `useAnimatedStyle`
  // read of the very same value unambiguous about which one is the "handle", not merely satisfies the
  // linter.
  const handleLayout = (event: LayoutChangeEvent): void => {
    const measured = event.nativeEvent.layout.height;
    measuredHeight.current = measured;
    if (!hasToggledRef.current || !visible || measured === height.value) return;
    if (!heightKnown.value) {
      // First measurement since a real open/close transition: snap the shared value to 0 first so
      // this tween has somewhere to grow from, rather than "jumping" from an assumed-known value.
      height.value = 0;
      heightKnown.value = true;
    }
    height.value = withTiming(measured, { duration, easing: Easing.bezier(...curve) });
  };

  useEffect(() => {
    if (visible) {
      if (removalTimer.current) {
        clearTimeout(removalTimer.current);
        removalTimer.current = null;
      }
      return;
    }
    if (!rendered) return;
    removalTimer.current = setTimeout(() => setRendered(false), duration);
    return () => {
      if (removalTimer.current) clearTimeout(removalTimer.current);
    };
  }, [visible, rendered, duration]);

  useEffect(() => {
    // First run ever (component mount): whatever `visible` starts as is simply how the form opens.
    // An edit landing straight on Custom shows its fields already there — nothing to tween in from.
    if (!mountedRef.current) {
      mountedRef.current = true;
      opacity.value = visible ? 1 : 0;
      return;
    }
    hasToggledRef.current = true;
    opacity.value = withTiming(visible ? 1 : 0, { duration, easing: Easing.bezier(...curve) });
    // Closing always has a known height to retreat from — Custom cannot be closed before it has
    // been opened, so `measuredHeight.current` is always set by the time this branch runs.
    // Opening's height tween lives entirely in `handleLayout` above instead of here: on the very
    // first open in this component's lifetime `onLayout` has not fired yet when this effect runs
    // (it needs a real native layout pass), so this effect used to have nothing to tween from and
    // fell back to fade-only — the common case for anyone who picks Custom just once (review #209,
    // S1). Driving the open tween from the layout event itself fixes that, and also means a later
    // growth in the fields' own height while still open (Dynamic Type, rotation) gets picked up too,
    // instead of staying pinned at whatever height was first measured (review #209, S1).
    //
    // The `visible` branch below exists for one reason only: `tokens.ts`'s own doc on this event
    // ("interruptible: a second chip tap mid-animation reverses it from where it is") and this
    // reveal's own doc above both promise that a chip tap back to Custom mid-close reverses smoothly
    // — but a reopen *during* the 200ms close hold never fires `handleLayout` to make that happen.
    // The fields stay mounted (`rendered` doesn't flip) and `revealContent`'s own frame never
    // changes across the whole cycle (`overflow: 'hidden'` is paint-only, not layout, and RN's
    // default `flexShrink: 0` means the parent's explicit height never constrains the child's
    // measured size) — so RN never re-fires the layout event, and nothing else was retargeting
    // `height` on that path. Without this branch the reveal got stranded at `height: 0, opacity: 1`:
    // mounted, fully opaque, `pointerEvents: 'auto'`, un-hidden from the accessibility tree, and
    // clipped to nothing by `overflow: 'hidden'` — an empty gap that eats taps and that VoiceOver
    // announces as a real field (review #209, B4). `heightKnown.value` gates it to only the reopen
    // case: a genuine first-ever open still has no known height yet, so `handleLayout` keeps owning
    // that measurement untouched.
    if (visible) {
      if (heightKnown.value && measuredHeight.current !== null) {
        height.value = withTiming(measuredHeight.current, { duration, easing: Easing.bezier(...curve) });
      }
    } else if (measuredHeight.current !== null) {
      if (!heightKnown.value) {
        height.value = measuredHeight.current;
        heightKnown.value = true;
      }
      height.value = withTiming(0, { duration, easing: Easing.bezier(...curve) });
    }
  }, [visible, duration, curve, height, heightKnown, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: heightKnown.value ? height.value : undefined,
    opacity: opacity.value,
  }));

  if (!rendered) return null;

  return (
    <Animated.View
      testID={testID}
      style={[styles.reveal, animatedStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!visible}
    >
      <View onLayout={handleLayout} style={styles.revealContent}>
        {children}
      </View>
    </Animated.View>
  );
}

export function FoodForm({ initial = null, onSave, onCancel, variant = 'screen', theme, testID = 'food-form' }: FoodFormProps) {
  const { button, foodForm } = theme.color;
  const fireHaptic = useHapticFeedback();
  const reducedMotion = useReducedMotion();
  const isEditing = initial !== null;

  const matched = initial ? resolvePresetKey(initial.servingLabel, initial.basis, initial.servingAmount) : '100g';
  const [servingKey, setServingKey] = useState<ServingKey>(matched ?? 'custom');

  // Custom's own state. Always seeded from `initial?.servingLabel` when editing — even when a
  // preset matched — so the original label is still there, intact, the moment the user taps Custom
  // (PR #188 review, B1: blanking it here made an overwritten label unrecoverable from the form).
  // A brand-new food has no `initial`, so this is '' either way. Basis/amount seed from the default
  // 100 g preset so the very first tap on Custom (before any other chip) still carries over a
  // sensible basis + amount instead of 0.
  const [customLabel, setCustomLabel] = useState(initial?.servingLabel ?? '');
  const [customBasis, setCustomBasis] = useState<FoodBasis>(initial?.basis ?? 'weight');
  const [customAmount, setCustomAmount] = useState(initial?.servingAmount ?? 100);

  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [kcalPer100, setKcalPer100] = useState(initial?.kcalPer100 ?? 0);
  const [proteinPer100, setProteinPer100] = useState(initial?.proteinPer100 ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  // Once Custom has been explicitly picked, further preset taps stop mirroring into its basis/amount
  // — "switching is never a reset" (issue #89, section 2). Starts `true` when editing already fell
  // back to Custom, so an immediate preset tap there does not silently overwrite what `initial` set.
  const customTouchedRef = useRef(matched === null);
  const labelInputRef = useRef<TextInput | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (servingKey === 'custom') labelInputRef.current?.focus();
  }, [servingKey]);

  const selectPreset = (key: ServingPresetKey): void => {
    if (servingKey === key) return;
    setServingKey(key);
    if (!customTouchedRef.current) {
      // Always found: `key` only ever arrives from a `SERVING_PRESETS` entry rendered below.
      const preset = servingPresetByKey(key);
      if (preset) {
        setCustomBasis(preset.basis);
        setCustomAmount(preset.amount);
      }
    }
    fireHaptic(haptics.servingPicked);
  };

  const selectCustom = (): void => {
    if (servingKey === 'custom') return;
    customTouchedRef.current = true;
    setServingKey('custom');
    fireHaptic(haptics.servingPicked);
  };

  const preset = servingKey === 'custom' ? null : (servingPresetByKey(servingKey) ?? null);
  const basis = preset ? preset.basis : customBasis;
  const servingAmount = preset ? preset.amount : customAmount;
  const servingLabel = preset ? preset.label : customLabel;
  const unit = UNIT_OF_BASIS[basis];

  const { kcalPerServing, proteinPerServing } = servingOf({ basis, servingAmount, kcalPer100, proteinPer100 });
  const servingAmountText = amountText(basis, servingAmount);
  // "100 g = 97 kcal · 9 g protein", not "100 g (100 g) = …" — the bracket only earns its place when
  // the label says something the amount does not already say (issue #89, section 3).
  const previewLead = servingLabel === servingAmountText ? servingLabel : `${servingLabel} (${servingAmountText})`;
  const previewText = `${previewLead} = ${Math.round(kcalPerServing).toLocaleString()} kcal · ${formatPreviewProtein(proteinPerServing)} g protein`;

  const saveLabel =
    variant === 'sheet' ? `Save & log ${servingLabel}` : isEditing ? 'Save changes' : 'Save food';

  const handleSave = (): void => {
    const problem = firstError(name, servingKey, customLabel);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onSave({
      name: name.trim(),
      brand: brand.trim().length > 0 ? brand.trim() : null,
      servingLabel: servingLabel.trim(),
      basis,
      servingAmount,
      kcalPer100,
      proteinPer100,
    });
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    setScrolled(e.nativeEvent.contentOffset.y > 0);
  };

  return (
    // `handled`: with a field's keyboard up, a tap on a chip, a stepper or Save must land on the
    // first try — the default (`'never'`) spends that tap dismissing the keyboard (issue #79).
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      // …and the content insets for the keyboard, so Save can still be scrolled to when the
      // keyboard covers the bottom of the form (issue #79). iOS only; a no-op on Android.
      automaticallyAdjustKeyboardInsets
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <Field label="Name" value={name} onChangeText={setName} theme={theme} placeholder="Greek yoghurt" testID={`${testID}-name`} />
      <Field label="Brand" value={brand} onChangeText={setBrand} theme={theme} placeholder="Optional" testID={`${testID}-brand`} />

      <View style={styles.section}>
        <View style={styles.eyebrowRow}>
          <Text style={textStyle(type.micro, foodForm.sectionText)}>Serving</Text>
          <Text style={textStyle(type.label, foodForm.sectionMetaText)}>{basis === 'weight' ? 'Weight · grams' : 'Volume · millilitres'}</Text>
        </View>
        <View style={styles.chipGrid}>
          {SERVING_PRESETS.map((p) => (
            <Chip
              key={p.key}
              testID={`${testID}-serving-${p.key}`}
              label={p.label}
              selected={servingKey === p.key}
              onPress={() => selectPreset(p.key)}
              theme={theme}
            />
          ))}
          <Chip
            testID={`${testID}-serving-custom`}
            label={servingKey === 'custom' ? 'Custom' : 'Custom…'}
            selected={servingKey === 'custom'}
            onPress={selectCustom}
            theme={theme}
          />
        </View>

        <CustomReveal visible={servingKey === 'custom'} reducedMotion={reducedMotion} testID={`${testID}-custom-reveal`}>
          <Field
            label="Label"
            value={customLabel}
            onChangeText={setCustomLabel}
            theme={theme}
            placeholder="1 scoop"
            testID={`${testID}-serving-label`}
            hasError={error !== null && customLabel.trim().length === 0}
            inputRef={labelInputRef}
          />
          <BasisToggle basis={customBasis} onChange={setCustomBasis} theme={theme} testID={`${testID}-basis`} />
          <Stepper
            label={`Amount ${unit}`}
            value={customAmount}
            step={1}
            min={1}
            max={2000}
            onChange={setCustomAmount}
            theme={theme}
            testID={`${testID}-serving-amount`}
          />
        </CustomReveal>
        {servingKey !== 'custom' ? (
          <View
            testID={`${testID}-locked-amount`}
            style={[styles.lockedRow, { minHeight: size.foodForm.lockedRowHeight }]}
            accessibilityLabel={`${preset?.label} — ${servingAmountText}, locked`}
          >
            <Text style={textStyle(type.numericLg, foodForm.lockedAmountText)}>{servingAmountText}</Text>
            <Text style={textStyle(type.label, foodForm.lockedMetaText)}>
              per {preset?.label} · {basis}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.eyebrowRow}>
          <Text style={textStyle(type.micro, foodForm.sectionText)}>{per100Heading(basis)}</Text>
          <Text style={textStyle(type.label, foodForm.sectionMetaText)}>as printed on the pack</Text>
        </View>
        <View style={[styles.nutritionRow, { gap: size.foodForm.nutritionGap }]}>
          <View style={styles.nutritionCell}>
            <Stepper
              label="Calories kcal"
              value={kcalPer100}
              step={1}
              max={5000}
              onChange={setKcalPer100}
              theme={theme}
              testID={`${testID}-kcal`}
              buttonWidth={size.foodForm.nutritionButtonWidth}
              buttonHit={size.foodForm.nutritionHit}
              gap={size.foodForm.stepperGap}
              valueTextColor={foodForm.kcalValueText}
            />
          </View>
          <View style={styles.nutritionCell}>
            <Stepper
              label={`Protein ${UNIT_OF_BASIS.weight}`}
              value={proteinPer100}
              step={0.1}
              max={500}
              onChange={setProteinPer100}
              // One decimal place, matching the 0.1 step's own granularity — the default
              // `Math.round` display would otherwise show "0" for a fresh 0.1 tap.
              formatValue={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              theme={theme}
              testID={`${testID}-protein`}
              buttonWidth={size.foodForm.nutritionButtonWidth}
              buttonHit={size.foodForm.nutritionHit}
              gap={size.foodForm.stepperGap}
              valueTextColor={foodForm.proteinValueText}
            />
          </View>
        </View>
      </View>

      <View testID={`${testID}-preview`} style={[styles.preview, { minHeight: size.foodForm.previewHeight, borderRadius: radius.md, backgroundColor: foodForm.previewBg }]}>
        <Text style={textStyle(type.body, foodForm.previewServingText)}>{previewText}</Text>
      </View>

      {error ? (
        <Text testID={`${testID}-error`} style={textStyle(type.label, foodForm.errorText)}>
          {error}
        </Text>
      ) : null}

      <View
        style={[
          styles.footer,
          {
            backgroundColor: variant === 'sheet' ? foodForm.footerBg : foodForm.footerBgScreen,
            borderTopWidth: scrolled ? StyleSheet.hairlineWidth : 0,
            borderTopColor: foodForm.footerDivider,
          },
        ]}
      >
        <View style={styles.actions}>
          <Pressable
            testID={`${testID}-cancel`}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={[
              styles.actionButton,
              { minHeight: size.button.primaryHit, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: button.secondaryBorder },
            ]}
          >
            <Text style={textStyle(type.button, button.secondaryText)}>Cancel</Text>
          </Pressable>
          <Pressable
            testID={`${testID}-save`}
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel={saveLabel}
            style={[styles.actionButton, { minHeight: size.button.primaryHit, borderRadius: radius.md, backgroundColor: button.kcalBg }]}
          >
            <Text style={textStyle(type.button, button.kcalText)}>{saveLabel}</Text>
          </Pressable>
        </View>
        {variant === 'screen' && isEditing ? (
          <Text style={textStyle(type.label, foodForm.historyNoteText)}>Changes apply from now on. Past logs keep their numbers.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[6],
    paddingBottom: space[9],
  },
  reveal: {
    overflow: 'hidden',
  },
  revealContent: {
    gap: space[4],
  },
  field: {
    gap: space[2],
  },
  input: {
    paddingHorizontal: space[5],
  },
  section: {
    gap: space[4],
  },
  eyebrowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[3],
  },
  chip: {
    flexBasis: '30%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[3],
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[3],
  },
  toggleChip: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[4],
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space[3],
  },
  nutritionRow: {
    flexDirection: 'row',
  },
  nutritionCell: {
    flex: 1,
  },
  preview: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: space[5],
  },
  footer: {
    gap: space[2],
    paddingTop: space[4],
  },
  actions: {
    flexDirection: 'row',
    gap: space[4],
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
