/**
 * The component project's smoke test.
 *
 * `jest-expo/ios` is a different runtime from the data project's: React Native's module registry,
 * a jsdom-free environment, and a transform that has to handle JSX and RN's own ESM packages. This
 * file exists so that breakage in *that* setup is a one-line failure here, rather than something
 * `ui-engineer` discovers halfway through writing a screen.
 *
 * It also asserts that everything the data suite relies on — the frozen clock, the fixed timezone,
 * the custom matchers, the factories — is present on this side too. A screen test and a query test
 * disagreeing about what day it is would be a very expensive afternoon.
 *
 * NOTE FOR ANYONE WRITING A COMPONENT TEST: on `@testing-library/react-native` 14 with React 19,
 * `render()` is **async**. It returns a Promise, so `await` it. Forgetting to produces a passing
 * `render(...)` line followed by "`render` function has not been called" from every query, which
 * reads like a setup problem and is not one.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text, View } from 'react-native';
import { makeLogEntry } from './factories';
import { DEFAULT_TEST_TZ, FROZEN_NOW, today } from './time';

/** The smallest thing that exercises JSX, the RN component registry and the testing library. */
function DayHeading({ localDate, kcal }: { localDate: string; kcal: number }): React.JSX.Element {
  return (
    <View>
      <Text>{localDate}</Text>
      <Text accessibilityRole="text">{`${kcal} kcal`}</Text>
    </View>
  );
}

describe('the component test harness', () => {
  it('renders a React Native tree and finds text in it', async () => {
    await render(<DayHeading localDate="2025-03-09" kcal={2096} />);

    expect(screen.getByText('2025-03-09')).toBeTruthy();
    expect(screen.getByText('2096 kcal')).toBeTruthy();
  });

  it('fails to find text that is not rendered', async () => {
    // Without this, "getByText found it" could just mean the query never looks.
    await render(<DayHeading localDate="2025-03-09" kcal={2096} />);
    expect(screen.queryByText('2025-03-10')).toBeNull();
  });

  it('re-renders with new props', async () => {
    const view = await render(<DayHeading localDate="2025-03-09" kcal={2096} />);
    await view.rerender(<DayHeading localDate="2025-03-09" kcal={1850} />);

    expect(screen.getByText('1850 kcal')).toBeTruthy();
    expect(screen.queryByText('2096 kcal')).toBeNull();
  });

  it('cleans up between tests, so the previous render is gone', () => {
    // Auto-cleanup resets `screen` to its uninitialised state rather than to an empty tree, so the
    // proof that the previous test's render is gone is that querying it complains at all.
    expect(() => screen.queryByText('2025-03-09')).toThrow(/`render` function has not been called/);
  });

  it('runs on the same frozen clock as the data suite', () => {
    expect(Date.now()).toBe(FROZEN_NOW);
  });

  it('runs in the same timezone as the data suite', () => {
    expect(process.env.TZ).toBe(process.env.VITALS_TEST_TZ ?? DEFAULT_TEST_TZ);
    expect(today()).toBe('2025-03-09');
  });

  it('has the domain matchers registered', () => {
    const entry = makeLogEntry({ kcal: 214, protein: 21 });
    expect(entry).toBeOnLocalDate('2025-03-09');
    expect([entry]).toHaveDailyTotal('2025-03-09', { kcal: 214, protein: 21 });
  });
});
