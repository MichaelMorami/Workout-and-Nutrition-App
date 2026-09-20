/**
 * `<FoodForm>` — issue #89's serving picker, replacing #86's always-typed "Serving label" +
 * Weight/Volume toggle pair with a one-tap chip row: `100 g · 100 ml · 1 cup · 1 tbsp · 1 tsp ·
 * Custom…` (client ruling, 2026-09-15). A preset chip fills and locks the serving label, basis and
 * amount together — most packs need no serving tap at all, because a fresh food already opens on
 * 100 g. Only Custom opens the three fields the old form always showed (Label, Measured by, Amount),
 * and it grows the form downward into the same slot the locked read-out used — the chips never move.
 *
 * PRESET TABLE, ONE PLACE. `src/db/servings.ts`'s `SERVING_PRESETS` is the metric conversion table
 * (client ruling 5) — this file never re-implements it. `src/theme/tokens.ts`'s `servingPresetKeys`
 * gives each preset a stable string key for testIDs and UI rules; the two arrays are the same order
 * (`PRESET_BY_KEY` below zips them by index) because #86 has not yet landed a stable `key` field on
 * `SERVING_PRESETS` itself (issue #185) — this is the documented fallback until it does.
 *
 * CUSTOM NEVER RESETS. Picking Custom seeds its basis + amount from whichever chip was selected just
 * before it (`customSeedRef`, below) — never a reset to 0. The label itself always starts blank (it
 * is the one thing only the user can name), and once Custom has been explicitly picked once, further
 * preset taps stop touching its state, so switching back finds exactly what was typed.
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
 * DISCLOSED GAPS (see this issue's PR body):
 *  - The locked read-out's padlock glyph has a colour token (`foodForm.lockIcon`) but no icon *name*
 *    token — `glyph` (`src/theme/tokens.ts`) has no lock entry. Rendered without an icon rather than
 *    hard-coding an Ionicons name design-lead never published.
 *  - The Custom-reveal's `motion.events.customReveal` (200 ms height+fade) is not wired through
 *    `react-native-reanimated` — it is a plain conditional render. Precedent: `PortionSheet`'s own
 *    `portionModeSwap` token is equally unwired today; RNTL cannot assert animation timing anyway.
 *  - The footer is the last item inside the form's own `ScrollView`, not a true pinned/keyboard-
 *    avoiding footer — there is no `KeyboardAvoidingView` precedent anywhere in this codebase yet.
 *    `footerDivider` still appears once the content has scrolled, via a plain `onScroll` check.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, TextInput, type NativeSyntheticEvent, type NativeScrollEvent, type TextStyle } from 'react-native';
import { SERVING_PRESETS, UNIT_OF_BASIS, servingOf, type FoodBasis, type FoodInput, type ServingPreset } from '../../db';
import { formatGrams, formatMl, formatPreviewProtein } from '../format/food';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { haptics, radius, servingPresetKeys, size, space, type, type ServingPresetKey, type Theme, type TypeStyle } from '../../theme/tokens';
import { Stepper } from './Stepper';

/** `servingPresetKeys[i]` names `SERVING_PRESETS[i]` — see the module note on why this is a zip, not
 * a lookup into a stable key `SERVING_PRESETS` does not have yet (issue #185). */
const PRESET_BY_KEY: Readonly<Record<ServingPresetKey, ServingPreset>> = Object.fromEntries(
  servingPresetKeys.map((key, i) => [key, SERVING_PRESETS[i]]),
) as Record<ServingPresetKey, ServingPreset>;

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

/** Finds the preset key whose basis + amount match a food exactly — issue #89's carry-over #2: a
 * stable `key` does not exist on `SERVING_PRESETS` yet (#185), so an edit falls back to matching on
 * basis + amount together (unique per preset: weight/100, volume/100, volume/250, volume/15,
 * volume/5 are five distinct pairs) rather than the serving label text, which a user may have typed
 * freely even for what was originally a preset amount. */
function matchingPresetKey(basis: FoodBasis, amount: number): ServingPresetKey | null {
  for (const key of servingPresetKeys) {
    const preset = PRESET_BY_KEY[key];
    if (preset.basis === basis && preset.amount === amount) return key;
  }
  return null;
}

export type FoodFormProps = {
  /** `undefined`/`null` — a fresh food, every field starts blank/zero and the 100 g preset is
   * selected. Given — an edit, pre-selecting the matching preset or falling back to Custom
   * (see `matchingPresetKey`). */
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

export function FoodForm({ initial = null, onSave, onCancel, variant = 'screen', theme, testID = 'food-form' }: FoodFormProps) {
  const { button, foodForm } = theme.color;
  const fireHaptic = useHapticFeedback();
  const isEditing = initial !== null;

  const matched = initial ? matchingPresetKey(initial.basis, initial.servingAmount) : '100g';
  const [servingKey, setServingKey] = useState<ServingKey>(matched ?? 'custom');

  // Custom's own state. Seeded from `initial` when editing falls back to Custom; otherwise from the
  // default 100 g preset, so the very first tap on Custom (before any other chip) still carries over
  // a sensible basis + amount instead of 0.
  const [customLabel, setCustomLabel] = useState(matched ? '' : (initial?.servingLabel ?? ''));
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
      const preset = PRESET_BY_KEY[key];
      setCustomBasis(preset.basis);
      setCustomAmount(preset.amount);
    }
    fireHaptic(haptics.servingPicked);
  };

  const selectCustom = (): void => {
    if (servingKey === 'custom') return;
    customTouchedRef.current = true;
    setServingKey('custom');
    fireHaptic(haptics.servingPicked);
  };

  const preset = servingKey === 'custom' ? null : PRESET_BY_KEY[servingKey];
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
          {servingPresetKeys.map((key) => (
            <Chip
              key={key}
              testID={`${testID}-serving-${key}`}
              label={PRESET_BY_KEY[key].label}
              selected={servingKey === key}
              onPress={() => selectPreset(key)}
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

        {servingKey === 'custom' ? (
          <>
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
          </>
        ) : (
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
        )}
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
