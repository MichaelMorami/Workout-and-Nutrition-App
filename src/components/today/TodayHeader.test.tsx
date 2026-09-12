/**
 * `<TodayHeader>` — the date header plus the calorie/protein rings (issue #41).
 *
 * `<ProgressArc>`'s inner text nodes (`arc-value`, `arc-caption`, `arc-target-text`, ...) carry
 * fixed testIDs of their own (not derived from the `testID` prop), so with two rings mounted at
 * once every query below is scoped with `within()` against each ring's own root testID
 * (`${testID}-kcal-arc` / `${testID}-protein-arc`) rather than a bare `getByTestId`.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { themes } from '../../theme/tokens';
import { TodayHeader } from './TodayHeader';
import { __resetAnimations } from './test-support/reanimated-mock';

jest.mock('react-native-reanimated', () => jest.requireActual('./test-support/reanimated-mock'));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

afterEach(() => {
  __resetAnimations();
  mockPush.mockClear();
});

// Wed 10 Sep 2025, 16:12 UTC.
const AT = Date.UTC(2025, 8, 10, 16, 12);

const header = (props: Partial<React.ComponentProps<typeof TodayHeader>> = {}) => (
  <TodayHeader
    kcal={1240}
    protein={96}
    kcalTarget={2400}
    proteinTarget={180}
    isDefault={false}
    at={AT}
    timeZone="UTC"
    theme={themes.dark}
    locale="en-GB"
    testID="header"
    {...props}
  />
);

describe('TodayHeader', () => {
  it("renders today's date, in the given zone and locale", async () => {
    await render(header());
    expect(screen.getByTestId('header-date').props.children).toBe('Wed 10 Sept');
  });

  it('feeds the kcal ring the running total against the kcal target', async () => {
    await render(header({ kcal: 1240, kcalTarget: 2400 }));
    const ring = within(screen.getByTestId('header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,240');
    expect(ring.getByTestId('arc-target-text').props.children).toBe('of 2,400');
  });

  it('feeds the protein ring the running total against the protein target', async () => {
    await render(header({ protein: 96, proteinTarget: 180 }));
    const ring = within(screen.getByTestId('header-protein-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('96');
    expect(ring.getByTestId('arc-target-text').props.children).toBe('of 180 g');
  });

  it('draws both rings honestly empty and offers a one-tap "Set" when isDefault, not the placeholder target', async () => {
    await render(header({ isDefault: true, kcalTarget: 2000, proteinTarget: 150 }));

    const kcalRing = within(screen.getByTestId('header-kcal-arc'));
    expect(kcalRing.getByTestId('arc-caption').props.children).toBe('No target set');
    expect(kcalRing.queryByTestId('arc-target-text')).toBeNull();

    const proteinRing = within(screen.getByTestId('header-protein-arc'));
    expect(proteinRing.getByTestId('arc-caption').props.children).toBe('No target set');

    expect(screen.getByTestId('header-set-targets').props.accessibilityLabel).toMatch(/not set/i);
  });

  it('shows no "Set" affordance once real targets exist', async () => {
    await render(header({ isDefault: false }));
    expect(screen.queryByTestId('header-set-targets')).toBeNull();
  });

  it('tapping "Set" switches to Settings, one tap, no intermediate screen', async () => {
    await render(header({ isDefault: true }));
    await fireEvent.press(screen.getByTestId('header-set-targets'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });
});
