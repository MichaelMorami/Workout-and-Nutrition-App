/**
 * `<FoodForm>` — issue #43's add/edit food. `name`, `brand`, `servingLabel` are free text (there is
 * no stepper that could set a name), but every quantity — serving grams, kcal, protein — is a
 * `<Stepper>`, never a keyboard number field, per the module's own tap doctrine.
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
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import type { FoodInput } from '../../db';
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
function firstError(name: string, servingLabel: string): string | null {
  if (name.trim().length === 0) return 'Name is required.';
  if (servingLabel.trim().length === 0) return 'Serving label is required.';
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

export function FoodForm({ initial = null, onSave, onCancel, theme, testID = 'food-form' }: FoodFormProps) {
  const { button, state } = theme.color;

  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [servingLabel, setServingLabel] = useState(initial?.servingLabel ?? '');
  const [servingGrams, setServingGrams] = useState(initial?.servingGrams ?? 0);
  const [kcalPerServing, setKcalPerServing] = useState(initial?.kcalPerServing ?? 0);
  const [proteinPerServing, setProteinPerServing] = useState(initial?.proteinPerServing ?? 0);
  const [error, setError] = useState<string | null>(null);

  const handleSave = (): void => {
    const problem = firstError(name, servingLabel);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onSave({
      name: name.trim(),
      brand: brand.trim().length > 0 ? brand.trim() : null,
      servingLabel: servingLabel.trim(),
      servingGrams: servingGrams > 0 ? servingGrams : null,
      kcalPerServing,
      proteinPerServing,
    });
  };

  return (
    // `handled`: with the name field's keyboard up, a tap on a stepper or Save must land on the
    // first try — the default (`'never'`) spends that tap dismissing the keyboard (issue #79).
    <ScrollView testID={testID} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

      <Stepper
        label="Serving grams"
        value={servingGrams}
        step={5}
        max={2000}
        unit="g"
        onChange={setServingGrams}
        theme={theme}
        testID={`${testID}-serving-grams`}
      />
      <Stepper
        label="Kcal per serving"
        value={kcalPerServing}
        step={5}
        max={5000}
        unit="kcal"
        onChange={setKcalPerServing}
        theme={theme}
        testID={`${testID}-kcal`}
      />
      <Stepper
        label="Protein per serving"
        value={proteinPerServing}
        step={1}
        max={500}
        unit="g"
        onChange={setProteinPerServing}
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
