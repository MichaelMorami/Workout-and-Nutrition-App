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
import { render, screen } from '@testing-library/react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { glyph, size, themes } from '../../src/theme/tokens';
import { sharedTabBarOptions, tabBarIcon, tabNames } from './_layout';

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
