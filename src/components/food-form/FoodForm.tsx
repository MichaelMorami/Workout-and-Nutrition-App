/**
 * `<FoodForm>` — issue #43's add/edit food, adapted (issue #86) to the per-100 shape: `basis`,
 * `servingAmount`, `kcalPer100`, `proteinPer100` replace the old per-serving fields. `name`, `brand`,
 * `servingLabel` are free text (there is no stepper that could set a name); serving amount, kcal per
 * 100 and protein per 100 are each a `<Stepper>`; `basis` is a two-option toggle (Weight/Volume), the
 * minimal control a required enum field needs.
 *
 * ISSUE #87 — STEPS ARE NOW 1 (SERVING/KCAL) AND 0.1 (PROTEIN), NOT 5. The old 5-unit grid is what
 * made a label-exact value like "612 kcal per 100 g" unreachable without dozens of taps; `<Stepper>`
 * itself now also accepts a tapped, typed exact value (never rounded to this grid) and an
 * accelerating hold for a fast large change, so these three steppers only need to cover *small*
 * corrections — the doctrine `<Stepper>`'s own header describes, not "never a keyboard number field".
 *
 * SCOPE NOTE: a one-tap serving-preset picker (100 g / 100 ml / 1 cup / 1 tbsp / 1 tsp + Custom) is
 * issue #89, blocked on #88's design. This form is deliberately the plain #86 data-shape adaptation
 * only — every field defaults or steps to a valid value with no forced extra tap, but there is no
 * preset row yet.
 *
 * `servingAmount` defaults to 100 (not 0): the schema requires it strictly positive, and 100 is
 * already the denomination `kcalPer100`/`proteinPer100` are entered in, so an untouched new food is
 * valid without an extra stepper tap.
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
import { UNIT_OF_BASIS, type FoodBasis, type FoodInput } from '../../db';
import { formatGrams, formatMl } from '../format/food';
import { radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { Stepper } from './Stepper';

/** "100 g" / "100 ml" — the per-100 steppers' denomination, through the same formatter every other
 * food amount renders through (issue #124). Not a hand-built string: the unit itself comes from
 * `UNIT_OF_BASIS`, the one map `basis` implies it from. */
function per100Label(basis: FoodBasis): string {
  return basis === 'weight' ? formatGrams(100) : formatMl(100);
}

export type FoodFormProps = {
  /** `undefined`/`null` — a fresh food, every field starts blank/zero. Given — an edit, pre-filled
   * at exactly what the food currently holds (issue #43: "pre-fill everything that can be predicted"). */
  readonly initial?: FoodInput | null;
  readonly onSave: (input: FoodInput) => void;
  readonly onCancel: () => void;
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

/** The minimal control a required two-value enum needs — `basis` picks which canonical unit
 * `servingAmount`/`kcalPer100`/`proteinPer100` are denominated in. Not the issue #89 preset picker:
 * just a plain segmented toggle, the same selected/unselected token pair `PortionSheet`'s own
 * Presets/Exact switch already uses. */
function BasisToggle({ basis, onChange, theme, testID }: { basis: FoodBasis; onChange: (basis: FoodBasis) => void; theme: Theme; testID: string }) {
  const { segmented } = theme.color;
  return (
    <View style={styles.field}>
      <Text style={textStyle(type.label, theme.color.text.secondary)}>Measured in</Text>
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

export function FoodForm({ initial = null, onSave, onCancel, theme, testID = 'food-form' }: FoodFormProps) {
  const { button, state } = theme.color;

  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [servingLabel, setServingLabel] = useState(initial?.servingLabel ?? '');
  const [basis, setBasis] = useState<FoodBasis>(initial?.basis ?? 'weight');
  // Defaults to 100, not 0 — `servingAmount` must be > 0 (issue #86's schema), and 100 is already
  // the denomination `kcalPer100`/`proteinPer100` are entered in, so a new food is valid untouched.
  const [servingAmount, setServingAmount] = useState(initial?.servingAmount ?? 100);
  const [kcalPer100, setKcalPer100] = useState(initial?.kcalPer100 ?? 0);
  const [proteinPer100, setProteinPer100] = useState(initial?.proteinPer100 ?? 0);
  const [error, setError] = useState<string | null>(null);

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

      <BasisToggle basis={basis} onChange={setBasis} theme={theme} testID={`${testID}-basis`} />
      <Stepper
        label="Serving amount"
        value={servingAmount}
        step={1}
        max={2000}
        unit={unit}
        onChange={setServingAmount}
        theme={theme}
        testID={`${testID}-serving-amount`}
      />

      <Stepper
        label={`Kcal per ${per100Label(basis)}`}
        value={kcalPer100}
        step={1}
        max={5000}
        unit="kcal"
        onChange={setKcalPer100}
        theme={theme}
        testID={`${testID}-kcal`}
      />
      <Stepper
        label={`Protein per ${per100Label(basis)}`}
        value={proteinPer100}
        step={0.1}
        max={500}
        unit={UNIT_OF_BASIS.weight}
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
