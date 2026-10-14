/**
 * `sharedTabBarOptions` is the tab bar's chrome, kept as a pure function so this test doesn't need
 * a router harness to exercise it. Per the tech-lead hand-off on #20: no blur (that would need
 * `expo-blur`, an undiscussed native dependency) and the light theme's 0.92 opacity — which this
 * test proves comes from the token, not a value repeated here.
 *
 * `tabBarIcon` (issue #81) is kept just as pure: it returns the small component `Tabs.Screen`
 * hands to `tabBarIcon`, so a test can render it directly — no router harness, no full `<Tabs>`
 * mount — and assert the actual rendered `Ionicons` element, not just that the code exists.
 */
/**
 * `<CarouselRoot>`/the default export's carousel wiring (issue #82): `Tabs`/`Tabs.Screen` are
 * stubbed the same way `app/meals/new.test.tsx` stubs `Stack.Screen` — a real `Tabs` needs a
 * `NavigationContainer` this test has no reason to stand up, when all that matters here is that
 * `TabLayout` renders it *inside* the carousel's gesture view, not the reverse order (the carousel
 * must be an ancestor so `DayLogRow`'s own, deeper `PanResponder` gets bubble-phase first refusal —
 * `useTabCarousel`'s own module note). `useTabCarousel` itself is mocked so this file asserts only
 * the wiring — the hook's own behaviour is `useTabCarousel.test.tsx`'s job.
 */
jest.mock('react-native-reanimated', () => jest.requireActual('../../src/components/navigation/test-support/reanimated-mock'));

const mockPanHandlers = { onMoveShouldSetResponder: jest.fn(() => false) };
const mockDragX = { value: -7 };
jest.mock('../../src/hooks/useTabCarousel', () => ({
  useTabCarousel: () => ({ dragX: mockDragX, panHandlers: mockPanHandlers }),
}));
jest.mock('expo-router', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  function Tabs({ children }: { children?: React.ReactNode }) {
    return react.createElement(react.Fragment, null, children);
  }
  Tabs.Screen = () => null;
  return { Tabs };
});

import { render, screen } from '@testing-library/react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type React from 'react';
import { useContext } from 'react';
import { StyleSheet, Text } from 'react-native';
import { CarouselContext } from '../../src/components/navigation/CarouselPage';
import { ThemeContext } from '../../src/components/theme/theme-context';
import { glyph, size, themes } from '../../src/theme/tokens';
import TabLayout, { CarouselRoot, sharedTabBarOptions, tabBarIcon, tabNames } from './_layout';

describe('sharedTabBarOptions', () => {
  it('paints the bar with the theme’s translucent tabBar.bg token, not a hard-coded colour', () => {
    expect(sharedTabBarOptions(themes.dark.color).tabBarStyle.backgroundColor).toBe(themes.dark.color.tabBar.bg);
    expect(sharedTabBarOptions(themes.light.color).tabBarStyle.backgroundColor).toBe(themes.light.color.tabBar.bg);
  });

  it('carries the light theme’s 0.92-opacity fill — baked into the token, not re-specified here', () => {
    expect(themes.light.color.tabBar.bg).toContain('0.92');
    expect(sharedTabBarOptions(themes.light.color).tabBarStyle.backgroundColor).toContain('0.92');
  });

  it('hides the header and sets the token height and border, with no blur view involved', () => {
    const options = sharedTabBarOptions(themes.dark.color);
    expect(options.headerShown).toBe(false);
    expect(options.tabBarStyle.borderTopColor).toBe(themes.dark.color.tabBar.border);
    expect(options.tabBarStyle.height).toBe(58);
    // No blur: a translucent flat colour, nothing from `expo-blur` in the returned options.
    expect(JSON.stringify(options)).not.toMatch(/blur/i);
  });
});

describe('glyph names resolve in the installed font (issue #81, from the #136 review)', () => {
  it('names only glyphs that `Ionicons.glyphMap` actually has — a mistyped name fails this test', () => {
    const names = [...Object.values(glyph.tab).flatMap(({ active, inactive }) => [active, inactive]), glyph.delete];
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(Ionicons.glyphMap).toHaveProperty(name);
    }
  });
});

/** The literal glyph character Ionicons paints for a given name — what actually lands on screen,
 * not just the name that was asked for. `Ionicons.glyphMap` maps every name to a numeric codepoint
 * in the icon font. */
function renderedGlyph(name: string): string {
  const codepoint = (Ionicons.glyphMap as Record<string, number>)[name];
  if (codepoint === undefined) throw new Error(`no glyph named "${name}" in Ionicons.glyphMap`);
  return String.fromCodePoint(codepoint);
}

describe('tabBarIcon (issue #81)', () => {
  it.each(tabNames)('renders the %s tab’s inactive outline glyph, sized from the token', async (tab) => {
    const Icon = tabBarIcon(tab);
    await render(<Icon focused={false} color={themes.dark.color.tabBar.inactiveText} size={size.icon.tab} />);

    const icon = screen.getByTestId(`tab-icon-${tab}`);
    expect(icon.children).toEqual([renderedGlyph(glyph.tab[tab].inactive)]);
    expect(icon.props.style[0]).toEqual(expect.objectContaining({ fontSize: size.icon.tab }));
  });

  it.each(tabNames)('swaps the %s tab to its filled glyph when focused, in the active tint passed in', async (tab) => {
    const Icon = tabBarIcon(tab);
    const activeTint = '#ff00ff';
    await render(<Icon focused color={activeTint} size={size.icon.tab} />);

    const icon = screen.getByTestId(`tab-icon-${tab}`);
    expect(icon.children).toEqual([renderedGlyph(glyph.tab[tab].active)]);
    expect(icon.props.style[0]).toEqual(expect.objectContaining({ color: activeTint }));
  });
});

/** Reads the carousel's `dragX` from context, for the context-propagation assertion below. */
function DragXProbe() {
  const ctx = useContext(CarouselContext);
  return <Text>{String(ctx?.dragX.value)}</Text>;
}

describe('TabLayout carousel wiring (issue #82)', () => {
  it('spreads useTabCarousel’s panHandlers onto the gesture view that wraps Tabs', async () => {
    await render(
      <ThemeContext.Provider value={themes.dark}>
        <TabLayout />
      </ThemeContext.Provider>,
    );
    // The mocked panHandlers carry one recognisable key; `getByTestId` on the root proves it landed
    // on an actual rendered host view, not merely that the mock function exists somewhere in scope.
    const root = screen.getByTestId('tab-carousel-root');
    expect(root.props.onMoveShouldSetResponder).toBe(mockPanHandlers.onMoveShouldSetResponder);
  });

  it('paints the gesture view in color.bg.canvas — what shows through while a screen slides', async () => {
    await render(
      <ThemeContext.Provider value={themes.dark}>
        <TabLayout />
      </ThemeContext.Provider>,
    );
    const root = screen.getByTestId('tab-carousel-root');
    const flat = StyleSheet.flatten(root.props.style) as { backgroundColor?: string };
    expect(flat.backgroundColor).toBe(themes.dark.color.bg.canvas);
  });

  it('provides useTabCarousel’s own dragX through CarouselContext, for every tab root to read', async () => {
    // `CarouselRoot` directly, not the full `TabLayout` — `Tabs.Screen`'s own stand-in above renders
    // null, so it cannot carry a context probe as a descendant the way a real tab root would.
    // `CarouselRoot` is the actual provider boundary either way (`TabLayout` only supplies its
    // children), so this proves the same wiring without needing a heavier `Tabs` stub.
    await render(
      <ThemeContext.Provider value={themes.dark}>
        <CarouselRoot color={themes.dark.color}>
          <DragXProbe />
        </CarouselRoot>
      </ThemeContext.Provider>,
    );
    expect(screen.getByText('-7')).toBeTruthy();
  });
});
