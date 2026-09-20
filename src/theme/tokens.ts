/**
 * Vitals design tokens — the single source of truth for colour, type, space, radius, size, motion,
 * interaction timing and haptics. Written from the Checkpoint 1 canvas (Specimen + Motion boards)
 * as revised in issue #16. Owner: design-lead.
 *
 * RULES
 *   - Screens use ONLY these names. If a value you need is missing, ask design-lead to name it —
 *     never hard-code it. Each token has exactly one job, stated in its comment. Borrowing a token
 *     for a different job because the value happens to match is how a palette rots.
 *   - Dark is the product; light is the courtesy. Both define identical keys (a test enforces it).
 *   - This file imports nothing. It is a leaf every layer may depend on.
 *
 * PICKING THE THEME
 *   const name = resolveThemeName(preference, useColorScheme());   // 'dark' | 'light'
 *   const { color, shadow, glow } = themes[name];
 *   <View style={{ backgroundColor: color.tile.bg }} />
 *
 * NAMING CONVENTION (tests rely on it)
 *   - A colour meant to be READ — text, glyphs, icons — lives under `text.*`, `data.*`, `state.*`, or
 *     ends in `Text` / `Icon`. Every such token must appear in `contrastPairs`, measured ≥ 4.5:1.
 *   - A pressed surface has `Press` in its name, and is measured as a background in `contrastPairs`.
 *   - A size that is a touch area ends in `Hit` and is ≥ `size.tapTargetMin`.
 */

/* =================================================================== theme */

export const themeNames = ['dark', 'light'] as const;
export type ThemeName = (typeof themeNames)[number];

/** The user's Settings → Appearance → Theme choice. */
export type ThemePreference = 'dark' | 'light' | 'auto';

/**
 * Which palette to render. An explicit choice wins; `auto` follows the phone; with no signal at all
 * the answer is dark, because dark is the product.
 */
export function resolveThemeName(preference: ThemePreference, system: string | null | undefined): ThemeName {
  if (preference !== 'auto') return preference;
  return system === 'light' ? 'light' : 'dark';
}

/* ================================================================== colour */

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Semantic palette, dark. Component tokens below are built from these and nothing else. */
const darkBase = {
  bg: {
    /** The ground behind every screen. Never pure black — pure black kills the ring glow and bands on OLED. */
    canvas: '#0C0E13',
    /** Cards, sheets, settings groups, the rings panel. */
    surface: '#17191F',
    /** Insets inside a card: stat cells, stepper value, segmented tracks, the search field. */
    raised: '#21252B',
    /** The quick-add tile and every tile-like button. One step above the card so it reads as a button. */
    tile: '#25282F',
    /** The pressed state of any tile, row, chip or neutral button. Still clears 4.5:1 under every label. */
    press: '#2C3038',
    /** A quick-add tile in its 900 ms "Logged" state: the calorie wash, flattened so text contrast is exact. */
    tileLogged: '#413931',
    /** Objects floating over content: the undo toast and the rest-timer bar. Opaque so contrast is guaranteed. */
    floating: '#21252B',
    /** The dim laid over a screen while a sheet is open. */
    scrim: 'rgba(5,6,9,0.62)',
    /** The tab bar. Translucent; measured against the brightest content that can scroll beneath it. */
    tabBar: 'rgba(12,14,19,0.86)',
  },
  line: {
    /** Every 1 pt divider and card border. */
    hairline: '#32353D',
    /** Dashed "add" affordances, selected-segment outlines, sheet grabbers. */
    strong: '#494D55',
    /** Dashed outlines for things that do not exist yet: an unlearned tile, an empty chart. */
    ghost: 'rgba(255,255,255,0.09)',
  },
  text: {
    /** Numbers, food names, screen titles. Everything you actually read. */
    primary: '#F5F7FA',
    /** Supporting text you are meant to read, just not first. */
    secondary: '#B4B7BE',
    /** Units, timestamps, eyebrows. The lowest rung — still ≥ 4.5:1 on every surface it is paired with. */
    tertiary: '#9598A0',
    /** A label or glyph sitting on a `data.kcal` fill (Undo, Log 185 g, the selected portion step). */
    onKcal: '#151006',
    /** A label or glyph sitting on a `data.strength` fill (set complete, Start session). */
    onStrength: '#180B1F',
    /** A label or glyph sitting on a `data.body` fill (Log today's weight). */
    onBody: '#071120',
    /** A label sitting on a `state.danger` fill (Delete, Discard session). */
    onDanger: '#1F0706',
  },
  data: {
    /** Calories, everywhere: the ring, the tile, the average line. Also the primary action colour on Today. */
    kcal: '#FAAB3F',
    /** Daily calorie points behind the average, and the base lap of an over-target calorie ring. Never text. */
    kcalMuted: '#8F6127',
    /** Protein, everywhere. Never used for anything that is not protein. */
    protein: '#57E0C6',
    /** Daily protein points behind the average, and the base lap of an over-target protein ring. Never text. */
    proteinMuted: '#307769',
    /** Body weight and its trend line. Owns the Charts tab. */
    body: '#96C0FE',
    /** Raw daily scale readings behind the trend. Never text. */
    bodyMuted: '#476A9C',
    /** Sets, reps, e1RM. Owns the Workout tab and the rest timer. */
    strength: '#E19FFF',
    /** Quiet strength marks: gridline accents behind the e1RM line. Never text. */
    strengthMuted: '#7C588D',
  },
  wash: {
    /** A translucent calorie tint: a search row in its "Logged" beat, the Create icon disc. */
    kcal: 'rgba(250,171,63,0.13)',
    /** A translucent protein tint for protein-owned highlights. */
    protein: 'rgba(87,224,198,0.13)',
    /** A translucent weight tint: the account avatar disc. */
    body: 'rgba(150,192,254,0.13)',
    /** A translucent strength tint: the active set block and set-index badges. */
    strength: 'rgba(225,159,255,0.13)',
  },
  state: {
    /** A target met, a trend going the right way, sync healthy. */
    success: '#7BD77F',
    /** Delete, discard a session, sync failure. Nothing else. */
    danger: '#F66D67',
  },
  fill: {
    /** A `data.kcal` button while the finger is down. */
    kcalPress: '#E39A38',
    /** A `data.strength` button while the finger is down. */
    strengthPress: '#CB8FE6',
    /** A `data.body` button while the finger is down. */
    bodyPress: '#86AEE6',
    /** A `state.danger` button while the finger is down. */
    dangerPress: '#DE625D',
  },
} as const;

export type BaseColors = Widen<typeof darkBase>;

const lightBase = {
  bg: {
    canvas: '#F9FAFD',
    surface: '#FFFFFF',
    raised: '#F1F3F8',
    tile: '#ECEEF4',
    press: '#E5E8ED',
    tileLogged: '#F7F0E8',
    floating: '#FFFFFF',
    scrim: 'rgba(20,24,34,0.32)',
    tabBar: 'rgba(249,250,253,0.92)',
  },
  line: {
    hairline: '#DBDEE3',
    strong: '#C1C4CB',
    ghost: 'rgba(20,24,34,0.07)',
  },
  text: {
    primary: '#1A1D24',
    secondary: '#575B63',
    tertiary: '#63666F',
    onKcal: '#FFFFFF',
    onStrength: '#FFFFFF',
    onBody: '#FFFFFF',
    onDanger: '#FFFFFF',
  },
  data: {
    kcal: '#A25302',
    kcalMuted: '#D79553',
    protein: '#037567',
    proteinMuted: '#63B4A3',
    body: '#2E62C9',
    bodyMuted: '#7FA5E6',
    strength: '#8E3EAE',
    strengthMuted: '#C094D6',
  },
  wash: {
    kcal: 'rgba(162,83,2,0.09)',
    protein: 'rgba(3,117,103,0.09)',
    body: 'rgba(46,98,201,0.09)',
    strength: 'rgba(142,62,174,0.09)',
  },
  state: {
    success: '#007936',
    danger: '#BE222A',
  },
  fill: {
    kcalPress: '#874502',
    strengthPress: '#763391',
    bodyPress: '#2651A7',
    dangerPress: '#9E1C23',
  },
} as const satisfies BaseColors;

/** Component tokens. Pure aliases of the semantic palette, so dark and light can never drift. */
function withComponents(c: BaseColors) {
  return {
    ...c,

    card: {
      /** A card's fill. */
      bg: c.bg.surface,
      /** A card's 1 pt border. */
      border: c.line.hairline,
    },

    sectionLabel: {
      /** The left-hand eyebrow over a section ("Quick add", "Today's log"). */
      labelText: c.text.secondary,
      /** The right-hand qualifier on the same line ("Ranked for 4 PM"). */
      metaText: c.text.tertiary,
    },

    arc: {
      /** The unfilled track of a calorie or protein ring. */
      track: c.line.hairline,
      /** The calorie progress stroke, up to the target. */
      kcal: c.data.kcal,
      /** The protein progress stroke, up to the target. */
      protein: c.data.protein,
      /** Over target: the first, completed lap drops to muted so the ring never reads as simply "full". */
      kcalOverBase: c.data.kcalMuted,
      /** Over target: the protein ring's completed first lap. */
      proteinOverBase: c.data.proteinMuted,
      /** Over target: the gap stroke cut around the second lap, so the overlap is visible in shape, not hue. */
      overKnockout: c.bg.surface,
      /** The target tick at 12 o'clock, drawn across the ring once a ring passes its target. */
      targetTickIcon: c.text.primary,
      /** The big number inside a ring. */
      valueText: c.text.primary,
      /** The eyebrow inside a ring ("KCAL"). */
      labelText: c.text.tertiary,
      /** "of 2,400" under the number. */
      captionText: c.text.secondary,
      /** "1,160 left" / "180 over" under the calorie ring. */
      kcalText: c.data.kcal,
      /** "84 g left" / "12 g past" under the protein ring. */
      proteinText: c.data.protein,
    },

    tile: {
      /** The quick-add tile at rest. */
      bg: c.bg.tile,
      /** The quick-add tile while the finger is down. */
      bgPress: c.bg.press,
      /** The quick-add tile for 900 ms after it logs. */
      bgLogged: c.bg.tileLogged,
      /** The resting tile border. */
      border: c.line.hairline,
      /** The 1.5 pt border of a tile that has just logged. */
      borderLogged: c.data.kcal,
      /** The dashed border of a not-yet-learned tile on day one. */
      ghostBorder: c.line.ghost,
      /** The food name. */
      nameText: c.text.primary,
      /** The calorie figure. */
      kcalText: c.data.kcal,
      /** The protein figure. */
      proteinText: c.data.protein,
      /** "kcal" / "P" beside the figures. */
      unitText: c.text.tertiary,
      /** "1 pot", bottom right — what one tap logs. */
      servingText: c.text.tertiary,
      /** The layered-plates glyph that marks a saved meal. */
      mealIcon: c.text.tertiary,
      /** The tick and "Logged" that replace the figures after a tap. */
      loggedText: c.data.kcal,
      /** The serving label while logged — one rung brighter, because the wash lifts the ground. */
      loggedServingText: c.text.secondary,
      /** The meal glyph while logged — same reason. */
      loggedMealIcon: c.text.secondary,
      /** The "×2" badge after a second tap inside the repeat window. */
      repeatBadgeBg: c.data.kcal,
      /** The "×2" on that badge. */
      repeatBadgeText: c.text.onKcal,
    },

    chip: {
      /** The weight / workout chips under the quick-add group. */
      bg: c.bg.surface,
      /** Those chips while pressed. */
      bgPress: c.bg.press,
      /** The chip eyebrow ("WEIGHT"). */
      labelText: c.text.tertiary,
      /** The chip value ("83.4"). */
      valueText: c.text.primary,
      /** The weight chip's glyph and delta. */
      weightAccentText: c.data.body,
      /** The workout chip's glyph and "4d". */
      workoutAccentText: c.data.strength,
      /** The round play button on the workout chip. */
      workoutCtaBg: c.data.strength,
      /** The play glyph on it. */
      workoutCtaIcon: c.text.onStrength,
    },

    searchBar: {
      /** The full-width "Search foods" bar under the quick-add grid. The only way into search. */
      bg: c.bg.surface,
      /** That bar while pressed. */
      bgPress: c.bg.press,
      /** Its resting border. */
      border: c.line.hairline,
      /** Its border on day one, when it is the first thing to tap. */
      borderEmphasis: c.data.kcal,
      /** The magnifier glyph. */
      searchIcon: c.text.secondary,
      /** "Search foods". */
      labelText: c.text.secondary,
      /** The magnifier on day one. */
      emphasisIcon: c.data.kcal,
      /** "Add your first food" on day one. */
      emphasisLabelText: c.text.primary,
    },

    searchSheet: {
      /** The search sheet's fill. */
      bg: c.bg.surface,
      /** The screen dim behind it. */
      scrim: c.bg.scrim,
      /** The drag handle at its top edge. */
      grabber: c.line.strong,
      /** The query field docked above the keyboard. */
      fieldBg: c.bg.raised,
      /** The field border — shown only while the field is not focused. */
      fieldBorder: c.line.hairline,
      /** The field border while typing (always, in practice: the sheet opens focused). */
      fieldBorderFocus: c.data.kcal,
      /** The text caret. */
      caret: c.data.kcal,
      /** What the user typed. */
      queryText: c.text.primary,
      /** "Search foods" while the query is empty. */
      placeholderText: c.text.tertiary,
      /** The magnifier inside the field. */
      fieldIcon: c.text.secondary,
      /** The clear-query ×. */
      clearIcon: c.text.tertiary,
      /** "Cancel", beside the field. */
      cancelText: c.text.primary,
      /** "Recent" / "Results". */
      sectionText: c.text.secondary,
      /** "14 days" / "3 matches". */
      sectionMetaText: c.text.tertiary,
    },

    resultRow: {
      /** A search result or recent food at rest. */
      bg: c.bg.surface,
      /** That row while pressed. */
      bgPress: c.bg.press,
      /** The row's "Logged" beat before the sheet closes. Translucent over `resultRow.bg`. */
      bgLogged: c.wash.kcal,
      /** The divider between rows. */
      divider: c.line.hairline,
      /** The food or meal name. */
      nameText: c.text.primary,
      /** "1 pot · 150 g" under the name. */
      servingText: c.text.tertiary,
      /** The calorie figure. */
      kcalText: c.data.kcal,
      /** The protein figure. */
      proteinText: c.data.protein,
      /** The meal glyph before a saved meal's name. */
      mealIcon: c.text.tertiary,
      /** The "MEAL" tag's fill. */
      mealTagBg: c.bg.raised,
      /** "MEAL". */
      mealTagText: c.text.secondary,
      /** The tick in the logged beat. */
      loggedIcon: c.data.kcal,
      /** "Logged" in the logged beat. */
      loggedText: c.data.kcal,
      /** The disc behind the + on the Create row. */
      createIconBg: c.wash.kcal,
      /** The + on the Create row. */
      createIcon: c.data.kcal,
      /** Create "boiled eggs". */
      createText: c.text.primary,
      /** "New food · logs one serving". */
      createMetaText: c.text.tertiary,
    },

    segmented: {
      /** The track of any segmented control: Presets/Exact, portion units, theme, chart range. */
      trackBg: c.bg.raised,
      /** An unselected option while pressed. */
      optionBgPress: c.bg.press,
      /** The selected option's fill. */
      selectedBg: c.bg.tile,
      /** The selected option's outline. */
      selectedBorder: c.line.strong,
      /** An unselected option's label. */
      optionText: c.text.tertiary,
      /** The selected option's label. */
      selectedText: c.text.primary,
    },

    portionSheet: {
      /** The portion sheet's fill. */
      bg: c.bg.surface,
      /** Its drag handle. */
      grabber: c.line.strong,
      /** The food name heading the sheet. */
      titleText: c.text.primary,
      /** The subtitle under the food name: "120 kcal · 20 g protein per 1 pot serving" (a saved meal:
       * "… per meal"). Wording from issue #90. */
      metaText: c.text.tertiary,
      /** A preset step (½ 1 1½ 2 3) at rest. */
      stepBg: c.bg.tile,
      /** A preset step while pressed. */
      stepBgPress: c.bg.press,
      /** A preset step's border. */
      stepBorder: c.line.hairline,
      /** A preset step's label. */
      stepText: c.text.primary,
      /** The calories printed under a preset step's label, so you know before you tap. */
      stepMetaText: c.text.tertiary,
      /** The step matching the food's usual serving. */
      stepSelectedBg: c.data.kcal,
      /** That step while pressed. */
      stepSelectedBgPress: c.fill.kcalPress,
      /** That step's label. */
      stepSelectedText: c.text.onKcal,
      /** The big amount readout ("185 g"). */
      readoutText: c.text.primary,
      /** The live calorie total for the chosen amount. */
      kcalText: c.data.kcal,
      /** The live protein total for the chosen amount. */
      proteinText: c.data.protein,
      /** "g", "kcal", "g protein" beside those figures. */
      unitText: c.text.tertiary,
      /** The full-width "Log 185 g" button in Exact mode. */
      logButtonBg: c.data.kcal,
      /** That button while pressed. */
      logButtonBgPress: c.fill.kcalPress,
      /** Its label. */
      logButtonText: c.text.onKcal,
    },

    slider: {
      /** The unfilled slider track. */
      track: c.line.hairline,
      /** The filled part of the track, from zero to the thumb. */
      fill: c.data.kcal,
      /** The draggable thumb. */
      thumb: c.data.kcal,
      /** The 3 pt ring cut around the thumb so it separates from the fill. */
      thumbRing: c.bg.surface,
      /** A detent tick at a preset position (100 g, 1 pot, 2 pots). */
      detentIcon: c.text.tertiary,
      /** The label under a detent tick. */
      detentText: c.text.tertiary,
      /** "0 g" at the left end and the current range top at the right — the top grows, it is not a max. */
      rangeText: c.text.tertiary,
      /** The −1 g / +1 g nudge buttons either side (step: `interaction.sliderNudgeG`). */
      nudgeBg: c.bg.tile,
      /** A nudge button while pressed. */
      nudgeBgPress: c.bg.press,
      /** The − / + glyph. */
      nudgeIcon: c.text.primary,
    },

    toast: {
      /** The undo toast. */
      bg: c.bg.floating,
      /** Its 1 pt border — calorie amber, because it only ever follows a food log. */
      border: c.data.kcal,
      /** The tick at its left. */
      checkIcon: c.data.kcal,
      /** "Rice, cooked" — what was logged. The haptic says something logged; only this says what. */
      titleText: c.text.primary,
      /** "195 kcal · 4 g protein" / "×2". */
      metaText: c.text.secondary,
      /** The Undo button. */
      undoBg: c.data.kcal,
      /** Undo while pressed. */
      undoBgPress: c.fill.kcalPress,
      /** "Undo". */
      undoText: c.text.onKcal,
    },

    tabBar: {
      /** The tab bar fill (translucent). */
      bg: c.bg.tabBar,
      /** Its top border. */
      border: c.line.hairline,
      /** An inactive tab's icon and label. */
      inactiveText: c.text.tertiary,
      /** The Today tab while active. */
      todayActiveText: c.data.kcal,
      /** The Workout tab while active. */
      workoutActiveText: c.data.strength,
      /** The Charts tab while active. */
      chartsActiveText: c.data.body,
      /** The Settings tab while active. */
      settingsActiveText: c.text.primary,
    },

    logRow: {
      /** A Today's-log row while pressed or mid-swipe. */
      bgPress: c.bg.press,
      /** The divider between log rows. */
      divider: c.line.hairline,
      /** "16:04". */
      timeText: c.text.tertiary,
      /** The food name. */
      nameText: c.text.primary,
      /** The calorie figure. */
      kcalText: c.data.kcal,
      /** The protein figure. */
      proteinText: c.data.protein,
    },

    stepper: {
      /** The − / + buttons on Workout, and on the food form's amount and nutrition steppers. */
      buttonBg: c.bg.tile,
      /** Those buttons while pressed. */
      buttonBgPress: c.bg.press,
      /** The − / + glyph. */
      buttonIcon: c.text.primary,
      /** The value well between the buttons. */
      valueBg: c.bg.raised,
      /** "80". */
      valueText: c.text.primary,
      /** "KG" / "REPS". */
      unitText: c.text.tertiary,
    },

    set: {
      /** The active set block's fill (translucent over the card). */
      activeBg: c.wash.strength,
      /** The active set block's border. */
      activeBorder: c.data.strength,
      /** "pre-filled from last session". */
      hintText: c.text.secondary,
      /** The "SET 3" badge fill. */
      badgeBg: c.data.strength,
      /** "SET 3". */
      badgeText: c.text.onStrength,
      /** A completed set's index badge fill (translucent over the card). */
      indexBg: c.wash.strength,
      /** A completed set's index number. */
      indexText: c.data.strength,
      /** A completed set's tick. */
      doneIcon: c.data.strength,
      /** "80 kg × 8" on a completed set. */
      valueText: c.text.primary,
      /** The big set-complete button. */
      completeBg: c.data.strength,
      /** Set-complete while pressed. */
      completeBgPress: c.fill.strengthPress,
      /** The tick on set-complete. */
      completeIcon: c.text.onStrength,
    },

    restBar: {
      /** The floating rest-timer bar. */
      bg: c.bg.floating,
      /** Its border. */
      border: c.data.strength,
      /** The depleting rest ring. */
      ring: c.data.strength,
      /** The rest ring's track. */
      ringTrack: c.line.hairline,
      /** "REST". */
      labelText: c.text.tertiary,
      /** "1:12". */
      timeText: c.text.primary,
      /** The +30s / Skip buttons. */
      buttonBg: c.bg.tile,
      /** Those buttons while pressed. */
      buttonBgPress: c.bg.press,
      /** "+30s". */
      buttonText: c.text.primary,
      /** "Skip" and its glyph. */
      skipText: c.text.secondary,
    },

    chart: {
      /** Horizontal gridlines. */
      gridline: c.line.hairline,
      /** The dashed target line. */
      targetLine: c.text.secondary,
      /** "target 2,400". */
      targetText: c.text.secondary,
      /** Axis dates and neutral tick labels. */
      axisText: c.text.tertiary,
      /** The dashed "cut starts" split line. */
      splitLine: c.text.tertiary,
      /** The halo stroked under a trend line so it lifts off the points behind it. */
      halo: c.bg.surface,
      /** Legend labels. */
      legendText: c.text.secondary,
      /** A delta going the right way ("−3.1 kg"). */
      deltaGoodText: c.state.success,
      /** A neutral delta ("−180 vs target"). */
      deltaNeutralText: c.text.secondary,
      /** A stat cell or callout well inside a chart card. */
      wellBg: c.bg.raised,
      /** The eyebrow in a stat cell. */
      wellLabelText: c.text.tertiary,
      /** Running text in a callout well. */
      wellText: c.text.secondary,
    },

    settings: {
      /** A settings group's fill. */
      groupBg: c.bg.surface,
      /** A settings row while pressed. */
      rowBgPress: c.bg.press,
      /** The group title above it ("TARGETS"). */
      groupTitleText: c.text.secondary,
      /** A row's label. */
      labelText: c.text.primary,
      /** A row's current value. */
      valueText: c.text.secondary,
      /** The disclosure chevron. */
      chevronIcon: c.text.tertiary,
      /** The note under a group. */
      noteText: c.text.tertiary,
      /** The avatar disc on the account card. */
      avatarBg: c.wash.body,
      /** The avatar glyph. */
      avatarIcon: c.data.body,
      /** The cloud disc when sync is off. */
      syncOffBg: c.wash.kcal,
      /** The cloud glyph when sync is off. */
      syncOffIcon: c.data.kcal,
      /** The dot beside "All caught up". */
      syncOkDot: c.state.success,
    },

    foodForm: {
      /*
       * The create / edit food form (issue #88): `app/foods/new`, `app/foods/[id]` and the search
       * sheet's `CreateFoodSheet`. The form sits on `bg.canvas` as a screen and on `bg.surface` inside
       * the sheet; every pair below is measured on both. Spec: design/food-form/canvas.
       */
      /** "Name", "Brand", "Label", "Amount" above a field. */
      fieldLabelText: c.text.secondary,
      /** A text field's well: Name, Brand, and a Custom serving's label. */
      fieldBg: c.bg.raised,
      /** Its 1 pt border at rest. */
      fieldBorder: c.line.hairline,
      /** Its 1.5 pt border while focused. */
      fieldBorderFocus: c.data.kcal,
      /** Its 1.5 pt border after a Save that this field blocked (a Custom serving with no label). */
      fieldBorderError: c.state.danger,
      /** The text caret. */
      caret: c.data.kcal,
      /** What the user typed. */
      inputText: c.text.primary,
      /** "Greek yoghurt", "Optional", "1 scoop" while a field is empty. */
      placeholderText: c.text.tertiary,
      /** The inline reason under a field that blocked Save ("Name the serving, e.g. 1 scoop"). */
      errorText: c.state.danger,

      /** The eyebrows "SERVING" and "PER 100 G" / "PER 100 ML". */
      sectionText: c.text.secondary,
      /** The right-hand hint on the SERVING eyebrow ("Nutrition is per 100 g"). */
      sectionMetaText: c.text.tertiary,

      /** A serving chip at rest (100 g · 100 ml · 1 cup · 1 tbsp · 1 tsp · Custom…). */
      chipBg: c.bg.tile,
      /** A chip while pressed. */
      chipBgPress: c.bg.press,
      /** A chip's 1 pt border at rest. */
      chipBorder: c.line.hairline,
      /** A chip's label at rest. */
      chipText: c.text.primary,
      /** The selected chip's fill: a calorie tint laid over the form ground. */
      chipSelectedBg: c.wash.kcal,
      /** The selected chip's heavier border (`size.foodForm.chipBorderSelected`). */
      chipSelectedBorder: c.data.kcal,
      /** The selected chip's label, in the bold cut (`type.controlSelected`). */
      chipSelectedText: c.text.primary,

      /** A preset's locked amount, e.g. "250 ml". Read-only: no well, no border, no −/+. */
      lockedAmountText: c.text.primary,
      /** "per 1 cup · volume" beside the locked amount. */
      lockedMetaText: c.text.tertiary,
      /** The small padlock glyph that leads the locked read-out. */
      lockIcon: c.text.tertiary,

      /** The calorie figure inside the kcal-per-100 stepper's value well. */
      kcalValueText: c.data.kcal,
      /** The protein figure inside the protein-per-100 stepper's value well. */
      proteinValueText: c.data.protein,

      /** The sticky footer holding the live preview and Save, in the create sheet (`CreateFoodSheet`).
       * Matches the sheet ground (`searchSheet.bg`), so the footer is one surface with the form. */
      footerBg: c.bg.surface,
      /** The same footer on a pushed screen (`/foods/new`, `/foods/[id]`), which sits on the canvas.
       * Never paint `footerBg` there: it would lay a lighter band across the bottom of the screen. */
      footerBgScreen: c.bg.canvas,
      /** The 1 pt line on the footer's top edge, shown once content scrolls beneath it. */
      footerDivider: c.line.hairline,
      /** The live preview strip: "1 scoop (33 g) = 132 kcal · 25 g protein". */
      previewBg: c.bg.raised,
      /** Its serving half: "1 scoop (33 g)". Truncates first; the numbers never do. */
      previewServingText: c.text.secondary,
      /** Its "=", "kcal" and "g protein". */
      previewUnitText: c.text.tertiary,
      /** Its calorie figure. */
      previewKcalText: c.data.kcal,
      /** Its protein figure. */
      previewProteinText: c.data.protein,
      /** "Past logs keep their numbers." under Save when editing an existing food. */
      historyNoteText: c.text.tertiary,
    },

    button: {
      /** A calorie-coloured primary button. */
      kcalBg: c.data.kcal,
      /** It, pressed. */
      kcalBgPress: c.fill.kcalPress,
      /** Its label. */
      kcalText: c.text.onKcal,
      /** A strength-coloured primary button. */
      strengthBg: c.data.strength,
      /** It, pressed. */
      strengthBgPress: c.fill.strengthPress,
      /** Its label. */
      strengthText: c.text.onStrength,
      /** A weight-coloured primary button. */
      bodyBg: c.data.body,
      /** It, pressed. */
      bodyBgPress: c.fill.bodyPress,
      /** Its label. */
      bodyText: c.text.onBody,
      /** A destructive confirm button. */
      dangerBg: c.state.danger,
      /** It, pressed. */
      dangerBgPress: c.fill.dangerPress,
      /** Its label. */
      dangerText: c.text.onDanger,
      /** An outlined secondary button's border. */
      secondaryBorder: c.line.strong,
      /** An outlined or neutral secondary button while pressed. */
      secondaryBgPress: c.bg.press,
      /** An outlined secondary button's label. */
      secondaryText: c.text.primary,
      /** A dashed "Add set" style button's border. */
      dashedBorder: c.line.strong,
      /** A dashed button's label. */
      dashedText: c.text.secondary,
    },
  } as const;
}

export type ColorTokens = ReturnType<typeof withComponents>;

type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

/** A dotted path to a colour token, e.g. `'tile.nameText'`. A typo is a type error. */
export type ColorPath = Paths<ColorTokens>;

/* ================================================================== depth */

export type ShadowTokens = {
  /** Card lift over the canvas. React Native `boxShadow` syntax. */
  readonly card: string;
  /** The 1 pt top highlight that makes a tile read as pressable. */
  readonly tile: string;
  /** A bottom sheet over the scrim. */
  readonly sheet: string;
  /** The undo toast and rest bar. */
  readonly floating: string;
  /** The soft bloom under a large calorie-coloured call to action. */
  readonly ctaKcal: string;
  /** The soft bloom under a large strength-coloured call to action. */
  readonly ctaStrength: string;
  /** The slider thumb. */
  readonly sliderThumb: string;
};

export type GlowTokens = {
  /** Blur radius of the coloured bloom under a progress arc. 0 = none. */
  readonly ringRadius: number;
  /** Opacity of that bloom. 0 = none (light theme: a glow on white reads as a smudge). */
  readonly ringOpacity: number;
};

export type Theme = {
  readonly name: ThemeName;
  readonly color: ColorTokens;
  readonly shadow: ShadowTokens;
  readonly glow: GlowTokens;
};

export const themes: { readonly [N in ThemeName]: Theme } = {
  dark: {
    name: 'dark',
    color: withComponents(darkBase),
    shadow: {
      card: '0 1px 0 rgba(255,255,255,0.045) inset, 0 8px 24px rgba(0,0,0,0.34)',
      tile: '0 1px 0 rgba(255,255,255,0.05) inset',
      sheet: '0 -12px 40px rgba(0,0,0,0.5)',
      floating: '0 8px 24px rgba(0,0,0,0.34)',
      ctaKcal: '0 8px 26px rgba(250,171,63,0.22)',
      ctaStrength: '0 8px 26px rgba(225,159,255,0.2)',
      sliderThumb: '0 1px 3px rgba(0,0,0,0.4)',
    },
    glow: { ringRadius: 10, ringOpacity: 0.33 },
  },
  light: {
    name: 'light',
    color: withComponents(lightBase),
    shadow: {
      card: '0 1px 2px rgba(20,24,34,0.05), 0 8px 24px rgba(20,24,34,0.06)',
      tile: '0 1px 2px rgba(20,24,34,0.05)',
      sheet: '0 -12px 40px rgba(20,24,34,0.14)',
      floating: '0 1px 2px rgba(20,24,34,0.05), 0 8px 24px rgba(20,24,34,0.1)',
      ctaKcal: '0 8px 22px rgba(162,83,2,0.22)',
      ctaStrength: '0 8px 22px rgba(142,62,174,0.22)',
      sliderThumb: '0 1px 3px rgba(20,24,34,0.25)',
    },
    glow: { ringRadius: 0, ringOpacity: 0 },
  },
};

/* ================================================================ contrast */

/** WCAG AA for text and icons. Every pair below must clear it, in both themes. */
export const MIN_TEXT_CONTRAST = 4.5;

/** Layers beneath a foreground, bottom first. The first must be opaque; the rest are composited on it. */
export type Ground = readonly [ColorPath, ...ColorPath[]];

/** A foreground colour and the ground it is allowed to sit on. */
export type ContrastPair = { readonly fg: ColorPath; readonly on: Ground };

const measure = (fgs: readonly ColorPath[], ...grounds: readonly Ground[]): ContrastPair[] =>
  fgs.flatMap((fg) => grounds.map((on) => ({ fg, on })));

/**
 * Every sanctioned foreground/background combination. If a screen puts a foreground on a ground that
 * is not listed here, it is unmeasured — add the pair (and let the test judge it) before shipping.
 * The tab bar is measured over the canvas AND over `text.primary`, the brightest thing that can
 * scroll beneath it.
 */
export const contrastPairs: readonly ContrastPair[] = [
  // semantic foundations
  ...measure(['text.primary', 'text.secondary', 'text.tertiary'], ['bg.canvas'], ['bg.surface'], ['bg.raised'], ['bg.tile'], ['bg.press'], ['bg.floating']),
  ...measure(['data.kcal', 'data.protein', 'data.body', 'data.strength'], ['bg.canvas'], ['bg.surface'], ['bg.raised'], ['bg.tile'], ['bg.press']),
  ...measure(['state.success', 'state.danger'], ['bg.canvas'], ['bg.surface'], ['bg.raised']),
  ...measure(['text.onKcal'], ['data.kcal'], ['fill.kcalPress']),
  ...measure(['text.onStrength'], ['data.strength'], ['fill.strengthPress']),
  ...measure(['text.onBody'], ['data.body'], ['fill.bodyPress']),
  ...measure(['text.onDanger'], ['state.danger'], ['fill.dangerPress']),
  ...measure(['text.primary', 'data.kcal'], ['bg.tileLogged']),

  // Today
  ...measure(['sectionLabel.labelText', 'sectionLabel.metaText'], ['bg.canvas'], ['card.bg']),
  ...measure(['arc.targetTickIcon', 'arc.valueText', 'arc.labelText', 'arc.captionText', 'arc.kcalText', 'arc.proteinText'], ['card.bg']),
  ...measure(['tile.nameText', 'tile.kcalText', 'tile.proteinText', 'tile.unitText', 'tile.servingText', 'tile.mealIcon'], ['tile.bg'], ['tile.bgPress']),
  ...measure(['tile.nameText', 'tile.loggedText', 'tile.loggedServingText', 'tile.loggedMealIcon'], ['tile.bgLogged']),
  ...measure(['tile.repeatBadgeText'], ['tile.repeatBadgeBg']),
  ...measure(['chip.labelText', 'chip.valueText', 'chip.weightAccentText', 'chip.workoutAccentText'], ['chip.bg'], ['chip.bgPress']),
  ...measure(['chip.workoutCtaIcon'], ['chip.workoutCtaBg']),
  ...measure(['searchBar.searchIcon', 'searchBar.labelText', 'searchBar.emphasisIcon', 'searchBar.emphasisLabelText'], ['searchBar.bg'], ['searchBar.bgPress']),
  ...measure(['logRow.timeText', 'logRow.nameText', 'logRow.kcalText', 'logRow.proteinText'], ['bg.canvas'], ['logRow.bgPress']),
  ...measure(['toast.checkIcon', 'toast.titleText', 'toast.metaText'], ['toast.bg']),
  ...measure(['toast.undoText'], ['toast.undoBg'], ['toast.undoBgPress']),

  // search
  ...measure(['searchSheet.queryText', 'searchSheet.placeholderText', 'searchSheet.fieldIcon', 'searchSheet.clearIcon'], ['searchSheet.fieldBg']),
  ...measure(['searchSheet.cancelText', 'searchSheet.sectionText', 'searchSheet.sectionMetaText'], ['searchSheet.bg']),
  ...measure(
    ['resultRow.nameText', 'resultRow.servingText', 'resultRow.kcalText', 'resultRow.proteinText', 'resultRow.mealIcon', 'resultRow.createText', 'resultRow.createMetaText'],
    ['resultRow.bg'],
    ['resultRow.bgPress'],
  ),
  ...measure(['resultRow.nameText', 'resultRow.servingText', 'resultRow.loggedIcon', 'resultRow.loggedText', 'resultRow.mealIcon'], ['resultRow.bg', 'resultRow.bgLogged']),
  ...measure(['resultRow.mealTagText'], ['resultRow.mealTagBg']),
  ...measure(['resultRow.createIcon'], ['resultRow.bg', 'resultRow.createIconBg']),

  // portion sheet, slider, segmented
  ...measure(['portionSheet.titleText', 'portionSheet.metaText', 'portionSheet.readoutText', 'portionSheet.kcalText', 'portionSheet.proteinText', 'portionSheet.unitText'], ['portionSheet.bg']),
  ...measure(['portionSheet.stepText', 'portionSheet.stepMetaText'], ['portionSheet.stepBg'], ['portionSheet.stepBgPress']),
  ...measure(['portionSheet.stepSelectedText'], ['portionSheet.stepSelectedBg'], ['portionSheet.stepSelectedBgPress']),
  ...measure(['portionSheet.logButtonText'], ['portionSheet.logButtonBg'], ['portionSheet.logButtonBgPress']),
  ...measure(['slider.detentIcon', 'slider.detentText', 'slider.rangeText'], ['portionSheet.bg']),
  ...measure(['slider.nudgeIcon'], ['slider.nudgeBg'], ['slider.nudgeBgPress']),
  ...measure(['segmented.optionText'], ['segmented.trackBg'], ['segmented.optionBgPress']),
  ...measure(['segmented.selectedText'], ['segmented.selectedBg']),

  // tab bar
  ...measure(
    ['tabBar.inactiveText', 'tabBar.todayActiveText', 'tabBar.workoutActiveText', 'tabBar.chartsActiveText', 'tabBar.settingsActiveText'],
    ['bg.canvas', 'tabBar.bg'],
    ['text.primary', 'tabBar.bg'],
  ),

  // Workout
  ...measure(['stepper.buttonIcon'], ['stepper.buttonBg'], ['stepper.buttonBgPress']),
  ...measure(['stepper.valueText', 'stepper.unitText'], ['stepper.valueBg']),
  ...measure(['set.hintText', 'set.valueText'], ['card.bg', 'set.activeBg']),
  ...measure(['set.indexText'], ['card.bg', 'set.indexBg']),
  ...measure(['set.doneIcon', 'set.valueText'], ['card.bg']),
  ...measure(['set.badgeText'], ['set.badgeBg']),
  ...measure(['set.completeIcon'], ['set.completeBg'], ['set.completeBgPress']),
  ...measure(['restBar.labelText', 'restBar.timeText', 'restBar.skipText'], ['restBar.bg']),
  ...measure(['restBar.buttonText', 'restBar.skipText'], ['restBar.buttonBg'], ['restBar.buttonBgPress']),

  // Charts
  ...measure(['chart.targetText', 'chart.axisText', 'chart.legendText', 'chart.deltaGoodText', 'chart.deltaNeutralText'], ['card.bg']),
  ...measure(['chart.wellLabelText', 'chart.wellText', 'chart.deltaGoodText', 'data.kcal'], ['chart.wellBg']),

  // Settings
  ...measure(['settings.groupTitleText', 'settings.noteText'], ['bg.canvas']),
  ...measure(['settings.labelText', 'settings.valueText', 'settings.chevronIcon'], ['settings.groupBg'], ['settings.rowBgPress']),
  ...measure(['settings.avatarIcon'], ['settings.groupBg', 'settings.avatarBg']),
  ...measure(['settings.syncOffIcon'], ['settings.groupBg', 'settings.syncOffBg']),

  // food form (issue #88) — a screen on the canvas, or the create sheet on the surface
  ...measure(
    ['foodForm.fieldLabelText', 'foodForm.errorText', 'foodForm.sectionText', 'foodForm.sectionMetaText', 'foodForm.lockedAmountText', 'foodForm.lockedMetaText', 'foodForm.lockIcon', 'foodForm.historyNoteText'],
    ['bg.canvas'],
    ['bg.surface'],
  ),
  ...measure(['foodForm.inputText', 'foodForm.placeholderText'], ['foodForm.fieldBg']),
  ...measure(['foodForm.chipText'], ['foodForm.chipBg'], ['foodForm.chipBgPress']),
  ...measure(['foodForm.chipSelectedText'], ['bg.canvas', 'foodForm.chipSelectedBg'], ['bg.surface', 'foodForm.chipSelectedBg']),
  ...measure(['foodForm.kcalValueText', 'foodForm.proteinValueText'], ['stepper.valueBg']),
  ...measure(
    ['foodForm.previewServingText', 'foodForm.previewUnitText', 'foodForm.previewKcalText', 'foodForm.previewProteinText'],
    ['foodForm.footerBg', 'foodForm.previewBg'],
    ['foodForm.footerBgScreen', 'foodForm.previewBg'],
  ),

  // buttons
  ...measure(['button.kcalText'], ['button.kcalBg'], ['button.kcalBgPress']),
  ...measure(['button.strengthText'], ['button.strengthBg'], ['button.strengthBgPress']),
  ...measure(['button.bodyText'], ['button.bodyBg'], ['button.bodyBgPress']),
  ...measure(['button.dangerText'], ['button.dangerBg'], ['button.dangerBgPress']),
  ...measure(['button.secondaryText', 'button.dashedText'], ['bg.canvas'], ['card.bg'], ['button.secondaryBgPress']),
];

/* ==================================================================== type */

/**
 * Static font instances, cut from the Archivo variable font at exactly these axis values. React Native
 * cannot drive a variable axis, so each (weight, width) the design uses ships as its own file, loaded
 * with expo-font under the key shown. Canvas weights between instances map down: 550 → Medium,
 * 600 → SemiBold.
 */
export const fontInstances = {
  /** Running text: log rows, settings rows, the search query. */
  'Archivo-Book': { wght: 450, wdth: 100 },
  /** Captions, labels, inactive tab labels. */
  'Archivo-Medium': { wght: 500, wdth: 100 },
  /** Tile names, eyebrows, units, small controls. */
  'Archivo-SemiBold': { wght: 650, wdth: 100 },
  /** The selected option in a segmented control. */
  'Archivo-Bold': { wght: 700, wdth: 100 },
  /** Card titles, exercise names, sheet titles. */
  'Archivo-Title': { wght: 700, wdth: 104 },
  /** Every number outside a ring: expanded so figures read as instrument readouts. */
  'Archivo-Numeric': { wght: 700, wdth: 108 },
  /** Screen titles, chart hero stats, the stepper value. */
  'Archivo-Display': { wght: 700, wdth: 116 },
  /** The number inside a ring. */
  'Archivo-DisplayXl': { wght: 700, wdth: 118 },
} as const;

export type FontFamily = keyof typeof fontInstances;

/** A React Native text style. Sizes, line heights and letter spacing are absolute points. */
export type TypeStyle = {
  readonly fontFamily: FontFamily;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly textTransform?: 'uppercase';
  readonly fontVariant?: readonly ['tabular-nums'];
};

const TAB = ['tabular-nums'] as const;

export const type = {
  /** The number inside a ring, and nothing else. */
  displayXl: { fontFamily: 'Archivo-DisplayXl', fontSize: 33, lineHeight: 33, letterSpacing: -0.73, fontVariant: TAB },
  /** Screen titles ("Today"). */
  displayLg: { fontFamily: 'Archivo-Display', fontSize: 25, lineHeight: 27, letterSpacing: -0.45 },
  /** The headline stat on a chart card ("81.2"). */
  statHero: { fontFamily: 'Archivo-Display', fontSize: 30, lineHeight: 32, letterSpacing: -0.54, fontVariant: TAB },
  /** The value between the stepper buttons ("80"). */
  stepperValue: { fontFamily: 'Archivo-Display', fontSize: 23, lineHeight: 24, letterSpacing: -0.41, fontVariant: TAB },
  /** The large portion readout in Exact mode ("185 g"). */
  portionReadout: { fontFamily: 'Archivo-Display', fontSize: 30, lineHeight: 32, letterSpacing: -0.54, fontVariant: TAB },
  /** The session title during a workout ("Push A"). */
  sessionTitle: { fontFamily: 'Archivo-Title', fontSize: 21, lineHeight: 25, letterSpacing: -0.25 },
  /** Large primary call-to-action labels ("Start an empty session"). */
  ctaLarge: { fontFamily: 'Archivo-Title', fontSize: 20, lineHeight: 24, letterSpacing: -0.24 },
  /** Card titles, exercise names, sheet titles. */
  title: { fontFamily: 'Archivo-Title', fontSize: 19, lineHeight: 23, letterSpacing: -0.23 },
  /** The one-sentence answer heading a chart card. */
  headline: { fontFamily: 'Archivo-SemiBold', fontSize: 17, lineHeight: 20, letterSpacing: -0.1 },
  /** What the user types into the search field and the add-food form. */
  input: { fontFamily: 'Archivo-Book', fontSize: 17, lineHeight: 22, letterSpacing: 0 },
  /** The quick-add tile name and a search row's name — the size tuned for arm's length (decision 1). */
  tileName: { fontFamily: 'Archivo-SemiBold', fontSize: 16.5, lineHeight: 19, letterSpacing: -0.1 },
  /** Standard button labels ("Log today's weight", "Log 185 g", "Save & log"). */
  button: { fontFamily: 'Archivo-SemiBold', fontSize: 15.5, lineHeight: 18, letterSpacing: -0.09 },
  /** Log rows, settings rows, running text. */
  body: { fontFamily: 'Archivo-Book', fontSize: 15, lineHeight: 20, letterSpacing: 0 },
  /** Tile figures and every mid-size number. */
  numeric: { fontFamily: 'Archivo-Numeric', fontSize: 15, lineHeight: 15, letterSpacing: -0.12, fontVariant: TAB },
  /** Rest timer, portion-step labels, sheet totals. */
  numericLg: { fontFamily: 'Archivo-Numeric', fontSize: 20, lineHeight: 20, letterSpacing: -0.16, fontVariant: TAB },
  /** Chip values, completed-set weights. */
  numericMd: { fontFamily: 'Archivo-Numeric', fontSize: 16, lineHeight: 16, letterSpacing: -0.13, fontVariant: TAB },
  /** Settings row values. */
  numericRow: { fontFamily: 'Archivo-Numeric', fontSize: 14.5, lineHeight: 15, letterSpacing: -0.12, fontVariant: TAB },
  /** Log-row and search-row figures, "Logged", "+30s". */
  numericSm: { fontFamily: 'Archivo-Numeric', fontSize: 13.5, lineHeight: 14, letterSpacing: -0.11, fontVariant: TAB },
  /** Log times, set-index numbers. */
  numericXs: { fontFamily: 'Archivo-Numeric', fontSize: 12, lineHeight: 12, letterSpacing: -0.1, fontVariant: TAB },
  /** Small control labels: Undo, Cancel, Skip, Sync now, unselected segments. */
  control: { fontFamily: 'Archivo-SemiBold', fontSize: 13.5, lineHeight: 16, letterSpacing: 0 },
  /** The selected segment's label. */
  controlSelected: { fontFamily: 'Archivo-Bold', fontSize: 13.5, lineHeight: 16, letterSpacing: 0 },
  /** Captions, secondary lines, the serving line under a search row. */
  label: { fontFamily: 'Archivo-Medium', fontSize: 12.5, lineHeight: 16, letterSpacing: 0 },
  /** "of 2,400" under a ring number. */
  ringCaption: { fontFamily: 'Archivo-Medium', fontSize: 11.5, lineHeight: 14, letterSpacing: 0 },
  /** The tile's serving label, legends, delta sub-lines. */
  caption: { fontFamily: 'Archivo-Medium', fontSize: 11, lineHeight: 14, letterSpacing: 0 },
  /** Units beside a number ("kcal", "P"). */
  unit: { fontFamily: 'Archivo-SemiBold', fontSize: 10.5, lineHeight: 12, letterSpacing: 0.21 },
  /** Section eyebrows, the MEAL tag. Never for anything you must read. */
  micro: { fontFamily: 'Archivo-SemiBold', fontSize: 10.5, lineHeight: 11, letterSpacing: 1.47, textTransform: 'uppercase' },
  /** Eyebrows inside rings, chips, stat cells and the rest bar. */
  microSm: { fontFamily: 'Archivo-SemiBold', fontSize: 9.5, lineHeight: 10, letterSpacing: 1.33, textTransform: 'uppercase' },
  /** An inactive tab label. */
  tabLabel: { fontFamily: 'Archivo-Medium', fontSize: 10, lineHeight: 12, letterSpacing: 0.1 },
  /** The active tab label. */
  tabLabelActive: { fontFamily: 'Archivo-SemiBold', fontSize: 10, lineHeight: 12, letterSpacing: 0.1 },
  /** Chart tick values. */
  axis: { fontFamily: 'Archivo-SemiBold', fontSize: 9.5, lineHeight: 10, letterSpacing: 0.19, fontVariant: TAB },
  /** Chart axis dates ("Jun", "today"). */
  axisCaption: { fontFamily: 'Archivo-Medium', fontSize: 9, lineHeight: 10, letterSpacing: 0 },
  /** In-chart markers ("CUT STARTS", "KG"). */
  axisMarker: { fontFamily: 'Archivo-SemiBold', fontSize: 8.5, lineHeight: 9, letterSpacing: 1.02, textTransform: 'uppercase' },
} as const satisfies Record<string, TypeStyle>;

export type TypeRole = keyof typeof type;

/* =================================================================== space */

/** Nine steps, no ad-hoc values. */
export const space = {
  /** The tightest gap: a micro label above the number it names. */
  1: 4,
  /** Inside a control — icon to label, number to unit. */
  2: 6,
  /** Between a section eyebrow and the thing it heads. */
  3: 8,
  /** Between quick-add tiles, between the grid and the search bar, between the two chips. */
  4: 10,
  /** The default gap between two cards. If unsure, it is this one. */
  5: 12,
  /** Card padding; the gutter on Workout, Charts, Settings and in sheets. */
  6: 16,
  /** The Today gutter — Today gets more air than any other screen. */
  7: 20,
  /** Between two settings groups. */
  8: 24,
  /** Above a screen-level heading in a long scroll. */
  9: 32,
} as const;

export type SpaceStep = keyof typeof space;

/** Named layout distances — each one is a `space` step given a job. */
export const layout = {
  /** Side gutter on Today. */
  gutterToday: space[7],
  /** Side gutter on Workout, Charts, Settings, and inside sheets. */
  gutter: space[6],
  /** Padding inside a card. */
  cardPadding: space[6],
  /** Gap between stacked cards. */
  cardGap: space[5],
  /** Gap between quick-add tiles, and between the grid and the search bar beneath it. */
  tileGap: space[4],
  /** Gap between settings groups. */
  groupGap: space[8],
  /** How far the undo toast and rest bar float above the tab bar. */
  floatAboveTabBar: space[5],

  /* ------------------------------------------------------------- the form frame (issue #207)
   * One pattern for every form in Vitals — a scrolling body and an action footer that never
   * scrolls and rides the keyboard. FoodForm is the first adopter; the second and third form
   * reuse these four distances unchanged. Ruling and boards: design/keyboard-footer/canvas. */

  /** The pinned footer's top padding: between its divider hairline and its first row. */
  formFooterPadTop: space[4],
  /**
   * The pinned footer's bottom padding, and the floor under the safe-area inset when the keyboard
   * is down. Never read it directly for a bottom padding — call `formFooterPaddingBottom()`, which
   * holds the one rule: with the keyboard up this pad and nothing else (the keyboard already
   * covers the home indicator, so adding the inset again leaves a dead band under the button);
   * with the keyboard down, whichever is larger of this pad and the inset.
   */
  formFooterPadBottom: space[4],
  /** The gap between the footer's own rows: preview strip ↔ action row ↔ the keyboard-down note. */
  formFooterRowGap: space[4],
  /**
   * Bottom padding on the form body's scroll content. The footer is outside the scroll view, so
   * this is not clearance for it — it is the breath that lets the last control come to rest clear
   * of the divider instead of flush against it.
   */
  formBodyPadBottom: space[6],
} as const;

/**
 * The pinned form footer's bottom padding, in points — the single rule behind
 * `layout.formFooterPadBottom`, written once so no form can get it half right.
 *
 * `safeAreaBottom` is `useSafeAreaInsets().bottom`: 34 on a gesture-bar iPhone, 0 on a
 * home-button one and on most Androids.
 *
 *   keyboard up   → the pad alone. The keyboard is already sitting on the home indicator; adding
 *                   the inset on top of it pushes the button up off a band of dead keyboard.
 *   keyboard down → `max(inset, pad)`. The inset clears the gesture bar where there is one, and
 *                   the pad keeps the button off the screen edge where there is not.
 */
export function formFooterPaddingBottom(keyboardVisible: boolean, safeAreaBottom: number): number {
  return keyboardVisible ? layout.formFooterPadBottom : Math.max(safeAreaBottom, layout.formFooterPadBottom);
}

/* ================================================================== radius */

/** Radius encodes size: the bigger the object, the rounder. */
export const radius = {
  /** Set-index badges, the MEAL tag, micro pills inside a row. */
  xs: 8,
  /** A segment inside a segmented track; small utility buttons. */
  sm: 10,
  /** Steppers, stat cells, portion steps, the search field, primary buttons. */
  md: 14,
  /** The quick-add tile, the search bar, the chips, settings groups. */
  lg: 18,
  /** Sheets (top corners), the undo toast, the rest bar, the account card. */
  xl: 22,
  /** Cards. The largest thing on any screen, so the roundest. */
  card: 24,
  /** Genuinely pill-shaped things: avatars, dots, grabbers, slider track and thumb. */
  pill: 999,
} as const;

/* ==================================================================== size */

export const size = {
  /** The floor. No touch area in the app is smaller. */
  tapTargetMin: 44,

  icon: {
    /** Tab bar glyphs — the `glyph.tab` Ionicons, passed as the icon's `size`. */
    tab: 23,
    /** The trash can on the swipe-revealed delete button (`glyph.delete`). Larger than a row glyph:
     * it is the only thing on a solid red button and has to read at arm's length, mid-swipe. */
    deleteAction: 22,
    /** Header and field glyphs. */
    lg: 21,
    /** Row and button glyphs. */
    md: 19,
    /** Inline glyphs beside a label. */
    sm: 15,
    /** Stroke width for every hand-drawn SVG icon at rest (24 pt grid). Font glyphs (`glyph.*`)
     * have no stroke; they mark state by swapping to their filled cut instead. */
    stroke: 1.75,
    /** Stroke width for an active hand-drawn SVG icon. */
    strokeActive: 2,
  },

  tabBar: {
    /** Tab bar height above the home indicator. */
    height: 58,
    /** Each tab's touch area: the full-height strip, not just the icon. */
    itemHit: 58,
  },

  tile: {
    /** Quick-add tile height (width is half the row). */
    height: 80,
    /** Touch area — the whole tile. */
    heightHit: 80,
    /** Maximum lines for the food name before it truncates. */
    nameLines: 2,
    /** Border width in the logged state. */
    borderLogged: 1.5,
    /** Scale while the finger is down. */
    pressScale: 0.972,
    /** Diameter of the ×2 repeat badge. */
    repeatBadge: 22,
  },

  chip: {
    /** Weight / workout chip height. */
    height: 54,
    /** Its touch area. */
    heightHit: 54,
    /** The play button on the workout chip (visual; the whole chip is the touch area). */
    cta: 30,
  },

  searchBar: {
    /** The "Search foods" bar height. */
    height: 50,
    /** Its touch area — the full width and height. */
    heightHit: 50,
  },

  searchSheet: {
    /** The query field height. */
    fieldHeight: 48,
    /** The clear-query × touch area. */
    clearHit: 44,
    /** The Cancel button touch area. */
    cancelHit: 44,
    /** Grabber width. */
    grabberWidth: 36,
    /** Grabber height. */
    grabberHeight: 5,
    /** Gap between the sheet's top edge and the status bar. */
    topInset: 10,
  },

  resultRow: {
    /** A search result / recent / Create row height. */
    height: 60,
    /** Its touch area. */
    heightHit: 60,
    /** The Create row's + disc. */
    createDisc: 32,
  },

  portionSheet: {
    /** Minimum preset step width (the five steps share the row: ½ 1 1½ 2 3). */
    stepWidth: 56,
    /** Preset step height: its label plus its calories. */
    stepHeight: 56,
    /** Preset step touch height — the whole step. */
    stepHit: 56,
    /** The Presets / Exact switch, and the unit segments, touch height (painted at 36). */
    segmentHit: 44,
    /** Painted segment height. */
    segmentPainted: 36,
    /** "Log 185 g" button height. */
    logButtonHit: 52,
  },

  slider: {
    /** Track thickness. */
    track: 6,
    /** Thumb diameter. */
    thumb: 28,
    /** Thumb touch area. */
    thumbHit: 44,
    /** Ring cut around the thumb. */
    thumbRing: 3,
    /** Detent tick width. */
    detentWidth: 2,
    /** Detent tick height. */
    detentHeight: 10,
    /** −1 g / +1 g nudge width (step: `interaction.sliderNudgeG`). */
    nudgeWidth: 56,
    /** Nudge touch height. */
    nudgeHit: 48,
  },

  toast: {
    /** Undo toast height. */
    height: 64,
    /** The Undo button's touch height. */
    undoHit: 44,
    /** The Undo button's minimum width. */
    undoMinWidth: 84,
  },

  arc: {
    /** Ring diameter on Today. */
    diameter: 118,
    /** Ring stroke. */
    stroke: 10,
    /** Width of the knockout cut either side of the over-target second lap. */
    overKnockout: 3,
    /** Length of the target tick drawn across the ring at 12 o'clock once past target. */
    targetTickLength: 16,
    /** Width of that tick. */
    targetTickWidth: 2,
  },

  stepper: {
    /** − / + width. */
    buttonWidth: 56,
    /** − / + touch height. */
    buttonHit: 48,
    /** Set-complete button width. */
    completeWidth: 66,
    /** Set-complete touch height (spans both steppers). */
    completeHit: 102,
  },

  segmented: {
    /** A settings segment painted height. */
    painted: 34,
    /** Its touch height, extended with hitSlop to the row. */
    optionHit: 48,
    /** The chart range switcher's segment touch height. */
    rangeHit: 44,
  },

  row: {
    /** A settings row height. */
    settings: 52,
    /** A settings row touch height. */
    settingsHit: 52,
    /** A Today's-log row painted height. */
    log: 40,
    /** A Today's-log row touch height (hitSlop 2 pt top and bottom). */
    logHit: 44,
  },

  deleteButton: {
    /** The swipe-revealed delete button on a Today's-log row: a square, painted this size, centred
     * vertically in the row and sitting on the row's trailing edge. Corners `radius.sm`, fill
     * `state.danger`, glyph `glyph.delete` at `size.icon.deleteAction`. Not a full-height strip. */
    side: 36,
    /** Its touch area — square, extended past the painted button (hitSlop 4 pt each side). */
    sideHit: 44,
    /** The gap between the row's content (the protein figure) and the button, showing the theme
     * background. A layout gap, never a whitespace character. The row slides open by `gap + side`. */
    gap: space[4],
  },

  restBar: {
    /** Rest-timer bar height. */
    height: 66,
    /** +30s / Skip touch height (painted at 40). */
    buttonHit: 44,
  },

  foodForm: {
    /** Serving chips per row. Six chips (five presets + Custom…) do not fit one line at 375 pt, so
     * they wrap to a fixed 3 × 2 grid — every chip visible at once, none behind a scroll. */
    chipColumns: 3,
    /** A chip's painted height and its touch area — the whole chip. */
    chipHit: 44,
    /** The gap between chips, both ways. */
    chipGap: space[3],
    /** A chip's border at rest. */
    chipBorder: 1,
    /** The selected chip's border — heavier, so selection is shape as well as colour. */
    chipBorderSelected: 1.5,
    /** A text field's height (Name, Brand, Custom label). Also its touch area. */
    fieldHit: 48,
    /** Every hairline on the form at rest: text fields, the Cancel button, the selected Weight | Volume
     * segment. `StyleSheet.hairlineWidth` on device; 1 pt on the canvas. */
    fieldBorderWidth: 1,
    /** The focus ring on a text field or a stepper's value well while it is being typed into, and the
     * error outline — heavier than rest, so focus reads as shape as well as colour. */
    fieldBorderWidthFocus: 1.5,
    /** The locked preset read-out ("250 ml · per 1 cup · volume") — the same slot the Custom fields
     * open into, so picking Custom grows the form downward instead of moving the chips. */
    lockedRowHeight: 48,
    /** The padlock glyph in that read-out — the inline-glyph size (`icon.sm`), drawn at `icon.stroke`. */
    lockIcon: 15,
    /** The −/+ width on the side-by-side kcal and protein steppers (the Workout stepper's 56 would
     * leave no room for the value). The whole value well between them is the tap-to-type target (#87). */
    nutritionButtonWidth: 44,
    /** Their touch height, and the value well's. */
    nutritionHit: 48,
    /** The gap between a food-form stepper's −, value well and + — tighter than the Workout stepper's
     * `space[3]`, so two steppers fit side by side on a 375 pt phone. */
    stepperGap: space[1],
    /** The gap between the kcal and protein steppers. */
    nutritionGap: space[4],
    /** The live preview strip's height above Save. */
    previewHeight: 44,
  },

  button: {
    /** Standard primary button height. */
    primaryHit: 52,
    /** Header action touch height (Finish, Cancel). */
    headerHit: 44,
    /** Large call-to-action height (empty-state starts). */
    ctaHit: 86,
  },
} as const;

/**
 * Which icon is drawn, by name. One family for the whole app: Ionicons from `@expo/vector-icons`,
 * which ships with Expo and runs in Expo Go (no native module). Chosen because every glyph the app
 * needs comes in a matched outline + filled pair, so state is carried by shape as well as colour.
 *
 * Colour comes from the component tokens (`tabBar.*ActiveText` / `tabBar.inactiveText`,
 * `logRow.*`); size from `size.icon.*`. Never a glyph name typed at a call site.
 */
export const glyph = {
  /** The icon font. `import Ionicons from '@expo/vector-icons/Ionicons'`. */
  family: 'Ionicons',
  /**
   * The bottom tab bar, keyed like the `tabBar.<tab>ActiveText` colours. At rest a tab shows its
   * `inactive` outline in `tabBar.inactiveText`; the selected tab swaps to the filled `active` cut in
   * its own accent. The swap is instant — it is a colour-and-shape change, so reduce motion leaves it
   * as is. Size: `size.icon.tab`.
   */
  tab: {
    /** Today: a calendar page with today marked — the day's log. */
    today: { active: 'today', inactive: 'today-outline' },
    /** Workout: a barbell. */
    workout: { active: 'barbell', inactive: 'barbell-outline' },
    /** Charts: rising bars — history at a glance. */
    charts: { active: 'stats-chart', inactive: 'stats-chart-outline' },
    /** Settings: the gear everyone already recognises. */
    settings: { active: 'settings', inactive: 'settings-outline' },
  },
  /**
   * The swipe-to-delete button on a Today's-log row: the filled trash can, alone, centred in the
   * square `state.danger` button (`size.deleteButton`), drawn in `text.onDanger`. Size:
   * `size.icon.deleteAction`. Icon-only, so the
   * row keeps its "Delete <food>" accessibility label and action.
   */
  delete: 'trash',
} as const;

/* ================================================================== motion */

export type Bezier = readonly [number, number, number, number];

/** What an animation becomes under reduce motion. `instant`: jump to the end state. `fade`: opacity only. `same`: unchanged (colour changes and sub-150 ms cross-fades trigger nothing vestibular). */
export type ReducedKind = 'instant' | 'fade' | 'same';

export type MotionEvent = {
  readonly duration: number;
  readonly easing: keyof typeof easing | 'spring';
  readonly reduced: { readonly kind: ReducedKind; readonly duration: number };
  readonly staggerMs?: number;
};

const easing = {
  /** Arcs, sheets, anything that settles into place. */
  standard: [0.2, 0, 0, 1],
  /** Presses, fades, anything responding to a finger. */
  out: [0, 0, 0.58, 1],
  /** Things that change shape in place: a set row collapsing, a range morph. */
  inOut: [0.42, 0, 0.58, 1],
  /** Continuous clocks only. */
  linear: [0, 0, 1, 1],
} as const satisfies Record<string, Bezier>;

export const motion = {
  /** Nothing animates longer than this, except `chartDraw`, which runs once per screen entry. */
  ceilingMs: 260,
  /** Cubic-bezier control points for Reanimated's `Easing.bezier(...)`. */
  easing,
  /** Spring configs for Reanimated's `withSpring`. */
  spring: {
    /** Bottom sheets rising (portion, search). */
    sheet: { dampingRatio: 0.82, duration: 200 },
  },
  events: {
    /** Quick-add tile finger-down: scale 1 → 0.972. The only thing that moves. */
    tilePressIn: { duration: 90, easing: 'out', reduced: { kind: 'instant', duration: 0 } },
    /** Tile finger-up: back to 1. */
    tilePressOut: { duration: 130, easing: 'out', reduced: { kind: 'instant', duration: 0 } },
    /** A ring sweeping to its new length after a log. Retargets if interrupted, never queues. */
    arcSweep: { duration: 260, easing: 'standard', reduced: { kind: 'instant', duration: 0 } },
    /** The amber wash arriving across a logged tile (then holds `interaction.tileLoggedHoldMs`). */
    loggedWashIn: { duration: 120, easing: 'out', reduced: { kind: 'instant', duration: 0 } },
    /** The wash leaving. */
    loggedWashOut: { duration: 200, easing: 'out', reduced: { kind: 'instant', duration: 0 } },
    /** The ×2 badge popping in on a second tap inside the repeat window. */
    repeatBadge: { duration: 160, easing: 'standard', reduced: { kind: 'fade', duration: 120 } },
    /** Undo toast rising 16 pt and fading in above the tab bar. */
    toastIn: { duration: 180, easing: 'out', reduced: { kind: 'fade', duration: 180 } },
    /** Undo toast leaving. */
    toastOut: { duration: 140, easing: 'out', reduced: { kind: 'fade', duration: 140 } },
    /** Portion or search sheet rising from the bottom edge, screen dimming behind. */
    sheetIn: { duration: 200, easing: 'spring', reduced: { kind: 'fade', duration: 120 } },
    /** Sheet leaving (including after a row logs). */
    sheetOut: { duration: 160, easing: 'standard', reduced: { kind: 'fade', duration: 120 } },
    /** The search bar lifting into the field docked above the keyboard. */
    searchLift: { duration: 220, easing: 'standard', reduced: { kind: 'fade', duration: 120 } },
    /** Presets ↔ Exact: the preset steps and the slider cross-fade in place; sheet height animates. */
    portionModeSwap: { duration: 160, easing: 'standard', reduced: { kind: 'instant', duration: 0 } },
    /** Food form: picking Custom… opens the label / basis / amount fields in place of the locked
     * read-out (height + fade); picking a preset closes them. Interruptible: a second chip tap
     * mid-animation reverses it from where it is. */
    customReveal: { duration: 200, easing: 'standard', reduced: { kind: 'instant', duration: 0 } },
    /** The slider thumb settling onto a detent it was released near. */
    sliderSnap: { duration: 120, easing: 'out', reduced: { kind: 'instant', duration: 0 } },
    /** A row or chip background changing to its pressed colour. */
    rowPress: { duration: 90, easing: 'out', reduced: { kind: 'same', duration: 90 } },
    /**
     * Form frame (issue #207): the pinned footer's divider hairline fading in while body content
     * runs underneath the footer, and out again when the body is scrolled to its end. Opacity only,
     * on a 1 pt line — nothing vestibular — so reduce motion keeps it (`same`). The footer's own
     * travel when the keyboard opens is NOT here on purpose: it rides the keyboard's own curve, and
     * a Vitals duration laid over it would only desync the two.
     */
    footerDividerFade: { duration: 120, easing: 'out', reduced: { kind: 'same', duration: 120 } },
    /** The active set collapsing 102 → 44 pt as the next set expands. */
    setCollapse: { duration: 220, easing: 'inOut', reduced: { kind: 'instant', duration: 0 } },
    /** The rest ring's last-three-seconds pulse. */
    restPulse: { duration: 240, easing: 'inOut', reduced: { kind: 'instant', duration: 0 } },
    /** Screens cross-fading on a tab change. */
    tabFade: { duration: 140, easing: 'out', reduced: { kind: 'same', duration: 140 } },
    /** Trend and average lines stroking on, points fading in behind. Once per screen entry. */
    chartDraw: { duration: 420, easing: 'out', reduced: { kind: 'instant', duration: 0 }, staggerMs: 12 },
    /** Axis rescale and path morph on a range switch. */
    rangeMorph: { duration: 260, easing: 'inOut', reduced: { kind: 'instant', duration: 0 } },
  },
  continuous: {
    /** The rest ring depletes every second. Information, not decoration — it survives reduce motion. */
    restRing: { tickMs: 1000, easing: 'linear', reduced: 'same' },
    /** The 2 pt sync hairline under the header. Under reduce motion: a static "Syncing…" label. */
    syncHairline: { easing: 'linear', reduced: 'staticLabel' },
  },
} as const satisfies {
  ceilingMs: number;
  easing: Record<string, Bezier>;
  spring: Record<string, { dampingRatio: number; duration: number }>;
  events: Record<string, MotionEvent>;
  continuous: Record<string, unknown>;
};

export type MotionEventName = keyof typeof motion.events;

/* ============================================================= interaction */

/**
 * The serving presets, by stable key (issue #88), in chip order. The conversion table itself — label,
 * basis, amount (1 cup = 250 ml) — is data and lives once in `src/db/servings.ts` (`SERVING_PRESETS`,
 * client ruling 5). These keys exist so that UI rules such as `interaction.servingSteps` never key off
 * a display label. Same values as the `serving_preset` key proposed in issue #93.
 */
export const servingPresetKeys = ['100g', '100ml', 'cup', 'tbsp', 'tsp'] as const;
export type ServingPresetKey = (typeof servingPresetKeys)[number];
/** A preset, or a food's own Custom serving. */
export type ServingStepKey = ServingPresetKey | 'custom';
/** How the portion sheet's servings strip steps for one kind of serving. */
export type ServingStep = {
  /** The gap between two steps, in servings. Only ¼ and ½ exist, so every label is ¼ ½ ¾ 1 1¼ … */
  readonly increment: 0.25 | 0.5;
  /** The last step, in servings. Also the Exact slider's initial range (issue #92). */
  readonly max: number;
};

/**
 * Issue #93: each preset's step and max, from how the unit is actually measured. The strip is the
 * fast path, not the only one — Exact and a Custom serving cover everything else — so each rule
 * covers the common portions and stops, keeping every strip to 16 steps or fewer.
 */
const servingSteps = {
  /** Weighed food in 50 g hops to 500 g: 50 g of oats, 150 g of rice, 250 g of chicken. Finer is Exact. */
  '100g': { increment: 0.5, max: 5 },
  /** Drinks in 50 ml hops to 500 ml: a splash of milk, a 200 ml glass, a 500 ml bottle. */
  '100ml': { increment: 0.5, max: 5 },
  /** Recipes measure cups in quarters (¼ cup of oats, ¾ cup of milk). Four cups is a litre. */
  cup: { increment: 0.25, max: 4 },
  /** ¼ to 4 tbsp: a drizzle of oil to ¼ cup; past that, the cup is the natural unit. */
  tbsp: { increment: 0.25, max: 4 },
  /** ¼ to 3 tsp: a pinch of spice to one tablespoon; past that, the tablespoon is. */
  tsp: { increment: 0.25, max: 3 },
  /** Client ruling (2026-09-15): a Custom serving keeps ½ steps up to 8. */
  custom: { increment: 0.5, max: 8 },
} as const satisfies { readonly [K in ServingStepKey]: ServingStep };

/** Timings and quantities that shape a gesture. Not animation — reduce motion never changes these. */
export const interaction = {
  /** Hold this long on a tile or search row to open the portion sheet. */
  longPressMs: 220,
  /** A second tap on the same tile or row within this window adds a portion to the SAME log entry (×2). */
  repeatWindowMs: 5000,
  /** How long a tile stays in its Logged state. */
  tileLoggedHoldMs: 900,
  /** How long a search row shows its Logged beat before the sheet closes. */
  rowLoggedHoldMs: 240,
  /**
   * How long the undo toast stays up: it dismisses itself this long after `show()`, wall-clock from
   * the log (client ruling, 2026-09-20 — the answer to the open question behind decisions ruling 2).
   * This is the ordinary dismissal, and the single knob for it — a new log while the toast is up
   * restarts this clock. Retune the number here; never write the milliseconds into the store.
   *
   * Ten seconds is long enough to read "Logged 250 g oats" and reach the button one-handed, short
   * enough that the toast is gone before it is in the way of the next thing you log.
   *
   * Wall-clock is the current default, not a promise: the clock keeps running while the phone is
   * locked or the app is backgrounded, so a toast that `undoSurvives` may be past its ten seconds on
   * return and dismiss at once. If the client would rather the clock paused, it pauses here.
   *
   * There used to be a second, longer `undoCeilingMs` outer bound alongside this one — retired in
   * issue #201. `undoToast.ts` (issue #83) ended up running exactly one wall-clock timer, this one,
   * so the ceiling could never fire: the shorter timer always dismisses first, and the store has no
   * pause that could push past it (confirmed by grep after #199 merged — `undoCeilingMs` and
   * `ceilingTimer` appeared nowhere outside this file). It comes back if this token ever gains the
   * pause-while-backgrounded mode above: a paused toast has no wall-clock end, so an un-pausable
   * outer bound regains a real job capping it. Whoever builds that pause should expect to
   * reintroduce a ceiling token here.
   */
  undoAutoDismissMs: 10_000,
  /** What ends the undo toast early. */
  undoDismissedBy: ['anotherLog', 'sheetOpened', 'tabChanged', 'swipedAway'],
  /** What deliberately does NOT end it. */
  undoSurvives: ['scroll', 'screenLock', 'appBackgrounded'],
  /** Stepper − / + auto-repeat starts after this hold. */
  stepperRepeatDelayMs: 400,
  /** Exact-mode slider resolution, grams. Food is stored in grams. */
  sliderStepG: 1,
  /**
   * The −/+ nudge either side of the slider, grams. One gram per press: the nudges exist to land
   * an exact number after a drag has got you close, so they step at the slider's own resolution
   * (`sliderStepG`) rather than in coarse hops. Holding auto-repeats after `stepperRepeatDelayMs`,
   * which is what covers a large correction.
   */
  sliderNudgeG: 1,
  /** Releasing within this many grams of a preset snaps onto it (selection haptic on arrival). */
  sliderDetentSnapG: 3,
  /**
   * The slider's *initial* range: 0 to this many of the food's default servings. It is an opening
   * width, not a ceiling — push the value past the right-hand end with the −/+ nudges and the range
   * grows by another whole multiple of this width (issue #92). It never shrinks back while the
   * sheet is open, so the thumb never jumps out from under a finger mid-edit. There is no hard max.
   */
  sliderMaxServings: 4,
  /** Search's Recent list: foods and meals logged within this many days that are not in the six. */
  recentDays: 14,
  /**
   * The portion sheet's servings strip, per serving kind (issue #93, table decided in #88). A food's
   * key is its preset, or `custom`. `max` also opens the Exact slider's range, and replaces
   * `sliderMaxServings` for that job once #92/#93 land.
   */
  servingSteps,
} as const;

/* ================================================================= haptics */

export type Haptic = { readonly ios: string; readonly android: string };

/** Haptics are feedback, not animation: they survive reduce motion. */
export const haptics = {
  /** A food logged — from a tile, a search row, a portion step, or Log in Exact mode. Replaces a save button. */
  foodLogged: { ios: 'impactMedium', android: 'EFFECT_HEAVY_CLICK' },
  /** A set logged. Lighter: it happens 20+ times a session. */
  setLogged: { ios: 'impactLight', android: 'EFFECT_TICK' },
  /** Undo tapped. */
  undo: { ios: 'impactLight', android: 'EFFECT_CLICK' },
  /** The slider thumb arriving on a preset detent. */
  sliderDetent: { ios: 'selection', android: 'EFFECT_TICK' },
  /** Rest period finished. Fires with the screen off. */
  restFinished: { ios: 'notificationSuccess', android: 'EFFECT_DOUBLE_CLICK' },
  /** A ring reaching its target — once per ring per day. */
  ringCompleted: { ios: 'notificationSuccess', android: 'EFFECT_DOUBLE_CLICK' },
  /** Picking a serving chip in the food form: a selection change, like a picker detent. */
  servingPicked: { ios: 'selection', android: 'EFFECT_TICK' },
  /** Confirming something destructive. */
  destructiveConfirm: { ios: 'notificationWarning', android: 'EFFECT_HEAVY_CLICK' },
} as const satisfies Record<string, Haptic>;
