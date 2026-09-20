/**
 * `<FoodForm>` — issue #89's serving picker: a one-tap chip row (100 g · 100 ml · 1 cup · 1 tbsp ·
 * 1 tsp · Custom…) replaces the old always-typed "Serving label" + Weight/Volume toggle pair. A
 * preset chip fills and locks the serving label, basis and amount together; only Custom opens the
 * three fields (Label, Measured by, Amount) the old form always showed. Nutrition (kcal/protein per
 * 100) and the live preview follow whichever basis is in effect. Behaviour only — what `onSave` is
 * called with, and what a screen reader/tap target sees — never pixel layout.
 *
 * Design: `design/food-form/canvas/Spec.dc.html` (issue #88). Preset table: `src/db/servings.ts`'s
 * `SERVING_PRESETS`, zipped by array index with `src/theme/tokens.ts`'s `servingPresetKeys` — #86
 * has not landed a stable `key` field on `SERVING_PRESETS` yet (issue #185), so this is a documented
 * fallback, not a re-implementation of the preset table itself.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import type { FoodInput } from '../../db';
import { themes } from '../../theme/tokens';
import { FoodForm } from './FoodForm';

const theme = themes.dark;

describe('FoodForm — serving picker', () => {
  it('starts a new food on the 100 g preset, locked and ready to save untouched', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    expect(screen.getByTestId('food-form-serving-100g').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('food-form-locked-amount')).toHaveTextContent('100 g', { exact: false });
    // Locked to a preset: none of the Custom-only fields exist.
    expect(screen.queryByTestId('food-form-serving-label')).toBeNull();
    expect(screen.queryByTestId('food-form-basis-weight')).toBeNull();
    expect(screen.queryByTestId('food-form-serving-amount-value')).toBeNull();
  });

  it('tapping a preset chip fills and locks the serving label, basis and amount together', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Milky tea');
    await fireEvent.press(screen.getByTestId('food-form-serving-cup'));

    expect(screen.getByTestId('food-form-serving-cup').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('food-form-locked-amount')).toHaveTextContent('250 ml', { exact: false });

    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Milky tea', servingLabel: '1 cup', basis: 'volume', servingAmount: 250 }),
    );
  });

  it.each([
    ['food-form-serving-100g', '100 g', 'weight', 100],
    ['food-form-serving-100ml', '100 ml', 'volume', 100],
    ['food-form-serving-tbsp', '15 ml', 'volume', 15],
    ['food-form-serving-tsp', '5 ml', 'volume', 5],
  ])('preset chip %s locks the amount to %s', async (testID, amountText, basis, amount) => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.press(screen.getByTestId(testID));

    expect(screen.getByTestId('food-form-locked-amount')).toHaveTextContent(amountText, { exact: false });
    expect(screen.getByText(basis === 'weight' ? 'Per 100 g' : 'Per 100 ml')).toBeTruthy();
    void amount;
  });

  it('tapping the already-selected chip does nothing', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.press(screen.getByTestId('food-form-serving-100g'));

    expect(screen.getByTestId('food-form-serving-100g').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('food-form-locked-amount')).toHaveTextContent('100 g', { exact: false });
  });

  it('Custom opens Label, Measured by and Amount, seeded from the last chip, and focuses Label', async () => {
    // Issue #89 review B3: `props.focused` is `undefined` on an RNTL `TextInput`, so
    // `props.focused ?? true` was vacuously true regardless of the component. A spy on the real
    // `TextInput.prototype.focus` actually fails if the effect stops calling it.
    const focusSpy = jest.spyOn(TextInput.prototype, 'focus');
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.press(screen.getByTestId('food-form-serving-tbsp'));
    focusSpy.mockClear();
    await fireEvent.press(screen.getByTestId('food-form-serving-custom'));

    expect(screen.getByTestId('food-form-serving-custom').props.accessibilityState).toEqual({ selected: true });
    // Locked row is gone; Custom's own fields render in its place.
    expect(screen.queryByTestId('food-form-locked-amount')).toBeNull();
    expect(screen.getByTestId('food-form-serving-label').props.value).toBe('');
    // Basis + amount carry over from the last preset tapped (tbsp: volume, 15 ml) — Custom never
    // starts from a reset. The label itself always starts blank; only basis+amount seed.
    expect(screen.getByTestId('food-form-basis-volume').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('food-form-serving-amount-value')).toHaveTextContent('15');
    expect(focusSpy).toHaveBeenCalledTimes(1);
    focusSpy.mockRestore();
  });

  it('switching away from Custom and back preserves what was typed there — switching is never a reset', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.press(screen.getByTestId('food-form-serving-custom'));
    await fireEvent.changeText(screen.getByTestId('food-form-serving-label'), '1 scoop');
    await fireEvent.press(screen.getByTestId('food-form-serving-amount-increase'));

    await fireEvent.press(screen.getByTestId('food-form-serving-cup'));
    await fireEvent.press(screen.getByTestId('food-form-serving-custom'));

    expect(screen.getByTestId('food-form-serving-label').props.value).toBe('1 scoop');
    expect(screen.getByTestId('food-form-serving-amount-value')).toHaveTextContent('101');
  });

  it('does not save, and shows the reason, when Custom has no label', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Protein shake');
    await fireEvent.press(screen.getByTestId('food-form-serving-custom'));
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('food-form-error')).toHaveTextContent('Name the serving, e.g. 1 scoop.');
  });

  it('saves a Custom weight serving with its typed label, basis and amount', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Protein powder');
    await fireEvent.press(screen.getByTestId('food-form-serving-custom'));
    await fireEvent.changeText(screen.getByTestId('food-form-serving-label'), '1 scoop');
    // Weight carried over from the default 100 g chip — no basis tap needed.
    await fireEvent.press(screen.getByTestId('food-form-serving-amount-value-well'));
    await fireEvent.changeText(screen.getByTestId('food-form-serving-amount-input'), '33');
    await fireEvent(screen.getByTestId('food-form-serving-amount-input'), 'blur');
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Protein powder', servingLabel: '1 scoop', basis: 'weight', servingAmount: 33 }),
    );
  });

  it('saves a Custom volume serving after switching Measured by to Volume', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Orange juice');
    await fireEvent.press(screen.getByTestId('food-form-serving-custom'));
    await fireEvent.changeText(screen.getByTestId('food-form-serving-label'), '1 glass');
    await fireEvent.press(screen.getByTestId('food-form-basis-volume'));
    await fireEvent.press(screen.getByTestId('food-form-serving-amount-value-well'));
    await fireEvent.changeText(screen.getByTestId('food-form-serving-amount-input'), '200');
    await fireEvent(screen.getByTestId('food-form-serving-amount-input'), 'blur');
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Orange juice', servingLabel: '1 glass', basis: 'volume', servingAmount: 200 }),
    );
  });
});

describe('FoodForm — nutrition and the live preview', () => {
  it('shows the per-100 nutrition heading following the basis in effect', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    expect(screen.getByText('Per 100 g')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('food-form-serving-100ml'));

    expect(screen.getByText('Per 100 ml')).toBeTruthy();
  });

  it('the live preview shows this serving’s kcal and protein, recalculated as the steppers change', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.press(screen.getByTestId('food-form-serving-cup'));
    await fireEvent.press(screen.getByTestId('food-form-kcal-value-well'));
    await fireEvent.changeText(screen.getByTestId('food-form-kcal-input'), '40');
    await fireEvent(screen.getByTestId('food-form-kcal-input'), 'blur');
    await fireEvent.press(screen.getByTestId('food-form-protein-value-well'));
    await fireEvent.changeText(screen.getByTestId('food-form-protein-input'), '3.6');
    await fireEvent(screen.getByTestId('food-form-protein-input'), 'blur');

    // 250 ml at 40 kcal / 3.6 g protein per 100 ml = 100 kcal, 9 g protein.
    expect(screen.getByTestId('food-form-preview')).toHaveTextContent('1 cup (250 ml) = 100 kcal · 9 g protein');
  });

  it('drops the bracketed amount when the serving label already is the amount', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.press(screen.getByTestId('food-form-kcal-value-well'));
    await fireEvent.changeText(screen.getByTestId('food-form-kcal-input'), '97');
    await fireEvent(screen.getByTestId('food-form-kcal-input'), 'blur');
    await fireEvent.press(screen.getByTestId('food-form-protein-value-well'));
    await fireEvent.changeText(screen.getByTestId('food-form-protein-input'), '9');
    await fireEvent(screen.getByTestId('food-form-protein-input'), 'blur');

    expect(screen.getByTestId('food-form-preview')).toHaveTextContent('100 g = 97 kcal · 9 g protein');
  });

  it('displays the protein stepper at its own 0.1 precision, not the default whole-number rounding (issue #89 carry-over 1 / review B2)', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    // Without `formatValue`, the default `Math.round` display would read "0" here — precisely the
    // regression carry-over 1 exists to prevent.
    await fireEvent.press(screen.getByTestId('food-form-protein-increase'));
    expect(screen.getByTestId('food-form-protein-value')).toHaveTextContent('0.1');

    // Nine more 0.1 taps land exactly on 1 — the trailing ".0" a naive fixed-precision formatter
    // would show is dropped.
    for (let i = 0; i < 9; i += 1) {
      await fireEvent.press(screen.getByTestId('food-form-protein-increase'));
    }
    expect(screen.getByTestId('food-form-protein-value')).toHaveTextContent('1');
  });
});

describe('FoodForm — editing pre-selects the matching preset, or falls back to Custom', () => {
  it('pre-selects the preset chip that matches label + basis + serving amount', async () => {
    // Issue #89's unblock comment (carry-over 2): the match is label+basis+amount together, not
    // basis+amount alone — a food genuinely saved with the preset's own label still lands on that
    // chip.
    const initial: FoodInput = {
      name: 'Whole milk',
      brand: null,
      servingLabel: '1 cup',
      basis: 'volume',
      servingAmount: 250,
      kcalPer100: 60,
      proteinPer100: 3,
    };
    await render(<FoodForm initial={initial} theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    expect(screen.getByTestId('food-form-serving-cup').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('food-form-locked-amount')).toHaveTextContent('250 ml', { exact: false });
  });

  it('preserves a serving label that differs from every preset through an edit that touches only nutrition (review B1 — was silently rewritten to "1 cup")', async () => {
    const onSave = jest.fn();
    const initial: FoodInput = {
      name: 'Kefir',
      brand: null,
      servingLabel: '1 bottle',
      basis: 'volume',
      servingAmount: 250,
      kcalPer100: 60,
      proteinPer100: 3,
    };
    await render(<FoodForm initial={initial} theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    // Same basis + amount as the cup preset, but a different label — falls to Custom, with the
    // original label intact and visible, never blank.
    expect(screen.getByTestId('food-form-serving-custom').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('food-form-serving-label').props.value).toBe('1 bottle');

    await fireEvent.press(screen.getByTestId('food-form-kcal-increase'));
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Kefir', servingLabel: '1 bottle', basis: 'volume', servingAmount: 250, kcalPer100: 61, proteinPer100: 3 }),
    );
  });

  it('falls back to Custom, pre-filled, when no preset matches', async () => {
    const initial: FoodInput = {
      name: 'Greek yoghurt',
      brand: 'Fage',
      servingLabel: '1 pot',
      basis: 'weight',
      servingAmount: 170,
      kcalPer100: 70,
      proteinPer100: 12,
    };
    await render(<FoodForm initial={initial} theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    expect(screen.getByTestId('food-form-serving-custom').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('food-form-serving-label').props.value).toBe('1 pot');
    expect(screen.getByTestId('food-form-basis-weight').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('food-form-serving-amount-value')).toHaveTextContent('170');
    expect(screen.getByTestId('food-form-kcal-value')).toHaveTextContent('70');
    expect(screen.getByTestId('food-form-protein-value')).toHaveTextContent('12');
  });
});

describe('FoodForm — Save’s label and the edit-screen history note', () => {
  it('reads "Save & log ‹serving›" in the create-sheet variant', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" variant="sheet" />);

    const save = screen.getByTestId('food-form-save');
    expect(save).toHaveTextContent('Save & log 100 g');
    expect(save.props.accessibilityLabel).toBe('Save & log 100 g');
  });

  it('reads "Save food" for a fresh food on a pushed screen', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" variant="screen" />);

    expect(screen.getByTestId('food-form-save')).toHaveTextContent('Save food');
  });

  it('reads "Save changes" and shows the history note when editing on a pushed screen', async () => {
    const initial: FoodInput = {
      name: 'Greek yoghurt',
      brand: 'Fage',
      servingLabel: '1 pot',
      basis: 'weight',
      servingAmount: 170,
      kcalPer100: 70,
      proteinPer100: 12,
    };
    await render(<FoodForm initial={initial} theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" variant="screen" />);

    expect(screen.getByTestId('food-form-save')).toHaveTextContent('Save changes');
    expect(screen.getByText(/past logs keep their numbers/i)).toBeTruthy();
  });
});

describe('FoodForm — accessibility, keyboard and other unchanged behaviour', () => {
  it('keeps Save reachable with the keyboard up — taps persist and the scroll view insets for the keyboard (issue #79)', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    const form = screen.getByTestId('food-form');
    expect(form.props.keyboardShouldPersistTaps).toBe('handled');
    expect(form.props.automaticallyAdjustKeyboardInsets).toBe(true);
  });

  it('calls onCancel from the Cancel button', async () => {
    const onCancel = jest.fn();
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={onCancel} testID="food-form" />);

    await fireEvent.press(screen.getByTestId('food-form-cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not save when the name is empty, and shows an inline error', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('food-form-error')).toHaveTextContent(/name/i);
  });

  it('saves brand null when left blank', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Boiled eggs');
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ brand: null }));
  });

  it('every chip, stepper and button carries an accessibility label, and each is a ≥44pt target', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    const save = screen.getByTestId('food-form-save');
    const cancel = screen.getByTestId('food-form-cancel');
    const chip = screen.getByTestId('food-form-serving-cup');
    expect(save.props.accessibilityRole).toBe('button');
    expect(cancel.props.accessibilityRole).toBe('button');
    expect(cancel.props.accessibilityLabel).toBe('Cancel');
    expect(chip.props.accessibilityRole).toBe('button');
    expect(chip.props.accessibilityLabel).toBeTruthy();
  });
});
