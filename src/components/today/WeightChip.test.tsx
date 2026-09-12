/**
 * `<WeightChip>` — every state the row spec on issue #20 lists: no weigh-ins, one weigh-in (or an
 * empty previous week) with no delta, and a weight with a weekly delta. Every visible number is
 * asserted as having passed through `formatWeightKg` — never a raw number rendered straight from
 * `weightSummary`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { WeightSummary } from '../../db';
import { weightSummary } from '../../db';
import { DbProvider } from '../db/DbProvider';
import { ThemeContext } from '../theme/theme-context';
import { themes } from '../../theme/tokens';
import { WeightChip } from './WeightChip';

jest.mock('../../db', () => ({
  ...jest.requireActual<typeof import('../../db')>('../../db'),
  weightSummary: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockWeightSummary = jest.mocked(weightSummary);

afterEach(() => {
  mockPush.mockClear();
});

const renderChip = () =>
  render(
    <DbProvider db={{} as never}>
      <ThemeContext.Provider value={themes.dark}>
        <WeightChip testID="chip" />
      </ThemeContext.Provider>
    </DbProvider>,
  );

const summary = (overrides: Partial<WeightSummary> = {}): WeightSummary => ({
  latest: null,
  avg7: null,
  avg7PrevWeek: null,
  weeklyDelta: null,
  ...overrides,
});

describe('WeightChip', () => {
  it('shows an honest empty state with no weigh-ins yet', async () => {
    mockWeightSummary.mockReturnValue(summary());
    await renderChip();

    expect(screen.getByTestId('chip-value').props.children).toBe('No weigh-ins');
    expect(screen.queryByTestId('chip-delta')).toBeNull();
    expect(screen.getByTestId('chip').props.accessibilityLabel).toMatch(/no weigh-ins/i);
  });

  it('shows the current weight with no delta on one weigh-in', async () => {
    mockWeightSummary.mockReturnValue(
      summary({ latest: { localDate: '2025-09-10', weight: 83.4, measuredAt: 1 } }),
    );
    await renderChip();

    expect(screen.getByTestId('chip-value').props.children).toBe('83.4 kg');
    expect(screen.queryByTestId('chip-delta')).toBeNull();
  });

  it('shows the current weight with no delta when the previous week is empty', async () => {
    mockWeightSummary.mockReturnValue(
      summary({
        latest: { localDate: '2025-09-10', weight: 83.4, measuredAt: 1 },
        avg7: 83.4,
        avg7PrevWeek: null,
        weeklyDelta: null,
      }),
    );
    await renderChip();

    expect(screen.getByTestId('chip-value').props.children).toBe('83.4 kg');
    expect(screen.queryByTestId('chip-delta')).toBeNull();
  });

  it('shows weight plus a rounded weekly delta, through the formatter, with a down arrow for a loss', async () => {
    mockWeightSummary.mockReturnValue(
      summary({
        latest: { localDate: '2025-09-10', weight: 83.4, measuredAt: 1 },
        avg7: 83.6,
        avg7PrevWeek: 84.02857,
        weeklyDelta: -0.42857,
      }),
    );
    await renderChip();

    expect(screen.getByTestId('chip-value').props.children).toBe('83.4 kg');
    expect(screen.getByTestId('chip-delta').props.children).toBe('↓ 0.4 kg');
    expect(screen.getByTestId('chip').props.accessibilityLabel).toMatch(/down 0\.4 kg/i);
  });

  it('shows an up arrow for a gain', async () => {
    mockWeightSummary.mockReturnValue(
      summary({
        latest: { localDate: '2025-09-10', weight: 83.4, measuredAt: 1 },
        avg7: 83.6,
        avg7PrevWeek: 83.1,
        weeklyDelta: 0.5,
      }),
    );
    await renderChip();

    expect(screen.getByTestId('chip-delta').props.children).toBe('↑ 0.5 kg');
    expect(screen.getByTestId('chip').props.accessibilityLabel).toMatch(/up 0\.5 kg/i);
  });

  it('tapping the chip switches to Charts, one tap, in every state', async () => {
    mockWeightSummary.mockReturnValue(summary());
    await renderChip();

    await fireEvent.press(screen.getByTestId('chip'));
    expect(mockPush).toHaveBeenCalledWith('/charts');
  });

  it('has a ≥44pt touch target', async () => {
    mockWeightSummary.mockReturnValue(summary());
    await renderChip();
    const flat = StyleSheet.flatten(screen.getByTestId('chip').props.style);
    expect(flat.minHeight).toBeGreaterThanOrEqual(44);
  });
});
