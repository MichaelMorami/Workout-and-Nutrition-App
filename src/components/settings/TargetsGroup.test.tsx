/**
 * `<TargetsGroup>` — issue #44's "TARGETS" group on the Settings screen: kcal and protein targets
 * through `getSettings`/`updateSettings`, a stepper (its own 50 kcal / 5 g step, unchanged by
 * `docs/decisions.md` ruling 11 — only the tap-to-type/hold-to-accelerate mechanics are shared with
 * `<FoodForm>`) to change either one, and "Set" in place of a number on day one — before
 * `updateSettings` has ever been called, per `SettingsView.isDefault`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { getSettings, updateSettings, type SettingsView } from '../../db';
import { themes } from '../../theme/tokens';
import { TargetsGroup } from './TargetsGroup';

jest.mock('../../db', () => ({
  ...jest.requireActual<typeof import('../../db')>('../../db'),
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
}));

const mockGetSettings = jest.mocked(getSettings);
const mockUpdateSettings = jest.mocked(updateSettings);

const theme = themes.dark;
const db = {} as never;

const DEFAULT_VIEW: SettingsView = { kcalTarget: 2000, proteinTarget: 150, weekStart: 1, isDefault: true };
const SET_VIEW: SettingsView = { kcalTarget: 2400, proteinTarget: 180, weekStart: 1, isDefault: false };

afterEach(() => {
  mockGetSettings.mockReset();
  mockUpdateSettings.mockReset();
});

describe('TargetsGroup', () => {
  it('day one (isDefault) shows "Set" for both targets instead of a number', async () => {
    mockGetSettings.mockReturnValue(DEFAULT_VIEW);

    await render(<TargetsGroup db={db} theme={theme} testID="targets" />);

    expect(screen.getByTestId('targets-kcal-value')).toHaveTextContent('Set');
    expect(screen.getByTestId('targets-protein-value')).toHaveTextContent('Set');
  });

  it('renders the saved targets once they have been set', async () => {
    mockGetSettings.mockReturnValue(SET_VIEW);

    await render(<TargetsGroup db={db} theme={theme} testID="targets" />);

    expect(screen.getByTestId('targets-kcal-value')).toHaveTextContent('2,400 kcal');
    expect(screen.getByTestId('targets-protein-value')).toHaveTextContent('180 g');
  });

  // Renamed from "...with steppers, no keyboard" — ruling 11 (docs/decisions.md) means a keyboard
  // is one tap away here too (tap-to-type), just not the default view this test checks.
  it('tapping a row opens the targets sheet with steppers', async () => {
    mockGetSettings.mockReturnValue(SET_VIEW);
    await render(<TargetsGroup db={db} theme={theme} testID="targets" />);

    await fireEvent.press(screen.getByTestId('targets-kcal'));

    expect(screen.getByTestId('targets-sheet')).toBeTruthy();
    expect(screen.getByTestId('targets-sheet-kcal-increase')).toBeTruthy();
    expect(screen.getByTestId('targets-sheet-protein-increase')).toBeTruthy();
  });

  it('a stepper tap persists immediately through updateSettings — no save button', async () => {
    mockGetSettings.mockReturnValue(SET_VIEW);
    mockUpdateSettings.mockReturnValue({ ...SET_VIEW, kcalTarget: 2450, isDefault: false });
    await render(<TargetsGroup db={db} theme={theme} testID="targets" />);
    await fireEvent.press(screen.getByTestId('targets-kcal'));

    await fireEvent.press(screen.getByTestId('targets-sheet-kcal-increase'));

    expect(mockUpdateSettings).toHaveBeenCalledWith(db, expect.objectContaining({ kcalTarget: 2450 }));
    expect(screen.getByTestId('targets-kcal-value')).toHaveTextContent('2,450 kcal');
  });

  it('a protein stepper tap patches only proteinTarget', async () => {
    mockGetSettings.mockReturnValue(SET_VIEW);
    mockUpdateSettings.mockReturnValue({ ...SET_VIEW, proteinTarget: 185, isDefault: false });
    await render(<TargetsGroup db={db} theme={theme} testID="targets" />);
    await fireEvent.press(screen.getByTestId('targets-protein'));

    await fireEvent.press(screen.getByTestId('targets-sheet-protein-increase'));

    expect(mockUpdateSettings).toHaveBeenCalledWith(db, expect.objectContaining({ proteinTarget: 185 }));
    expect(mockUpdateSettings).not.toHaveBeenCalledWith(db, expect.objectContaining({ kcalTarget: expect.anything() }));
    expect(screen.getByTestId('targets-protein-value')).toHaveTextContent('185 g');
  });

  it('closing the sheet dismisses it without another write', async () => {
    mockGetSettings.mockReturnValue(SET_VIEW);
    await render(<TargetsGroup db={db} theme={theme} testID="targets" />);
    await fireEvent.press(screen.getByTestId('targets-kcal'));

    await fireEvent.press(screen.getByTestId('targets-sheet-done'));

    expect(screen.queryByTestId('targets-sheet')).toBeNull();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('every row is an accessible, labelled button with a real target', async () => {
    mockGetSettings.mockReturnValue(SET_VIEW);
    await render(<TargetsGroup db={db} theme={theme} testID="targets" />);

    const kcalRow = screen.getByTestId('targets-kcal');
    expect(kcalRow.props.accessibilityRole).toBe('button');
    expect(kcalRow.props.accessibilityLabel).toBe('Daily calories, 2,400 kcal');

    const proteinRow = screen.getByTestId('targets-protein');
    expect(proteinRow.props.accessibilityRole).toBe('button');
    expect(proteinRow.props.accessibilityLabel).toBe('Daily protein, 180 g');
  });

  it('the day-one row carries a "not set" accessibility label', async () => {
    mockGetSettings.mockReturnValue(DEFAULT_VIEW);
    await render(<TargetsGroup db={db} theme={theme} testID="targets" />);

    expect(screen.getByTestId('targets-kcal').props.accessibilityLabel).toBe('Daily calories, not set');
  });
});
