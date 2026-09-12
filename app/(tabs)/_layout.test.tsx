/**
 * `sharedTabBarOptions` is the tab bar's chrome, kept as a pure function so this test doesn't need
 * a router harness to exercise it. Per the tech-lead hand-off on #20: no blur (that would need
 * `expo-blur`, an undiscussed native dependency) and the light theme's 0.92 opacity — which this
 * test proves comes from the token, not a value repeated here.
 */
import { themes } from '../../src/theme/tokens';
import { sharedTabBarOptions } from './_layout';

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
