/**
 * `<FoodForm>` — issue #43's add/edit food, rebuilt on issue #86's per-100 shape. `name`, `brand`,
 * `servingLabel` are free text (there is no stepper that could set a name); every quantity —
 * serving amount, kcal per 100, protein per 100 — is a `<Stepper>`, never a keyboard number field,
 * per the module's own tap doctrine.
 *
 * ONE TAP PICKS BASIS + SERVING AMOUNT (issue #86 ruling 2). `SERVING_PRESETS` (100 g, 100 ml,
 * 1 cup, 1 tbsp, 1 tsp) is one constant table shared with the database, so the form and `foods.basis`
 * never disagree about what a preset means. Tapping a preset sets `basis`, `servingAmount` *and*
 * `servingLabel` in one tap — the common case (a food measured in one of the five standard units)
 * never touches a stepper at all. "Custom" (e.g. "1 scoop, 33 g") is the one case that must set an
 * amount the preset table has no entry for: a weight/volume toggle plus a `<Stepper>`, still never a
 * keyboard number field.
 *
 * SAVE IS A REAL BUTTON, NOT AUTO-COMMIT. Unlike the quick-add grid's one-tap logging, this is a
 * multi-field data-entry form: there is no single "the" value to commit the instant it changes, so
 * an explicit Save (never a confirmation dialog — it is the primary action, not a check on one) is
 * the only sane commit point. Cancel discards, with nothing written either way — no undo needed for
 * a form that never touched the database until Save.
 *
 * VALIDATION IS INLINE TEXT, NOT A DIALOG. A bad Save shows `food-form-error` and does not call
 * `onSave` — the same "never a popup" doctrine `PortionSheet`/`QuickAddGrid` already follow, just
 * applied to a form instead of a log.
 *
 * `db-engineer`'s own `validateFoodInput`/`createFood`/`updateFood` (`src/db/queries/catalog.ts`)
 * re-validate anyway — this form's checks exist only so a mistake shows up before a write is even
 * attempted, not as the source of truth for what is a valid `FoodInput`.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, TextInput, type TextStyle } from 'react-native';
import { SERVING_PRESETS, UNIT_OF_BASIS, type FoodBasis, type FoodInput, type ServingPreset } from '../../db';
import { radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { Stepper } from './Stepper';

export type FoodFormProps = {
  /** `undefined`/`null` — a fresh food, every field starts blank/zero. Given — an edit, pre-filled
   * at exactly what the food currently holds (issue #43: "pre-fill everything that can be predicted"). */
  readonly initial?: FoodInput | null;
  readonly onSave: (input: FoodInput) => void;
  readonly onCancel: () => void;
  readonly theme: Theme;
  readonly testID?: string;
};

/** Not a preset: the escape hatch for a serving the table has no entry for (issue #86 ruling 4 —
 * a custom serving belongs to its food only, never added to the shared table). */
const CUSTOM = 'Custom';

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

/** A preset's label as a testID fragment: "100 g" -> "100-g", "1 cup" -> "1-cup". */
function slugOf(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-');
}

/** Which preset (if any) exactly matches a stored `basis`/`servingAmount` pair — how editing an
 * existing food re-selects the chip it was created from instead of always landing on Custom. */
function presetFor(basis: FoodBasis, servingAmount: number): ServingPreset | null {
  return SERVING_PRESETS.find((preset) => preset.basis === basis && preset.amount === servingAmount) ?? null;
}

/** `null`/empty checks the way `validateFoodInput` does, so this form's own gate agrees with the
 * database's — see the module note on why this is a courtesy, not the source of truth. */
function firstError(name: string, servingLabel: string, servingAmount: number): string | null {
  if (name.trim().length === 0) return 'Name is required.';
  if (servingLabel.trim().length === 0) return 'Serving label is required.';
  if (!(servingAmount > 0)) return 'Serving amount must be greater than zero.';
  return null;
}

function Field({
  label,
  value,
  onChangeText,
  theme,
  placeholder,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  theme: Theme;
  placeholder?: string;
  testID: string;
}) {
  const { searchSheet, text } = theme.color;
  return (
    <View style={styles.field}>
      <Text style={textStyle(type.label, text.secondary)}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={searchSheet.placeholderText}
        accessibilityLabel={label}
        style={[
          textStyle(type.input, searchSheet.queryText),
          styles.input,
          { minHeight: size.tapTargetMin, borderRadius: radius.md, backgroundColor: searchSheet.fieldBg, borderColor: searchSheet.fieldBorder },
        ]}
      />
    </View>
  );
}

/** The preset row — five metric presets plus Custom, one tap each. A wrapping row of segmented-style
 * chips, the same selected/unselected token pair `segmented` already defines for `PortionSheet`'s
 * Presets/Exact switch, generalised past a fixed two-option track. */
function PresetRow({
  selectedLabel,
  onSelect,
  theme,
  testID,
}: {
  selectedLabel: string;
  onSelect: (option: ServingPreset | typeof CUSTOM) => void;
  theme: Theme;
  testID: string;
}) {
  const { segmented } = theme.color;
  const options: readonly (ServingPreset | typeof CUSTOM)[] = [...SERVING_PRESETS, CUSTOM];

  return (
    <View style={styles.field}>
      <Text style={textStyle(type.label, theme.color.text.secondary)}>Serving</Text>
      <View testID={testID} style={styles.presetRow}>
        {options.map((option) => {
          const label = option === CUSTOM ? CUSTOM : option.label;
          const selected = label === selectedLabel;
          return (
            <Pressable
              key={label}
              testID={`${testID}-${slugOf(label)}`}
              onPress={() => onSelect(option)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              style={[
                styles.presetChip,
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
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The Custom serving's weight/volume toggle — which canonical unit `servingAmount` is in. */
function BasisToggle({ basis, onChange, theme, testID }: { basis: FoodBasis; onChange: (basis: FoodBasis) => void; theme: Theme; testID: string }) {
  const { segmented } = theme.color;
  return (
    <View style={styles.field}>
      <Text style={textStyle(type.label, theme.color.text.secondary)}>Measured in</Text>
      <View testID={testID} style={styles.presetRow}>
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
                styles.presetChip,
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

export function FoodForm({ initial = null, onSave, onCancel, theme, testID = 'food-form' }: FoodFormProps) {
  const { button, state } = theme.color;

  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [servingLabel, setServingLabel] = useState(initial?.servingLabel ?? '');
  const [basis, setBasis] = useState<FoodBasis>(initial?.basis ?? 'weight');
  const [servingAmount, setServingAmount] = useState(initial?.servingAmount ?? 0);
  const [kcalPer100, setKcalPer100] = useState(initial?.kcalPer100 ?? 0);
  const [proteinPer100, setProteinPer100] = useState(initial?.proteinPer100 ?? 0);
  const [selectedPreset, setSelectedPreset] = useState<string>(
    initial ? (presetFor(initial.basis, initial.servingAmount)?.label ?? CUSTOM) : CUSTOM,
  );
  const [error, setError] = useState<string | null>(null);

  const handlePresetSelect = (option: ServingPreset | typeof CUSTOM): void => {
    if (option === CUSTOM) {
      setSelectedPreset(CUSTOM);
      return;
    }
    setSelectedPreset(option.label);
    setBasis(option.basis);
    setServingAmount(option.amount);
    setServingLabel(option.label);
  };

  const handleSave = (): void => {
    const problem = firstError(name, servingLabel, servingAmount);
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

  const unit = UNIT_OF_BASIS[basis];

  return (
    // `handled`: with the name field's keyboard up, a tap on a stepper or Save must land on the
    // first try — the default (`'never'`) spends that tap dismissing the keyboard (issue #79).
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      // …and the content insets for the keyboard, so Save can still be scrolled to when the
      // keyboard covers the bottom of the form (issue #79). iOS only; a no-op on Android.
      automaticallyAdjustKeyboardInsets
    >
      <Field label="Name" value={name} onChangeText={setName} theme={theme} placeholder="Greek yoghurt" testID={`${testID}-name`} />
      <Field label="Brand" value={brand} onChangeText={setBrand} theme={theme} placeholder="Optional" testID={`${testID}-brand`} />
      <Field
        label="Serving label"
        value={servingLabel}
        onChangeText={setServingLabel}
        theme={theme}
        placeholder="1 pot"
        testID={`${testID}-serving-label`}
      />

      <PresetRow selectedLabel={selectedPreset} onSelect={handlePresetSelect} theme={theme} testID={`${testID}-preset`} />

      {selectedPreset === CUSTOM ? (
        <>
          <BasisToggle basis={basis} onChange={setBasis} theme={theme} testID={`${testID}-basis`} />
          <Stepper
            label="Serving amount"
            value={servingAmount}
            step={5}
            max={2000}
            unit={unit}
            onChange={setServingAmount}
            theme={theme}
            testID={`${testID}-serving-amount`}
          />
        </>
      ) : null}

      <Stepper
        label={`Kcal per 100 ${unit}`}
        value={kcalPer100}
        step={5}
        max={5000}
        unit="kcal"
        onChange={setKcalPer100}
        theme={theme}
        testID={`${testID}-kcal`}
      />
      <Stepper
        label={`Protein per 100 ${unit}`}
        value={proteinPer100}
        step={1}
        max={500}
        unit="g"
        onChange={setProteinPer100}
        theme={theme}
        testID={`${testID}-protein`}
      />

      {error ? (
        <Text testID={`${testID}-error`} style={textStyle(type.label, state.danger)}>
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          testID={`${testID}-cancel`}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={[
            styles.actionButton,
            { minHeight: size.tapTargetMin, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: button.secondaryBorder },
          ]}
        >
          <Text style={textStyle(type.button, button.secondaryText)}>Cancel</Text>
        </Pressable>
        <Pressable
          testID={`${testID}-save`}
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Save food"
          style={[styles.actionButton, { minHeight: size.tapTargetMin, borderRadius: radius.md, backgroundColor: button.kcalBg }]}
        >
          <Text style={textStyle(type.button, button.kcalText)}>Save</Text>
        </Pressable>
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
    borderWidth: StyleSheet.hairlineWidth,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[3],
  },
  presetChip: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[4],
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
