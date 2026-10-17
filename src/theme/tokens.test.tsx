/* istanbul ignore file -- this is a test, not source. jest.config.js `collectCoverageFrom` includes
   src/**\/*.{ts,tsx} but only excludes tests under test/**, so a colocated test is counted as uncovered
   source (0/112 lines) and fails the global threshold. Raised for qa-engineer on #16. tokens.ts itself
   is still measured, and is at 100%. */
/**
 * The token contract, as tests that can fail.
 *
 *   1. Light and dark define exactly the same keys — a token that exists in one theme only is a
 *      screen that renders `undefined` the day someone flips the theme.
 *   2. Every declared foreground/background pair clears WCAG AA (4.5:1) in BOTH themes, computed
 *      from the token values themselves — translucent layers (washes, scrims, the tab bar) are
 *      composited onto what sits beneath them before measuring. Pressed states included.
 *   3. The pair list cannot quietly go stale: every text-like colour token and every pressed
 *      surface must appear in at least one declared pair.
 *   4. The non-colour rules the design depends on: the 44 pt floor, the 16.5 pt tile name
 *      (decision 1), a reduce-motion answer for every animation, and an over-target arc that does
 *      not rely on colour alone.
 *   5. The four below/at/over arc states (issue #272): kcal is a ceiling, protein is a floor, and
 *      "at target" is separated from "just under" by shape, by colour AND by word — asserted on the
 *      colours `arcStateColors` actually hands the ring, not on token names.
 */
import {
  arcOverState,
  arcRingState,
  arcRingStateNames,
  arcState,
  arcStateColors,
  arcStateFor,
  arcStateNames,
  arcTargetKind,
  contrastPairs,
  dimPairs,
  fontInstances,
  formFooterPaddingBottom,
  glyph,
  graphicPairs,
  haptics,
  interaction,
  layout,
  MIN_DIM_SEPARATION,
  MIN_GRAPHIC_CONTRAST,
  MIN_TEXT_CONTRAST,
  motion,
  resolveThemeName,
  size,
  space,
  themeNames,
  servingPresetKeys,
  themes,
  type,
  type ColorPath,
  type ArcMetricName,
  type ArcRingStateName,
  type ArcStateName,
} from './tokens';

/* ------------------------------------------------------------------ helpers */

type Leaf = string | number | boolean | null;
type Tree = { readonly [key: string]: Leaf | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, Leaf> {
  const out = new Map<string, Leaf>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      for (const [p, v] of flatten(value, path)) out.set(p, v);
    } else {
      out.set(path, value);
    }
  }
  return out;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex?.[1]) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0|1|0?\.\d+)\s*\)$/.exec(value);
  if (rgba) {
    const [, r, g, b, a] = rgba;
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
  }
  throw new Error(`not a #RRGGBB or rgba() colour: ${value}`);
}

/** Alpha-composite `top` onto an opaque `bottom`. */
function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, b: number) => Math.round(t * top.a + b * (1 - top.a));
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

function luminance({ r, g, b }: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

type ThemeName = (typeof themeNames)[number];

/** One token's colour, in one theme, by path. */
function colorAt(name: ThemeName, path: ColorPath): Rgba {
  const value = flatten(themes[name].color).get(path);
  if (typeof value !== 'string') throw new Error(`${name}: no colour token at ${path}`);
  return parseColor(value);
}

/** The contrast of `fg` over `on` (bottom layer first, composited upward), rounded to 2 dp. */
function ratioAt(name: ThemeName, fg: ColorPath, on: readonly [ColorPath, ...ColorPath[]]): number {
  const [base, ...layers] = on;
  const bg = layers.reduce((acc, path) => over(colorAt(name, path), acc), colorAt(name, base));
  return Math.round(contrast(over(colorAt(name, fg), bg), bg) * 100) / 100;
}

/* -------------------------------------------------------------------- tests */

describe('themes', () => {
  it('ships a dark and a light theme, dark first', () => {
    expect(themeNames).toEqual(['dark', 'light']);
    expect(Object.keys(themes).sort()).toEqual(['dark', 'light']);
  });

  it('light and dark define identical key sets', () => {
    const dark = [...flatten(themes.dark).keys()].sort();
    const light = [...flatten(themes.light).keys()].sort();
    expect(light).toEqual(dark);
    expect(dark.length).toBeGreaterThan(80);
  });

  it.each(themeNames)('every %s colour token is a valid #RRGGBB or rgba() value', (name) => {
    for (const [path, value] of flatten(themes[name].color)) {
      expect(typeof value).toBe('string');
      expect(() => parseColor(String(value))).not.toThrow();
      expect(path).not.toMatch(/\s/);
    }
  });

  it('resolves the theme: dark first, the explicit choice wins, auto follows the phone', () => {
    expect(resolveThemeName('auto', null)).toBe('dark');
    expect(resolveThemeName('auto', undefined)).toBe('dark');
    expect(resolveThemeName('auto', 'dark')).toBe('dark');
    expect(resolveThemeName('auto', 'light')).toBe('light');
    expect(resolveThemeName('light', 'dark')).toBe('light');
    expect(resolveThemeName('dark', 'light')).toBe('dark');
  });

  it('makes a typo in a colour token name a type error', () => {
    // @ts-expect-error — `text.primry` is not a token. If this line ever compiles, the types rotted.
    const typo: ColorPath = 'text.primry';
    const real: ColorPath = 'text.primary';
    expect([typo, real]).toHaveLength(2);
  });
});

describe('text and icon contrast', () => {
  it('declares a meaningful set of pairs', () => {
    expect(MIN_TEXT_CONTRAST).toBe(4.5);
    expect(contrastPairs.length).toBeGreaterThan(60);
  });

  const cases = themeNames.flatMap((name) =>
    contrastPairs.map((pair) => ({ name, pair, label: `${pair.fg} on ${pair.on.join(' + ')}` })),
  );

  it.each(cases)('$name: $label clears 4.5:1', ({ name, pair }) => {
    const colors = flatten(themes[name].color);
    const read = (path: ColorPath): Rgba => {
      const value = colors.get(path);
      if (typeof value !== 'string') throw new Error(`${name}: no colour token at ${path}`);
      return parseColor(value);
    };
    const [base, ...layers] = pair.on;
    const ground = read(base);
    expect({ path: base, alpha: ground.a }).toEqual({ path: base, alpha: 1 });
    const bg = layers.reduce((acc, path) => over(read(path), acc), ground);
    const fg = over(read(pair.fg), bg);
    const ratio = Math.round(contrast(fg, bg) * 100) / 100;
    expect({ pair: `${pair.fg} on ${pair.on.join(' + ')}`, ratio, passes: ratio >= MIN_TEXT_CONTRAST }).toEqual({
      pair: `${pair.fg} on ${pair.on.join(' + ')}`,
      ratio,
      passes: true,
    });
  });

  it('covers every text-like colour token as a foreground in at least one pair', () => {
    const declared = new Set<string>(contrastPairs.map((p) => p.fg));
    const textLike = [...flatten(themes.dark.color).keys()].filter(
      (path) =>
        (/^(text|data|state)\./.test(path) && !/Muted$/.test(path)) || /(Text|Icon)$/.test(path),
    );
    expect(textLike.length).toBeGreaterThan(20);
    expect(textLike.filter((path) => !declared.has(path))).toEqual([]);
  });

  it('measures every pressed surface — the hardest background, because it moves toward the text', () => {
    const tops = new Set<string>(contrastPairs.map((p) => p.on[p.on.length - 1] ?? ''));
    const pressed = [...flatten(themes.dark.color).keys()].filter(
      (path) => /press/i.test(path) && !/(Text|Icon)$/.test(path),
    );
    expect(pressed.length).toBeGreaterThan(3);
    expect(pressed.filter((path) => !tops.has(path))).toEqual([]);
  });

  it('never measures against an unknown token', () => {
    const known = new Set(flatten(themes.dark.color).keys());
    const referenced = contrastPairs.flatMap((p) => [p.fg, ...p.on]);
    expect(referenced.filter((path) => !known.has(path))).toEqual([]);
  });
});

/* The ring is the one place the design draws MEANING in a stroke rather than in a word: how much of
   the target is left is carried by the proportion of track to lap and by nothing else. A stroke is
   not text, so it is not held to 4.5:1 — holding it there would be a worse ring, not a better one
   (see the dim-separation test below). It is held to WCAG 1.4.11's 3:1 instead, and `graphicPairs`
   exists so "never text" cannot mean "never measured", which is how the track got to 1.43:1. */
describe('graphic contrast — the ring strokes that are never text (issue #287)', () => {
  it('sets the non-text bar at 3:1, below the text bar, and names a meaningful set of pairs', () => {
    expect(MIN_GRAPHIC_CONTRAST).toBe(3);
    expect(MIN_GRAPHIC_CONTRAST).toBeLessThan(MIN_TEXT_CONTRAST);
    expect(graphicPairs.length).toBeGreaterThan(2);
  });

  const cases = themeNames.flatMap((name) =>
    graphicPairs.map((pair) => ({ name, pair, label: `${pair.fg} on ${pair.on.join(' + ')}` })),
  );

  it.each(cases)('$name: $label clears 3:1', ({ name, pair }) => {
    expect({ path: pair.on[0], alpha: colorAt(name, pair.on[0]).a }).toEqual({ path: pair.on[0], alpha: 1 });
    const ratio = ratioAt(name, pair.fg, pair.on);
    expect({ pair: `${pair.fg} on ${pair.on.join(' + ')}`, ratio, passes: ratio >= MIN_GRAPHIC_CONTRAST }).toEqual({
      pair: `${pair.fg} on ${pair.on.join(' + ')}`,
      ratio,
      passes: true,
    });
  });

  it('covers every arc stroke that carries meaning and is never text', () => {
    const declared = new Set<string>(graphicPairs.map((p) => p.fg));
    // The three dim strokes of the ring: the empty track, and the completed first lap of either
    // metric once the day has gone past target. Nothing else in `arc` is a stroke that is not text.
    const strokes = ['arc.track', 'arc.kcalOverBase', 'arc.proteinOverBase'];
    expect(strokes.filter((path) => !declared.has(path))).toEqual([]);
  });

  it('never measures against an unknown token', () => {
    const known = new Set(flatten(themes.dark.color).keys());
    const referenced = graphicPairs.flatMap((p) => [p.fg, ...p.on]);
    expect(referenced.filter((path) => !known.has(path))).toEqual([]);
  });

  it('gives the ring track a token of its own, not the 1 pt divider’s colour', () => {
    // A 10 pt stroke that states a proportion and a 1 pt divider between two rows have opposite
    // needs: the divider must stay quiet, the track must be seen. One token cannot serve both, and
    // while `arc.track` aliased `line.hairline` the track inherited the divider's job.
    for (const name of themeNames) {
      const { color } = themes[name];
      expect({ name, track: color.arc.track }).toEqual({ name, track: color.line.ring });
      expect(color.arc.track).not.toBe(color.line.hairline);
    }
    expect(size.arc.stroke).toBeGreaterThan(1);
  });

  /* The other half of #287, and the reason the strokes are not simply promoted to the 4.5:1 list:
     a track bright enough to be text is a ring that reads as full. Each dim stroke has to stay
     recognisably dimmer than the full-brightness stroke it stands in for. */
  it.each(themeNames)('%s: keeps every dim stroke recognisably dimmer than the one it stands in for', (name) => {
    for (const [dim, bright] of dimPairs) {
      const separation = ratioAt(name, dim, [bright]);
      expect({ name, dim, bright, separation, separated: separation >= MIN_DIM_SEPARATION }).toEqual({
        name,
        dim,
        bright,
        separation,
        separated: true,
      });
      // …and dimmer in the one direction that matters: further from the card than the bright
      // stroke is, never nearer. This is what fails if the two are ever swapped.
      const dimFromCard = ratioAt(name, dim, ['card.bg']);
      const brightFromCard = ratioAt(name, bright, ['card.bg']);
      expect({ name, dim, dimmer: dimFromCard < brightFromCard }).toEqual({ name, dim, dimmer: true });
    }
  });
});

describe('type', () => {
  it('sets the quick-add tile name at 16.5 pt (decision 1)', () => {
    expect(type.tileName.fontSize).toBe(16.5);
  });

  it('points every style at a declared font instance, with absolute line height', () => {
    for (const [role, style] of Object.entries(type)) {
      expect({ role, known: style.fontFamily in fontInstances }).toEqual({ role, known: true });
      expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
    }
  });
});

describe('size', () => {
  it('holds the 44 pt tap-target floor on every hit area', () => {
    expect(size.tapTargetMin).toBe(44);
    const hits = [...flatten(size).entries()].filter(([path]) => /Hit$/.test(path));
    expect(hits.length).toBeGreaterThan(8);
    for (const [path, value] of hits) {
      expect({ path, ok: typeof value === 'number' && value >= size.tapTargetMin }).toEqual({ path, ok: true });
    }
  });

  it('draws over-target with shape, not colour alone: a knocked-out second lap and a target tick', () => {
    expect(size.arc.overKnockout).toBeGreaterThan(0);
    expect(size.arc.targetTickLength).toBeGreaterThan(size.arc.stroke);
  });
});

describe('glyph (issue #80)', () => {
  const tabs = ['today', 'workout', 'charts', 'settings'] as const;

  it('draws every icon from one family that ships with Expo and runs in Expo Go', () => {
    expect(glyph.family).toBe('Ionicons');
  });

  it('names an icon for each of the four tabs, and only those', () => {
    expect(Object.keys(glyph.tab).sort()).toEqual([...tabs].sort());
  });

  it('marks the active tab with shape as well as colour: outline at rest, the filled cut when active', () => {
    for (const tab of tabs) {
      const { active, inactive } = glyph.tab[tab];
      expect({ tab, inactive }).toEqual({ tab, inactive: `${active}-outline` });
    }
  });

  it('gives every tab a colour for its active state in both themes, so the glyph and the colour tokens line up', () => {
    for (const name of themeNames) {
      const bar = themes[name].color.tabBar as Record<string, string>;
      for (const tab of tabs) expect({ name, tab, type: typeof bar[`${tab}ActiveText`] }).toEqual({ name, tab, type: 'string' });
    }
  });

  it('names a filled trash can for the swipe-to-delete pane, sized to read on a red fill at arm length', () => {
    expect(glyph.delete).toBe('trash');
    expect(size.icon.deleteAction).toBeGreaterThan(size.icon.md);
  });

  it('draws the delete action as a square button inside the row, clear of the row content', () => {
    const b = size.deleteButton;
    // Square, and it fits inside the painted log row rather than running its full height as a strip.
    expect(b.side).toBeLessThan(size.row.log);
    // The glyph sits inside the square with room to breathe on every side.
    expect(b.side).toBeGreaterThan(size.icon.deleteAction);
    // Painted smaller than the floor, so the touch area is extended to it (square hit area).
    expect(b.sideHit).toBe(size.tapTargetMin);
    // A real gap of theme background between the protein figure and the button — a space step.
    expect(b.gap).toBeGreaterThan(0);
    expect(Object.values(space)).toContain(b.gap);
  });
});

/* ============================================= arc target states (issue #272) */

/**
 * The visual language for going over a target. The product decision (#272) is fixed: kcal is a
 * ceiling, protein is a floor, there is no target-type column and no migration — the direction is
 * hard-coded per metric. `src/components/charts/**` draws it (#273); these tests pin what it draws
 * against.
 *
 * Every colour assertion below reads `arcStateColors`, the same resolver the ring calls, so it is
 * measuring what lands on screen rather than re-deriving it from the token tree.
 */
describe('arc target states (issue #272)', () => {
  const metrics: readonly ArcMetricName[] = ['kcal', 'protein'];

  it('names the two targets the schema actually has, and which way each one points', () => {
    // `kcalTarget` and `proteinTarget` (src/db/schema.ts) are the only targets that exist, so these
    // are the only two directions the design has to answer for.
    expect(Object.keys(arcTargetKind).sort()).toEqual(['kcal', 'protein']);
    expect(arcTargetKind.kcal).toBe('ceiling');
    expect(arcTargetKind.protein).toBe('floor');
  });

  it('defines four below/at/over states and leaves the no-target ring out of them', () => {
    const expected: readonly ArcStateName[] = ['under', 'met', 'exceeded', 'surplus'];
    expect([...arcStateNames]).toEqual([...expected]);
    expect(Object.keys(arcState).sort()).toEqual([...arcStateNames].sort());
    // `noTarget` is `arc-math.ts`'s fifth status and this issue does not touch it: no state here
    // means no new colour, shape or word can reach it.
    expect(arcStateNames).not.toContain('noTarget');
  });

  it('sends each metric over its target into the state its direction earns', () => {
    expect(arcOverState('kcal')).toBe('exceeded');
    expect(arcOverState('protein')).toBe('surplus');
    for (const metric of metrics) {
      const state = arcOverState(metric);
      expect({ metric, appliesTo: arcState[state].appliesTo }).toEqual({ metric, appliesTo: arcTargetKind[metric] });
    }
    expect(arcState.under.appliesTo).toBe('both');
    expect(arcState.met.appliesTo).toBe('both');
  });

  /* `position` is the only machine-readable statement of WHERE the at-target boundary sits, so it
     is pinned twice: the four values directly, here, and behaviourally through `arcStateFor` below
     — which derives the state from `position`, so the field has a consumer rather than a promise. */
  it('says where each state sits against the target, and exactly one state answers each case', () => {
    expect(Object.fromEntries(arcStateNames.map((s) => [s, arcState[s].position]))).toEqual({
      under: 'below',
      met: 'at',
      // Both over-states sit above target; what separates them is `appliesTo`, i.e. which way the
      // target points — never the position.
      exceeded: 'above',
      surplus: 'above',
    });
    // Totality: every (position, target kind) pair resolves to one state and never two, which is
    // what lets `arcStateFor` look the state up instead of branching on the comparison again.
    for (const kind of ['ceiling', 'floor'] as const) {
      for (const position of ['below', 'at', 'above'] as const) {
        const matches = arcStateNames.filter(
          (s) =>
            arcState[s].position === position &&
            (arcState[s].appliesTo === 'both' || arcState[s].appliesTo === kind),
        );
        expect({ kind, position, matches: matches.length }).toEqual({ kind, position, matches: 1 });
      }
    }
  });

  /* THE BOUNDARY, in the one place it now lives. It used to exist three times over — here, in
     `arc-math.ts` and in the design canvas — and a `>=` for a `>` in any copy ships a ring that
     calls a hit target a blown one. `arcStateFor` is the sanctioned route for #273; the canvas
     calls it too, so the specimen cannot disagree with the spec it is drawn to prove. */
  describe('arcStateFor maps a value and a target to a state', () => {
    const cases: [metric: ArcMetricName, target: number, over: ArcStateName][] = [
      ['kcal', 2400, 'exceeded'],
      ['protein', 180, 'surplus'],
    ];
    it.each(cases)('%s, target %i: target−1 is under, target is met, target+1 is %s', (metric, target, over) => {
      expect(arcStateFor(metric, target - 1, target)).toBe('under');
      expect(arcStateFor(metric, target, target)).toBe('met');
      expect(arcStateFor(metric, target + 1, target)).toBe(over);
      // Away from the boundary, and at the far end: nothing saturates into another state.
      expect(arcStateFor(metric, 0, target)).toBe('under');
      expect(arcStateFor(metric, target * 3, target)).toBe(over);
      // The over-state is the one the metric's direction earns, not a second opinion about it.
      expect(arcStateFor(metric, target + 1, target)).toBe(arcOverState(metric));
    });

    it('agrees with the spec it resolves to, state for state', () => {
      for (const metric of metrics) {
        for (const [value, expected] of [[179, 'under'], [180, 'met'], [181, arcOverState(metric)]] as const) {
          const state = arcStateFor(metric, value, 180);
          const spec = arcState[state];
          expect({ metric, value, state, position: spec.position }).toEqual({
            metric,
            value,
            state: expected,
            position: value < 180 ? 'below' : value === 180 ? 'at' : 'above',
          });
          expect(spec.appliesTo === 'both' || spec.appliesTo === arcTargetKind[metric]).toBe(true);
        }
      }
    });
  });

  /* The criterion most likely to pass vacuously: at 99.4 % of target the ring's round end caps
     already close the gap, so a met ring and a nearly-met one are the same picture. Three
     independent channels separate them, and each is asserted on its own. */
  describe('"at target" is distinguishable from "just under"', () => {
    it('by shape: only a reached target draws the 12 o’clock tick', () => {
      expect(arcState.under.tick).toBe(false);
      expect(arcState.met.tick).toBe(true);
      // The tick is long enough to break the ring's silhouette, which is what makes it readable at
      // arm's length rather than a detail.
      expect(size.arc.targetTickLength).toBeGreaterThan(size.arc.stroke);
    });

    it.each(themeNames)('by colour, in %s: the caption changes colour the moment the target is reached', (name) => {
      const { color } = themes[name];
      for (const metric of metrics) {
        const under = arcStateColors(color, metric, 'under').caption;
        const met = arcStateColors(color, metric, 'met').caption;
        expect({ name, metric, under, met, differ: under !== met }).toEqual({ name, metric, under, met, differ: true });
      }
    });

    it('by word: "Target hit" is not a countdown', () => {
      expect(arcState.met.caption).toBe('Target hit');
      expect(arcState.under.caption).toBe('{amount} left');
      expect(arcState.met.caption).not.toBe(arcState.under.caption);
    });
  });

  it.each(themeNames)('%s: a blown ceiling gets a caution hue of its own — never danger, never the metric', (name) => {
    const { color } = themes[name];
    const exceeded = arcStateColors(color, 'kcal', 'exceeded');
    expect(exceeded.overage).toBe(color.state.caution);
    // Reading the overage as "calories" would lose the whole state; reading it as danger would say
    // something failed or something is about to be destroyed. Neither is true.
    expect(exceeded.overage).not.toBe(color.data.kcal);
    expect(exceeded.overage).not.toBe(color.state.danger);
    expect(exceeded.caption).toBe(color.state.caution);
    // The completed lap stays muted, so the ring never reads as a triumphant full circle.
    expect(exceeded.firstLap).toBe(color.arc.kcalOverBase);
  });

  it.each(themeNames)('%s: a beaten floor keeps protein’s own colour and reads as success', (name) => {
    const { color } = themes[name];
    const surplus = arcStateColors(color, 'protein', 'surplus');
    expect(surplus.overage).toBe(color.data.protein);
    expect(surplus.overage).not.toBe(color.state.caution);
    expect(surplus.overage).not.toBe(color.state.danger);
    expect(surplus.caption).toBe(color.state.success);
    expect(surplus.caption).not.toBe(color.state.caution);
    expect(surplus.caption).not.toBe(color.state.danger);
    // The twin of the ceiling's muted first lap, and it bites harder here: `arc.proteinOverage` IS
    // `data.protein`, so if the first lap kept protein's full-brightness colour too, both laps
    // would be the same hue and "12 g past" would render as a plain closed ring — the "reads as
    // complete when it is not" bug this issue exists to kill. The 3 pt knockout cut would be the
    // only thing left saying otherwise.
    expect(surplus.firstLap).toBe(color.arc.proteinOverBase);
    expect(surplus.firstLap).not.toBe(surplus.overage);
    // And a met target says success on both metrics, not just on the floor.
    for (const metric of metrics) expect(arcStateColors(color, metric, 'met').caption).toBe(color.state.success);
  });

  it('cuts the knockout only where there is an overage to cut it around', () => {
    for (const state of arcStateNames) {
      const spec = arcState[state];
      const over = spec.appliesTo !== 'both';
      expect({ state, overage: spec.overage !== null, knockout: spec.knockout, tick: spec.tick }).toEqual({
        state,
        overage: over,
        knockout: over,
        tick: state !== 'under',
      });
    }
    expect(size.arc.overKnockout).toBeGreaterThan(0);
  });

  it.each(themeNames)('%s: hands the ring no overage colour at all below or at target', (name) => {
    const { color } = themes[name];
    for (const metric of metrics) {
      for (const state of ['under', 'met'] as const) {
        const resolved = arcStateColors(color, metric, state);
        expect({ metric, state, overage: resolved.overage }).toEqual({ metric, state, overage: null });
        // Below and at target the first lap is the metric's own, full-brightness colour.
        expect(resolved.firstLap).toBe(color.arc[metric]);
      }
    }
  });

  it('words each state once, with the amount only where there is one', () => {
    expect(Object.fromEntries(arcStateNames.map((s) => [s, arcState[s].caption]))).toEqual({
      under: '{amount} left',
      met: 'Target hit',
      // "over" is a budget blown; "past" is a floor beaten. The words carry the difference when the
      // colour cannot — greyscale, a screenshot, a colourblind reader.
      exceeded: '{amount} over',
      surplus: '{amount} past',
    });
    const withAmount = arcStateNames.filter((s) => arcState[s].caption.includes('{amount}'));
    expect([...withAmount]).toEqual(['under', 'exceeded', 'surplus']);
  });

  /* "The unset-target ring is left exactly as it is" (#272). The no-target ring draws `arc.track`
     plus the three texts inside it and nothing else, so pinning those four values in both themes is
     the whole of that promise. Hexes, not aliases: an alias would follow a retuned base colour and
     the pin would never fire.

     `track` is the ONE value #287 changes on purpose: #272 promised not to touch it, #287 is the
     issue that lifts it from 1.43:1 to 3.06:1 (dark) and 1.35:1 to 3.11:1 (light), because a track
     nobody can see is a ring that cannot say how much of the target is left. The other three are
     still byte-identical, and the pin stays so the next change to any of them is deliberate too. */
  it.each(themeNames)('%s: leaves every colour the no-target ring draws byte-identical', (name) => {
    const expected = {
      dark: { track: '#64666D', valueText: '#F5F7FA', labelText: '#9598A0', captionText: '#B4B7BE' },
      light: { track: '#919296', valueText: '#1A1D24', labelText: '#63666F', captionText: '#575B63' },
    }[name];
    const { track, valueText, labelText, captionText } = themes[name].color.arc;
    expect({ track, valueText, labelText, captionText }).toEqual(expected);
  });

  it('measures every new colour against the ground it is drawn on, both themes', () => {
    const declared = new Set(contrastPairs.map((p) => `${p.fg} on ${p.on.join(' + ')}`));
    for (const fg of ['arc.metText', 'arc.exceededText', 'arc.surplusText', 'arc.kcalOverage', 'arc.proteinOverage']) {
      expect({ fg, measured: declared.has(`${fg} on card.bg`) }).toEqual({ fg, measured: true });
    }
    // `state.caution` is a semantic colour like `success` and `danger`: measured on all three grounds.
    for (const on of ['bg.canvas', 'bg.surface', 'bg.raised']) {
      expect({ on, measured: declared.has(`state.caution on ${on}`) }).toEqual({ on, measured: true });
    }
  });

  it('needs no reduce-motion answer of its own: the state change rides the existing sweep', () => {
    // A ring crossing its target changes colour, gains a tick and gains a lap — all inside the one
    // sweep that already runs after a log, which already answers reduce motion with an instant cut.
    expect(motion.events.arcSweep.reduced.kind).toBe('instant');
    expect(Object.keys(motion.events).filter((k) => /exceed|surplus|target/i.test(k))).toEqual([]);
  });

  /* ------------------------------------------------- a ring with no target (issue #289)

     `arcStateFor('kcal', 0, 0)` used to answer `met` — a fresh install, nothing logged, no target
     configured, and the ring said "Target hit". Two definitions of the same input disagreed:
     `arc-math.ts`'s `arcStatus` called it `noTarget`.

     The ruling: `arcStateFor` is TOTAL and safe to call straight from a render path. It answers
     `noTarget` for any target that is not a real, positive, finite one — it does not throw. The
     alternative on the table (throw on `target <= 0`, to match the metric guard) was rejected: the
     first screen the app ever draws is a day with no target, so a throwing contract means either a
     `try/catch` around a render or a pre-check at the call site — and a pre-check is a fourth copy
     of the boundary, which is the bug class #272 and this issue exist to kill. */
  describe('a ring with no target (issue #289)', () => {
    it('calls a fresh day with no target `noTarget`, never `met`', () => {
      for (const metric of metrics) {
        expect(arcStateFor(metric, 0, 0)).toBe('noTarget');
        expect(arcStateFor(metric, 0, 0)).not.toBe('met');
        // And it is not one of the four target states, so no target state's colour, tick or word
        // can reach a ring that has no target.
        expect(arcStateNames).not.toContain(arcStateFor(metric, 0, 0));
      }
    });

    /* The same rule `arc-math.ts`'s `arcStatus` applies, written out input by input, so the two
       cannot drift apart while #273 retires the copy there: a target is real only when it is finite
       and above zero, and a value that is not finite or is negative counts as zero. */
    it.each([
      [0, 0, 'noTarget'],
      [1240, 0, 'noTarget'],
      [0, -1, 'noTarget'],
      [1240, -2400, 'noTarget'],
      [0, Number.NaN, 'noTarget'],
      [0, Number.POSITIVE_INFINITY, 'noTarget'],
      [0, 2400, 'under'],
      [Number.NaN, 2400, 'under'],
      [-50, 2400, 'under'],
      [Number.POSITIVE_INFINITY, 2400, 'above'],
      [2399, 2400, 'under'],
      [2400, 2400, 'met'],
      [2401, 2400, 'above'],
    ] as const)('value %p against target %p is %s', (value, target, expected) => {
      for (const metric of metrics) {
        // `above` stands for whichever over-state the metric's target direction earns.
        const want: ArcRingStateName = expected === 'above' ? arcOverState(metric) : expected;
        expect({ metric, state: arcStateFor(metric, value, target) }).toEqual({ metric, state: want });
      }
    });

    it('never throws on anything a render path can hand it', () => {
      // The contract #273 builds against: call it, draw what it says. No catch, no pre-check.
      const numbers = [0, -1, 0.5, 2400, 1e9, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
      for (const metric of metrics) {
        for (const value of numbers) {
          for (const target of numbers) {
            expect(() => arcStateFor(metric, value, target)).not.toThrow();
            expect(arcRingStateNames).toContain(arcStateFor(metric, value, target));
          }
        }
      }
    });

    it('is the five-state table, built from the four so the two cannot drift', () => {
      expect([...arcRingStateNames]).toEqual(['noTarget', 'under', 'met', 'exceeded', 'surplus']);
      expect(Object.keys(arcRingState).sort()).toEqual([...arcRingStateNames].sort());
      // Same objects, not copies: `arcRingState` is `arcState` plus one entry, so a change to a
      // target state cannot reach one table and miss the other.
      for (const state of arcStateNames) expect(arcRingState[state]).toBe(arcState[state]);
    });

    it('has no position, so the position lookup inside arcStateFor can never reach it', () => {
      // `position` is how the four target states are resolved. `noTarget` has none: it is decided
      // by the guard that runs BEFORE a position is computed, which is why it needs no position and
      // why no (position, target kind) case can land on it.
      expect(arcRingStateNames.filter((s) => arcRingState[s].position === null)).toEqual(['noTarget']);
      expect(arcRingState.noTarget.position).toBe(null);
    });

    it('draws nothing new: no lap, no overage, no tick, no cut — the track and one caption', () => {
      expect(arcRingState.noTarget.firstLap).toBe(null);
      expect(arcRingState.noTarget.overage).toBe(null);
      expect(arcRingState.noTarget.tick).toBe(false);
      expect(arcRingState.noTarget.knockout).toBe(false);
      // The wording `arc-math.ts` already ships, moved to where the other four captions live, and
      // with no `{amount}`: there is no target to be any distance from.
      expect(arcRingState.noTarget.caption).toBe('No target set');
      expect(arcRingState.noTarget.caption).not.toContain('{amount}');
    });

    it.each(themeNames)('%s: resolves to the colours the no-target ring already draws', (name) => {
      const { color } = themes[name];
      for (const metric of metrics) {
        const resolved = arcStateColors(color, metric, 'noTarget');
        // `firstLap: null` is "this state has no lap of its own" — the ring is the bare `arc.track`,
        // exactly as it renders today. A colour here would be a full grey lap, which reads as a
        // completed ring: the "complete when it isn't" failure, from the other end.
        expect({ metric, ...resolved }).toEqual({
          metric,
          firstLap: null,
          overage: null,
          caption: metric === 'kcal' ? color.arc.kcalText : color.arc.proteinText,
        });
      }
    });
  });
});

describe('motion', () => {
  it('gives every animation a reduce-motion answer that is never longer than the full one', () => {
    const events = Object.entries(motion.events);
    expect(events.length).toBeGreaterThan(10);
    for (const [name, event] of events) {
      expect({ name, reduced: event.reduced.duration <= event.duration }).toEqual({ name, reduced: true });
    }
  });

  it('keeps feedback fast: nothing but the once-per-entry chart draw exceeds the ceiling', () => {
    const slow = Object.entries(motion.events)
      .filter(([, e]) => e.duration > motion.ceilingMs)
      .map(([name]) => name);
    expect(slow).toEqual(['chartDraw']);
  });
});

describe('carousel — the swipe-between-tabs gesture (issue #246, builds #82)', () => {
  const c = motion.carousel;

  it('names a release spring that actually exists in motion.spring', () => {
    // The pointer, not a second copy of the numbers: every spring in the app lives in
    // motion.spring, so a retune cannot leave the carousel behind.
    expect(Object.keys(motion.spring)).toContain(c.releaseSpring);
    expect(motion.spring[c.releaseSpring]).toBeDefined();
  });

  it('settles inside the motion ceiling and stops without a visible overshoot', () => {
    const s = motion.spring[c.releaseSpring];
    expect(s.duration).toBeLessThanOrEqual(motion.ceilingMs);
    // A full-screen pager that overshoots shows a sliver of the screen past the one you asked
    // for, which reads as a bug rather than as bounce. Just short of critical damping.
    expect(s.dampingRatio).toBeGreaterThanOrEqual(0.9);
    expect(s.dampingRatio).toBeLessThanOrEqual(1);
  });

  it('tracks the finger 1:1 while the finger is down — a pager that lags is a pager that fights you', () => {
    expect(c.trackingGain).toBe(1);
  });

  it('commits a deliberate drag at 22 % of the width — ~86 pt, one thumb swing, not 176', () => {
    // The decision, not a range. 0.22 × 390 pt ≈ 86 pt: about as far as a thumb swings before the
    // hand re-grips, so a committed swipe is one-handed. Anything near half the screen (0.45 is
    // 176 pt) needs the second hand, and this is the app's most-used gesture.
    expect(c.commitFraction).toBe(0.22);
  });

  it('commits a flick at 420 pt/s however short it was — the other way in, on speed alone', () => {
    // ~1.1 screen widths per second. A fast swipe lifts off early and covers little distance, so
    // without this rule it would fail commitFraction and spring back — the commonest way a pager
    // feels broken. The number is the decision: drop it toward 0 and every twitch changes tab.
    expect(c.commitVelocityPtPerS).toBe(420);
  });

  it('keeps 30 % of the finger past the first and last tab — resistance you can feel, not a wall', () => {
    // 0.3 says "heard you, there is nothing over here" in the gesture itself. A dead edge (0)
    // leaves you unsure the gesture registered; near-free travel (0.95) reads as a missing screen.
    expect(c.edgeResistance).toBe(0.3);
  });

  it('flips the tab-bar indicator at the commit point rather than interpolating it mid-drag', () => {
    expect(c.indicatorFlip).toBe('onCommit');
  });

  it('keeps the tracked phase under reduce motion and drops only the unattended release', () => {
    // The drag itself is direct manipulation — it IS the finger. Removing it removes the gesture,
    // and reduce motion never takes away a gesture's own feedback. The release is the part that
    // moves on its own, so that is the part that goes instant.
    expect(c.reduced.tracked).toBe('same');
    expect(c.reduced.release).toEqual({ kind: 'instant', duration: 0 });
  });

  it('is not a motion.events key: a tracked gesture has no single duration to put there', () => {
    // Deliberate shape, pinned so a later tidy-up cannot fold it in. motion.events entries are
    // fire-and-forget (one duration, one easing, one reduced); during the tracked phase the
    // carousel's position is a function of the finger, not of time, so a `duration` field there
    // would be a lie about the only phase the user is actually in.
    expect(Object.keys(motion.events)).not.toContain('carousel');
    expect(Object.keys(motion.events).filter((k) => k.toLowerCase().includes('carousel'))).toEqual([]);
  });
});

/* The four values issue #249 decided, so that #82's pager has nothing left to invent. Each one is
   pinned with an exact `toBe`: a bound would let a retune slide under it, which is exactly what
   happened to the first three values in PR #247 before review B1. */
describe('carousel activation and hand-off (issue #249, builds #82)', () => {
  const c = motion.carousel;
  const a = motion.carousel.activation;

  it('takes the gesture over at 12 pt of travel — twice the 6 pt a row-level swipe claims at', () => {
    // The whole arbitration rests on this ordering. `SwipeToDelete`'s PanResponder claims at
    // `Math.abs(dx) > 6`, so by the time the finger has moved 12 pt the row already holds the
    // responder and the pager cannot take it: the inner gesture wins by construction, not by
    // negotiation. Drop `distancePt` to 6 or below and a swipe-to-delete becomes a coin toss.
    // 12 pt is also past the incidental sideways drift in a vertical flick, and still early
    // enough that the screen is following before you can doubt that it heard you.
    expect(a.distancePt).toBe(12);
    expect(a.innerClaimPt).toBe(6);
    expect(a.distancePt).toBeGreaterThan(a.innerClaimPt);
  });

  it('needs the drag twice as horizontal as it is vertical — the list wins every diagonal', () => {
    // |dx| > 2 × |dy|, i.e. inside 26.6° of horizontal. Today and Charts are vertical lists and
    // scrolling them is far more frequent than changing tab, so an ambiguous diagonal must go to
    // the scroll. At ratio 1 (45°) a brisk thumb-flick up the day log changes tab instead.
    expect(a.axisRatio).toBe(2);
  });

  it('exists only on the four tab roots, which is what keeps it clear of the edge-swipe back', () => {
    // `app/(tabs)` is the root Stack's first screen, so at a tab root there is nothing to pop and
    // no iOS edge-swipe back gesture to arbitrate against. On a pushed screen (`app/foods/[id]`,
    // `app/meals/[id]`) the horizontal drag belongs to the navigator, whole. That is why there is
    // no left-edge exclusion zone: a dead strip at the bezel would kill the one-handed flick from
    // the frame that `commitVelocityPtPerS` exists to serve.
    expect(a.onlyAtNavigationRoot).toBe(true);
  });

  it('stops the over-drag dead at 10 % of the width — ~39 pt of give, then nothing', () => {
    // Where `edgeResistance` (the gain) runs out. 0.1 × 390 pt ≈ 39 pt of content travel, which at
    // gain 0.3 takes ~130 pt of finger: a long deliberate pull, never a wobble. A hard stop, not an
    // asymptote — an asymptote keeps yielding a pixel forever and reads as a laggy pager, while a
    // stop says unambiguously "this is the end". It also gives `edgeHaptic` a defined instant.
    expect(c.edgeMaxTravelFraction).toBe(0.1);
    // An edge pull can therefore never reach a commit distance: nothing commits at an edge.
    expect(c.edgeMaxTravelFraction).toBeLessThan(c.commitFraction);
  });

  it('does not wrap around — #82 asked design to confirm, and the answer is no', () => {
    // Four tabs in a fixed bottom-bar order are a row, not a ring. Wrapping means a swipe left
    // from Today lands on Settings, which breaks the one spatial model the tab bar teaches, and
    // it removes the only way the gesture can tell you that you are at an end.
    expect(c.wrapAround).toBe(false);
  });

  it('hands the finger’s speed to the release spring at full gain — a flick never stops dead', () => {
    // Visibly different on a fast flick: at carry 0 the screen halts at lift-off and the spring
    // re-accelerates from rest, which reads as the phone dropping your gesture mid-stride.
    expect(c.releaseVelocity.carry).toBe(1);
  });

  it('caps the carried speed at the spring’s own speed for the distance that is left', () => {
    // 1 × (remaining pt ÷ (carouselRelease.duration ÷ 1000)), in pt/s — `duration` is 220 ms and
    // every velocity in the token set is per second. That is the bound that makes the carry safe:
    // above it the initial velocity adds travel the spring did not plan for, and at damping 0.9
    // every point of that comes back as overshoot past the destination — the sliver of the *next*
    // screen that `motion.spring.carouselRelease`'s own comment refuses. The dangerous release is
    // not the fast one, it is the fast one with almost no distance left to cover, and a cap tied
    // to the remaining distance is the only cap that catches it. At this value the carry can only
    // ever remove the jerk at lift-off, never add travel.
    expect(c.releaseVelocity.capSpringSpeeds).toBe(1);
  });

  it('drops a release whose velocity points away from the tab it committed to', () => {
    // Rare but real: the drag passed `commitFraction` and the finger was already reversing when it
    // lifted. Carrying that velocity in walks the screen backwards before the spring hauls it
    // forwards, which looks like a glitch rather than like physics. Only the component toward the
    // destination is handed over.
    expect(c.releaseVelocity.awayFromDestination).toBe('drop');
  });

  it('fires no haptic on a committed tab change — ruled out, and recorded as a decision', () => {
    // `null`, not absent: the question is answered, not unanswered. A tab change is already
    // direct manipulation with the whole screen as its feedback, so a buzz there confirms nothing
    // you cannot see — it is decoration, which this app's motion rules forbid — and it would fire
    // dozens of times a session, blunting `foodLogged`, the one haptic that replaces a Save button.
    expect(c.commitHaptic).toBeNull();
  });

  it('fires one at the edge instead — the only outcome the screen cannot show you', () => {
    // The inverse case earns it. Pulling past the first or last tab moves 30 % of your travel and
    // springs back; nothing on screen says *why*, because there is no screen over there to show.
    // One tick at the hard stop, once per gesture, while the finger is still down and can still
    // stop pulling.
    expect(c.edgeHaptic).toBe('carouselEdge');
    expect(Object.keys(haptics)).toContain(c.edgeHaptic);
  });

  it('gives the edge bump the lightest feel in the vocabulary, and one useHapticFeedback resolves', () => {
    // A boundary bump must sit below every confirmation: it reports a non-event. Same pair as
    // `setLogged`, the other high-frequency tick.
    expect(haptics.carouselEdge).toEqual({ ios: 'impactLight', android: 'EFFECT_TICK' });
    // `useHapticFeedback` maps the `ios` field by name and falls back to Medium on an unknown one,
    // which would silently make the lightest haptic in the app the second-heaviest.
    const resolvable = ['selection', 'impactLight', 'impactMedium', 'impactHeavy', 'notificationSuccess', 'notificationWarning', 'notificationError'];
    expect(resolvable).toContain(haptics.carouselEdge.ios);
  });
});

describe('food form (issue #88)', () => {
  const f = size.foodForm;

  it('lays the six serving chips out as a 3 × 2 grid whose every chip clears the tap floor on the narrowest phone', () => {
    // 100 g · 100 ml · 1 cup / 1 tbsp · 1 tsp · Custom… — a single line of six does not fit 375 pt.
    expect(f.chipColumns).toBe(3);
    expect(f.chipHit).toBeGreaterThanOrEqual(size.tapTargetMin);
    const narrowest = 375 - 2 * layout.gutter;
    const chipWidth = (narrowest - (f.chipColumns - 1) * f.chipGap) / f.chipColumns;
    expect(chipWidth).toBeGreaterThanOrEqual(2 * size.tapTargetMin);
    expect(Object.values(space)).toContain(f.chipGap);
  });

  it('marks the selected chip with shape as well as colour: a heavier border and a bolder label', () => {
    expect(f.chipBorderSelected).toBeGreaterThan(f.chipBorder);
    expect(type.controlSelected.fontFamily).not.toBe(type.control.fontFamily);
  });

  it('shows a preset serving as a locked read-out, not a disabled stepper: its own row, glyph and colours', () => {
    expect(f.lockedRowHeight).toBeGreaterThanOrEqual(size.tapTargetMin);
    for (const name of themeNames) {
      const c = themes[name].color.foodForm;
      // No well: the read-out sits on the form ground, so it cannot be mistaken for an input.
      expect({ name, keys: ['lockedAmountText', 'lockedMetaText', 'lockIcon'].every((k) => k in c) }).toEqual({ name, keys: true });
      expect(Object.keys(c)).not.toContain('lockedBg');
    }
  });

  it('names the form hairlines and the focus ring, the focus ring heavier so focus is shape as well as colour', () => {
    expect(f.fieldBorderWidthFocus).toBeGreaterThan(f.fieldBorderWidth);
    expect(Object.values(space)).toContain(f.stepperGap);
  });

  it('draws the padlock at the inline-glyph size, so the mock and the build are the same glyph', () => {
    expect(f.lockIcon).toBe(size.icon.sm);
  });

  it('paints the sticky footer the ground it floats over — the sheet, or a pushed screen — and measures the preview on both', () => {
    for (const name of themeNames) {
      const c = themes[name].color;
      expect({ name, sheet: c.foodForm.footerBg }).toEqual({ name, sheet: c.searchSheet.bg });
      expect({ name, screen: c.foodForm.footerBgScreen }).toEqual({ name, screen: c.bg.canvas });
    }
    for (const fg of ['foodForm.previewServingText', 'foodForm.previewUnitText', 'foodForm.previewKcalText', 'foodForm.previewProteinText']) {
      for (const footer of ['foodForm.footerBg', 'foodForm.footerBgScreen']) {
        const measured = contrastPairs.some((p) => p.fg === fg && p.on.length === 2 && p.on[0] === footer && p.on[1] === 'foodForm.previewBg');
        expect({ fg, footer, measured }).toEqual({ fg, footer, measured: true });
      }
    }
  });

  it('fits a kcal stepper and a protein stepper side by side, each button a full tap target', () => {
    const half = (375 - 2 * layout.gutter - f.nutritionGap) / 2;
    const value = half - 2 * f.nutritionButtonWidth - 2 * f.stepperGap;
    expect(f.nutritionButtonWidth).toBeGreaterThanOrEqual(size.tapTargetMin);
    expect(f.nutritionHit).toBeGreaterThanOrEqual(size.tapTargetMin);
    // Room for "1,250" at the stepper value size.
    expect(value).toBeGreaterThanOrEqual(type.stepperValue.fontSize * 3);
  });

  it('animates the Custom fields in and out as feedback, and snaps them under reduce motion', () => {
    const e = motion.events.customReveal;
    expect(e.duration).toBeGreaterThanOrEqual(150);
    expect(e.duration).toBeLessThanOrEqual(250);
    expect(e.reduced.kind).toBe('instant');
  });
});

describe('form frame (issue #207)', () => {
  it('names every distance the pinned footer pattern needs, each one a step on the space scale', () => {
    for (const key of ['formFooterPadTop', 'formFooterPadBottom', 'formFooterRowGap', 'formBodyPadBottom'] as const) {
      expect({ key, onScale: Object.values(space).includes(layout[key]) }).toEqual({ key, onScale: true });
    }
  });

  it('adds the safe-area inset only with the keyboard down — the keyboard already covers the home indicator', () => {
    const pad = layout.formFooterPadBottom;
    // Gesture-bar iPhone: 34 pt of inset below the button at rest, none of it once the keyboard is up.
    expect(formFooterPaddingBottom(false, 34)).toBe(34);
    expect(formFooterPaddingBottom(true, 34)).toBe(pad);
    // Home-button iPhone and most Androids report no inset: the pad is the floor, both ways.
    expect(formFooterPaddingBottom(false, 0)).toBe(pad);
    expect(formFooterPaddingBottom(true, 0)).toBe(pad);
    // An inset smaller than the pad never shrinks the footer below it.
    expect(formFooterPaddingBottom(false, pad - 2)).toBe(pad);
  });

  it('keeps the footer divider a fade that survives reduce motion, and owns no duration for the keyboard lift', () => {
    const e = motion.events.footerDividerFade;
    expect(e.duration).toBeLessThan(150);
    expect(e.reduced.kind).toBe('same');
    // The footer rides the keyboard's own curve. A Vitals token for that lift would desync them.
    expect(Object.keys(motion.events).filter((k) => /keyboard|footerLift/i.test(k))).toEqual([]);
  });
});

describe('undo toast timing (issue #83)', () => {
  it('auto-dismisses at the ten seconds the client asked for', () => {
    expect(interaction.undoAutoDismissMs).toBe(10_000);
  });

  it('no longer names a stale-undo ceiling: the store runs one wall-clock timer (issue #201)', () => {
    expect(interaction).not.toHaveProperty('undoCeilingMs');
    expect(interaction.undoDismissedBy).not.toContain('ceiling');
  });

  it('leaves long enough to read the toast and reach Undo one-handed', () => {
    // The toast must outlast its own entrance animation plus a reach; anything under a few
    // seconds is the 4 s timer the client rejected.
    expect(interaction.undoAutoDismissMs).toBeGreaterThan(motion.events.toastIn.duration + 4000);
  });
});

describe('serving steps (issue #93, decided in #88)', () => {
  const steps = interaction.servingSteps;

  it('names one step rule per serving preset, plus Custom', () => {
    expect([...servingPresetKeys]).toEqual(['100g', '100ml', 'cup', 'tbsp', 'tsp']);
    expect(Object.keys(steps).sort()).toEqual([...servingPresetKeys, 'custom'].sort());
  });

  it('keeps Custom at the client ruling: ½ steps up to 8 servings', () => {
    expect(steps.custom).toEqual({ increment: 0.5, max: 8 });
  });

  it('steps cup, tbsp and tsp in quarters, the way recipes measure them', () => {
    for (const key of ['cup', 'tbsp', 'tsp'] as const) expect({ key, increment: steps[key].increment }).toEqual({ key, increment: 0.25 });
  });

  it('lands every max on a whole step and keeps each strip short enough to scan', () => {
    for (const [key, { increment, max }] of Object.entries(steps)) {
      const count = max / increment;
      expect({ key, whole: Number.isInteger(count), scannable: count <= 16 }).toEqual({ key, whole: true, scannable: true });
      // Fractions render as ¼ ½ ¾ — no other increments exist.
      expect({ key, known: [0.25, 0.5].includes(increment) }).toEqual({ key, known: true });
    }
  });
});
