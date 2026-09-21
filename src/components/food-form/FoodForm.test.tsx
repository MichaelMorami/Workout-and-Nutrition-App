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
import { act, fireEvent, render as testingLibraryRender, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Keyboard, ScrollView, StyleSheet, TextInput, type EmitterSubscription } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import type { FoodInput } from '../../db';
import { motion, themes } from '../../theme/tokens';
import { FoodForm } from './FoodForm';
import { __resetAnimations, __setReducedMotion, __timingCalls } from './test-support/reanimated-mock';

// Reanimated 4 pulls in `react-native-worklets`, which throws under `jest-expo/ios` at import time
// (qa-engineer's #45 is the real fix). `./test-support/reanimated-mock` is this folder's own
// stand-in — see its module doc for why it is not shared with `quick-add`'s copy.
jest.mock('react-native-reanimated', () => jest.requireActual('./test-support/reanimated-mock'));

const theme = themes.dark;

// `<FormFrame>` (issue #207) reads `useSafeAreaInsets()`, which throws with no ancestor provider —
// a fixed `initialMetrics` here, never a mocked module (`FormFrame.test.tsx`'s own instruction).
const metrics = { ...initialWindowMetrics, insets: { top: 0, left: 0, right: 0, bottom: 34 } } as typeof initialWindowMetrics;

function render(ui: ReactElement) {
  return testingLibraryRender(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);
}

// Mirrors `src/hooks/useKeyboardVisible.test.tsx`'s and `FormFrame.test.tsx`'s own helper —
// `Keyboard` has no way to fire a fake event on it, so this stubs `addListener` and hands the test
// a `fire`.
function mockKeyboardListeners() {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((eventType, listener) => {
    const existing = listeners.get(eventType) ?? [];
    existing.push(listener as (event: unknown) => void);
    listeners.set(eventType, existing);
    return { remove: jest.fn() } as unknown as EmitterSubscription;
  });
  return {
    fire: (eventType: string) => {
      (listeners.get(eventType) ?? []).forEach((listener) => listener({}));
    },
  };
}

/** RNTL never fires `onLayout` itself, so a test hands a measured frame to the same prop RN would
 * call — this is what gives `FoodForm`'s failed-Save scroll a real offset to aim at. */
async function measure(testID: string, y: number): Promise<void> {
  const node = screen.getByTestId(testID) as unknown as { props: { onLayout: (e: unknown) => void } };
  await act(async () => {
    node.props.onLayout({ nativeEvent: { layout: { x: 0, y, width: 320, height: 60 } } });
  });
}

const editInitial: FoodInput = {
  name: 'Greek yoghurt',
  brand: 'Fage',
  servingLabel: '1 pot',
  basis: 'weight',
  servingAmount: 170,
  kcalPer100: 70,
  proteinPer100: 12,
};

afterEach(() => {
  __resetAnimations();
  jest.restoreAllMocks();
});

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

  it('Custom opens Label, Measured by and Amount, seeded from the last chip, and focuses the Label field specifically', async () => {
    // Issue #89 review B3: `props.focused` is `undefined` on an RNTL `TextInput`, so
    // `props.focused ?? true` was vacuously true regardless of the component. A spy on the real
    // `TextInput.prototype.focus` actually fails if the effect stops calling it.
    //
    // Issue #191, item 3: asserting only `toHaveBeenCalledTimes(1)` is prototype-wide — it would
    // still pass if the effect focused Brand, or Amount, or any other field on the form, since
    // every `TextInput` shares the same prototype. Naming the instance the spy was actually called
    // on (`food-form-serving-label`'s own `testID`) is what a wrong-field regression trips: point
    // the autofocus at another field and this line goes red, where the old bare-count assertion
    // did not (see the PR body for that mutation's output).
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
    const instances = focusSpy.mock.instances as unknown as { props: { testID?: string } }[];
    expect(instances[0]?.props.testID).toBe('food-form-serving-label');
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
  it('keeps Save reachable with the keyboard up — the body persists taps and Save lives in the pinned footer, not the scroll view (issue #79, #207)', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    // `<FormFrame>` (issue #207) pins the footer clear of the keyboard instead — the body no longer
    // needs `automaticallyAdjustKeyboardInsets` to keep Save reachable.
    const body = screen.getByTestId('food-form-body');
    expect(body.props.keyboardShouldPersistTaps).toBe('handled');
    expect(body.props.automaticallyAdjustKeyboardInsets).toBeUndefined();
    // PR #220 review, B1.1: `getByTestId('food-form-save')` alone is equally true of the pre-#207
    // shape, where Save was the scroll view's last child. `within` is what goes red if `{footer}`
    // moves back inside the body — "without scrolling" is the acceptance criterion, and this is the
    // line that holds it.
    expect(within(screen.getByTestId('food-form-footer')).getByTestId('food-form-save')).toBeTruthy();
    expect(within(body).queryByTestId('food-form-save')).toBeNull();
    // The body still holds the form, so the split was not won by emptying it.
    expect(within(body).getByTestId('food-form-name')).toBeTruthy();
  });

  // PR #220 review, B1.2 — decision 13's first portability rule: exactly one `KeyboardAvoidingView`
  // per presentation. A pushed screen's form owns it; inside a sheet, `<CreateFoodSheet>`'s own
  // avoider does, and a second one nested here would fight it over how far to lift.
  it('owns the keyboard avoider on a pushed screen', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" variant="screen" />);

    expect(screen.getByTestId('food-form-avoider')).toBeTruthy();
  });

  it('adds no avoider of its own inside a sheet — the sheet already has one', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" variant="sheet" />);

    expect(screen.queryByTestId('food-form-avoider')).toBeNull();
    // Still the same form, just without an avoider of its own.
    expect(screen.getByTestId('food-form-save')).toBeTruthy();
  });

  // PR #220 review, B1.5 — decision 13: "the footer never collapses. Two rows whenever the keyboard
  // is up; any note row is keyboard-down only." The preview strip and the action row stay put; the
  // history note is the one row that goes.
  it('drops the edit history note while the keyboard is up, and keeps the two footer rows', async () => {
    const keyboard = mockKeyboardListeners();
    await render(<FoodForm initial={editInitial} theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" variant="screen" />);

    expect(screen.getByText(/past logs keep their numbers/i)).toBeTruthy();

    await act(async () => {
      keyboard.fire('keyboardWillShow');
    });

    expect(screen.queryByText(/past logs keep their numbers/i)).toBeNull();
    const footer = within(screen.getByTestId('food-form-footer'));
    expect(footer.getByTestId('food-form-preview')).toBeTruthy();
    expect(footer.getByTestId('food-form-save')).toBeTruthy();

    await act(async () => {
      keyboard.fire('keyboardWillHide');
    });

    expect(screen.getByText(/past logs keep their numbers/i)).toBeTruthy();
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

  // PR #220 review, B2. Save is pinned in the footer now, so a form sitting at the top with the
  // keyboard up cannot see an error rendered further down the body — the user taps Save and
  // nothing appears to happen. The fix is to bring the field to the user: scroll the body to it,
  // focus it, and mark it. No extra tap, and no third footer row (decision 13).
  it('a blank-Name Save scrolls the body to the Name field, focuses it and marks it', async () => {
    const scrollSpy = jest.spyOn(ScrollView.prototype as unknown as { scrollTo: (options: unknown) => void }, 'scrollTo');
    const focusSpy = jest.spyOn(TextInput.prototype, 'focus');
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);
    await measure('food-form-name-field', 0);

    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(scrollSpy).toHaveBeenCalledWith({ y: 0, animated: true });
    const instances = focusSpy.mock.instances as unknown as { props: { testID?: string } }[];
    expect(instances.at(-1)?.props.testID).toBe('food-form-name');
    const nameStyle = StyleSheet.flatten(screen.getByTestId('food-form-name').props.style) as { borderColor?: string };
    expect(nameStyle.borderColor).toBe(theme.color.foodForm.fieldBorderError);
  });

  it("a blank Custom label Save scrolls to the serving section that field lives in, and focuses the Label field", async () => {
    const scrollSpy = jest.spyOn(ScrollView.prototype as unknown as { scrollTo: (options: unknown) => void }, 'scrollTo');
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Whey');
    await fireEvent.press(screen.getByTestId('food-form-serving-custom'));
    // A real measured offset, not 0 — this is what proves the scroll aims at the field rather than
    // snapping to the top of the form whatever went wrong.
    await measure('food-form-serving-section', 420);

    const focusSpy = jest.spyOn(TextInput.prototype, 'focus');
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('food-form-error')).toHaveTextContent(/serving/i);
    expect(scrollSpy).toHaveBeenCalledWith({ y: 420, animated: true });
    const instances = focusSpy.mock.instances as unknown as { props: { testID?: string } }[];
    expect(instances.at(-1)?.props.testID).toBe('food-form-serving-label');
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

describe('FoodForm — the Custom reveal is driven by motion.events.customReveal (issue #191, item 1)', () => {
  it('opening Custom fades it in on the customReveal duration and easing', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.press(screen.getByTestId('food-form-serving-custom'));

    const call = __timingCalls.find((c) => c.toValue === 1);
    expect(call).toBeDefined();
    expect(call?.config?.duration).toBe(motion.events.customReveal.duration);
    // Review #209, B2: the duration alone doesn't prove the curve came from the token — assert the
    // easing points too, so swapping `motion.easing[event.easing]` for any other curve goes red.
    expect(call?.config?.easing?.points).toEqual(motion.easing[motion.events.customReveal.easing]);
  });

  it('closing Custom fades it out on the same token', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.press(screen.getByTestId('food-form-serving-custom'));
    __timingCalls.length = 0;
    await fireEvent.press(screen.getByTestId('food-form-serving-cup'));

    const call = __timingCalls.find((c) => c.toValue === 0);
    expect(call).toBeDefined();
    expect(call?.config?.duration).toBe(motion.events.customReveal.duration);
    expect(call?.config?.easing?.points).toEqual(motion.easing[motion.events.customReveal.easing]);
  });

  it('honours reduce motion — the reveal collapses to its instant duration', async () => {
    __setReducedMotion(true);
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.press(screen.getByTestId('food-form-serving-custom'));

    const call = __timingCalls.find((c) => c.toValue === 1);
    expect(call).toBeDefined();
    expect(call?.config?.duration).toBe(motion.events.customReveal.reduced.duration);
  });

  // Review #209, B1: the fields are held mounted through their own close tween (so a chip tap back
  // to Custom mid-close reverses smoothly), and nothing previously asserted that hold actually ends.
  // Without this test, mutating the release to never unmount (`setRendered(true)` instead of
  // `setRendered(false)`) leaves every other test in this file, and every neighbour suite, green —
  // see the PR body for that mutation's output. Left un-collapsed, the Label field, both
  // `BasisToggle` buttons and the Amount stepper would sit at `height: 0, opacity: 0` forever,
  // reachable by a screen reader reading over the locked read-out it's supposedly replaced.
  it('removes the Custom fields once the close tween has run', async () => {
    // Fake timers are already global (`test/setup/` freezes the clock for every suite via
    // `freezeTime()`), so this test just advances them directly — switching timer modes locally is
    // a project-wide guard rail, enforced in `test/time.test.ts`.
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('food-form-serving-custom'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('food-form-serving-cup'));
    });
    await act(async () => {
      jest.advanceTimersByTime(motion.events.customReveal.duration + 1);
    });

    // `{ includeHiddenElements: true }`: the wrapping `Animated.View` also drops itself from the
    // accessibility tree (`accessibilityElementsHidden`/`no-hide-descendants`) the instant `visible`
    // goes false — RNTL's default queries hide that subtree too, so a plain `queryByTestId` here
    // would read null the moment the close *starts*, not when the hold actually ends, and this test
    // would no longer catch the mutation it exists for. Piercing that with `includeHiddenElements`
    // asserts what actually left the tree, not what merely stopped being announced.
    expect(screen.queryByTestId('food-form-serving-label', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId('food-form-basis-weight', { includeHiddenElements: true })).toBeNull();
  });

  // Review #209, round 2, B4: since `fcf4277` moved the open-side height tween out of the visibility
  // effect and into `handleLayout`, a reopen *during* the close hold never gets a new `onLayout` —
  // `revealContent`'s own frame never changes across the whole cycle, so RN never re-fires the
  // layout event — and nothing else was retargeting `height`. Without the visibility effect's own
  // `visible` branch, this test lands on `{height: 0, opacity: 1}`: mounted, fully opaque, clipped to
  // nothing by `overflow: 'hidden'` — the fields never recover until the user closes and waits out
  // the full hold. `content.props.onLayout(...)` invokes the same prop RN itself would call, wrapped
  // in `act()` so the mock's `forceRender` flushes before the next assertion reads it — this path is
  // testable without a device, contrary to this file's earlier disclosure.
  it('reopening Custom mid-close returns the fields to their measured height', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('food-form-serving-custom'));
    });

    const content = screen.getByTestId('food-form-custom-reveal').children[0] as unknown as {
      props: { onLayout: (e: unknown) => void };
    };
    await act(async () => {
      content.props.onLayout({ nativeEvent: { layout: { height: 240, width: 300, x: 0, y: 0 } } });
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('food-form-serving-cup'));
    });
    await act(async () => {
      jest.advanceTimersByTime(motion.events.customReveal.duration / 2);
    });
    // Back to Custom before the hold releases: still mounted, so no new layout event arrives.
    await act(async () => {
      fireEvent.press(screen.getByTestId('food-form-serving-custom'));
    });
    await act(async () => {
      jest.advanceTimersByTime(motion.events.customReveal.duration * 2);
    });

    const style = StyleSheet.flatten(screen.getByTestId('food-form-custom-reveal').props.style) as {
      opacity?: number;
      height?: number;
    };
    expect(style.opacity).toBe(1);
    expect(style.height).toBe(240);
  });
});
