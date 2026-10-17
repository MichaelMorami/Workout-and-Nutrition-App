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
 *   - A colour that is never read but still carries meaning — a ring stroke, a `*Muted` data colour —
 *     is measured in `graphicPairs` at `MIN_GRAPHIC_CONTRAST` instead. "Never text" is not a licence
 *     to be invisible: see issue #287.
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
    /**
     * The unfilled track of a progress ring, and nothing else (issue #287).
     *
     * It is NOT `hairline`, which it used to be: a 1 pt divider must stay quiet, while a 10 pt
     * track is the only thing on the ring that says how much of the target is left — the lap says
     * how much is done. At `hairline` (1.43:1 dark, 1.35:1 light) the ring read as a short bright
     * stub floating on the card instead of as a proportion. Held to `MIN_GRAPHIC_CONTRAST`, not to
     * the text bar: see `dimPairs` for the ceiling that stops it reading as filled.
     */
    ring: '#64666D',
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
    /**
     * Daily calorie points behind the average, and the base lap of an over-target calorie ring.
     * Never text — held to `MIN_GRAPHIC_CONTRAST` (3.27:1 on `card.bg`, already clear of the bar;
     * the light theme's twin is what issue #287 had to lift).
     */
    kcalMuted: '#8F6127',
    /** Protein, everywhere. Never used for anything that is not protein. */
    protein: '#57E0C6',
    /**
     * Daily protein points behind the average, and the base lap of an over-target protein ring.
     * Never text — held to `MIN_GRAPHIC_CONTRAST` (3.32:1 on `card.bg`).
     */
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
    /**
     * A ceiling exceeded: calories past `kcalTarget` (issue #272). Hot orange — hotter than
     * `data.kcal`'s amber so the overage cannot be mistaken for more calories, and a clear 20° of
     * hue away from `state.danger`'s red. It is NOT danger: nothing failed and nothing is about to
     * be destroyed, so it never appears on a button and never on a destructive action.
     */
    caution: '#FA7A32',
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
    /** 3.11:1 on `card.bg`. Darker than the divider, where dark is what "visible" means on white. */
    ring: '#919296',
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
    /** 3.10:1 on `card.bg` (was #D79553, 2.53:1 — invisible on a white card). Issue #287. */
    kcalMuted: '#C1864B',
    protein: '#037567',
    /** 3.07:1 on `card.bg` (was #63B4A3, 2.45:1). Issue #287. */
    proteinMuted: '#58A090',
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
    caution: '#A02F04',
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
      /**
       * The unfilled track of a calorie or protein ring — how much of the target is LEFT, which is
       * half of what the ring is for. Its own colour since #287, because a 1 pt divider's grey
       * cannot do this job: see `line.ring`.
       */
      track: c.line.ring,
      /** The calorie progress stroke, up to the target. */
      kcal: c.data.kcal,
      /** The protein progress stroke, up to the target. */
      protein: c.data.protein,
      /** Over target: the first, completed lap drops to muted so the ring never reads as simply "full". */
      kcalOverBase: c.data.kcalMuted,
      /** Over target: the protein ring's completed first lap. */
      proteinOverBase: c.data.proteinMuted,
      /**
       * The second, overage lap on the calorie ring — the amount past `kcalTarget`. Calories are a
       * CEILING, so the overage is the thing to notice and it takes the caution hue (issue #272).
       */
      kcalOverage: c.state.caution,
      /**
       * The second, overage lap on the protein ring. Protein is a FLOOR, so passing it is success:
       * the overage keeps protein's own colour and is never tinted toward caution or danger.
       */
      proteinOverage: c.data.protein,
      /** Over target: the gap stroke cut around the second lap, so the overlap is visible in shape, not hue. */
      overKnockout: c.bg.surface,
      /** The target tick at 12 o'clock, drawn across the ring from the moment the target is reached. */
      targetTickIcon: c.text.primary,
      /** The big number inside a ring. */
      valueText: c.text.primary,
      /** The eyebrow inside a ring ("KCAL"). */
      labelText: c.text.tertiary,
      /** "of 2,400" under the number. */
      captionText: c.text.secondary,
      /** "1,160 left" under the calorie ring — the under-target caption, on either metric's own colour. */
      kcalText: c.data.kcal,
      /** "84 g left" under the protein ring. */
      proteinText: c.data.protein,
      /**
       * "Target hit", on either ring. The caption's colour is what separates a met ring from a ring
       * at 99 % of target, whose round end caps already close the gap (issue #272).
       */
      metText: c.state.success,
      /** "180 over" — a ceiling blown. The same caution hue as the overage lap it describes. */
      exceededText: c.state.caution,
      /** "12 g past" — a floor beaten. Success, because that is what it is. */
      surplusText: c.state.success,
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

/* ============================================================== arc states */

/**
 * WHAT A TARGET MEANS, PER METRIC (issue #272).
 *
 * The schema has exactly two targets — `kcalTarget` and `proteinTarget` — and no column saying
 * which way either one points, so the direction is a design decision hard-coded here. There is no
 * maximum-limit nutrient in the data model, so no third direction is defined for one.
 *
 *   - `ceiling` — the target is a budget. Going over is the thing to notice.
 *   - `floor`   — the target is a minimum. Going over is the point.
 *
 * Going over the SAME distance means opposite things on the two rings, which is the bug this
 * answers: beating a protein goal used to look exactly like blowing a calorie budget.
 */
export const arcTargetKind = { kcal: 'ceiling', protein: 'floor' } as const;

/** The two things Today rings. Mirrors `ArcMetric` in `src/components/charts/arc-math.ts`. */
export type ArcMetricName = keyof typeof arcTargetKind;

/** Which way a metric's target points. */
export type ArcTargetKind = (typeof arcTargetKind)[ArcMetricName];

/**
 * The four states a ring **with a target** can be in, below → at → over.
 *
 * `noTarget` is deliberately not one of them: it is not a position against a target, so it has no
 * `appliesTo` and no `position`, and keeping it out is what makes "exactly one state answers each
 * (position, target kind)" true. For every state a ring can be in, including that one, use
 * `arcRingStateNames` — which is what a renderer wants (issue #289).
 */
export const arcStateNames = ['under', 'met', 'exceeded', 'surplus'] as const;
export type ArcStateName = (typeof arcStateNames)[number];

/**
 * Every state a ring can be in: the four target states, plus `noTarget` for a day with no target
 * configured (issue #289).
 *
 * `noTarget` leads the list because it is the first state the app ever draws — a fresh install has
 * no targets, so it is the day-one picture, not an edge case.
 */
export const arcRingStateNames = ['noTarget', ...arcStateNames] as const;
export type ArcRingStateName = (typeof arcRingStateNames)[number];

/**
 * How one state is drawn. The colour fields are ROLES, not values — `arcStateColors` resolves them
 * against a theme and a metric, so the ring never has to know which token a state wants.
 */
export type ArcStateSpec = {
  /** The target direction this state can occur on. `'both'` for the two states below/at target. */
  readonly appliesTo: ArcTargetKind | 'both';
  /** Where the value sits against the target. */
  readonly position: 'below' | 'at' | 'above';
  /** First lap: `'metric'` → `arc[metric]`, `'metricOverBase'` → `arc[metric + 'OverBase']`. */
  readonly firstLap: 'metric' | 'metricOverBase';
  /** Second lap: `'metricOverage'` → `arc[metric + 'Overage']`, or `null` when there is no overage. */
  readonly overage: 'metricOverage' | null;
  /** Caption: `'metricText'` → `arc[metric + 'Text']`, otherwise that literal key of `arc`. */
  readonly captionColor: 'metricText' | 'metText' | 'exceededText' | 'surplusText';
  /**
   * Draw the 12 o'clock target tick? This is the SHAPE half of separating a met ring from a ring at
   * 99 % of target: at that distance the progress stroke's round end caps already overlap, so the
   * two are the same picture until one of them carries a mark the other does not.
   */
  readonly tick: boolean;
  /** Cut the knockout gap either side of the overage lap, so two laps read as two in shape alone. */
  readonly knockout: boolean;
  /**
   * The caption under the ring. `{amount}` is the difference from target, already formatted with
   * its unit by the caller ("180", "12 g"). This is the design's wording: "over" for a ceiling
   * blown, "past" for a floor beaten — the half of the state that survives greyscale, a screenshot
   * and a colourblind reader.
   */
  readonly caption: string;
};

/** The four states. The ring reads this, not a branch of its own. */
export const arcState: { readonly [S in ArcStateName]: ArcStateSpec } = {
  /** Below target, either direction: the metric's own colour, climbing. Nothing to flag. */
  under: {
    appliesTo: 'both',
    position: 'below',
    firstLap: 'metric',
    overage: null,
    captionColor: 'metricText',
    tick: false,
    knockout: false,
    caption: '{amount} left',
  },
  /** Exactly on target, either direction. A closed bright ring, the tick on the line, and success. */
  met: {
    appliesTo: 'both',
    position: 'at',
    firstLap: 'metric',
    overage: null,
    captionColor: 'metText',
    tick: true,
    knockout: false,
    caption: 'Target hit',
  },
  /** Over a CEILING — calories past target. The completed lap mutes; the overage takes caution. */
  exceeded: {
    appliesTo: 'ceiling',
    position: 'above',
    firstLap: 'metricOverBase',
    overage: 'metricOverage',
    captionColor: 'exceededText',
    tick: true,
    knockout: true,
    caption: '{amount} over',
  },
  /** Over a FLOOR — protein past target. Same shape, the metric's own colour, and success wording. */
  surplus: {
    appliesTo: 'floor',
    position: 'above',
    firstLap: 'metricOverBase',
    overage: 'metricOverage',
    captionColor: 'surplusText',
    tick: true,
    knockout: true,
    caption: '{amount} past',
  },
};

/**
 * How a ring in ANY state is drawn, including the one that is not a position against a target.
 * A widening of `ArcStateSpec`: `null` wherever "against the target" has no meaning.
 */
export type ArcRingStateSpec = {
  /** As `ArcStateSpec`, or `null` when there is no target to apply to. */
  readonly appliesTo: ArcTargetKind | 'both' | null;
  /** As `ArcStateSpec`, or `null` when there is no target to sit below, at or above. */
  readonly position: ArcStateSpec['position'] | null;
  /** As `ArcStateSpec`, or `null` when the state draws no lap of its own — the bare `arc.track`. */
  readonly firstLap: ArcStateSpec['firstLap'] | null;
  /** As `ArcStateSpec`. */
  readonly overage: ArcStateSpec['overage'];
  /** As `ArcStateSpec`. */
  readonly captionColor: ArcStateSpec['captionColor'];
  /** As `ArcStateSpec`. */
  readonly tick: boolean;
  /** As `ArcStateSpec`. */
  readonly knockout: boolean;
  /** As `ArcStateSpec`. */
  readonly caption: string;
};

/**
 * EVERY state a ring can be in — **this is the table a renderer reads** (issue #289).
 *
 * It is `arcState` plus `noTarget`, spread from the same objects rather than retyped, so the four
 * target states cannot say one thing here and another there.
 *
 * `arcState` stays the four for the invariants that are about targets; reach for this one whenever
 * the state came out of `arcStateFor`, because that function can answer `noTarget` and a lookup in
 * the four-state table would hand back `undefined` — a crash dressed as a missing colour.
 */
export const arcRingState: { readonly [S in ArcRingStateName]: ArcRingStateSpec } = {
  /**
   * No target configured: `target` is zero, negative or not a number. Day one of a fresh install,
   * and the state the app draws before Settings is ever opened.
   *
   * It draws what it has always drawn and nothing more: the bare `arc.track`, no lap, no overage,
   * no tick, no cut, and "No target set" in the metric's own colour. #272 promised not to touch the
   * no-target ring and this keeps that promise — what #289 changes is that the state now has a NAME
   * in the one table that names states, instead of being a fifth status computed somewhere else.
   *
   * `firstLap: null` is load-bearing. A colour here would paint a full lap of track grey, which
   * reads as a completed ring — "complete when it isn't", the exact failure #272 exists to kill,
   * arrived at from the opposite end.
   */
  noTarget: {
    appliesTo: null,
    position: null,
    firstLap: null,
    overage: null,
    captionColor: 'metricText',
    tick: false,
    knockout: false,
    caption: 'No target set',
  },
  ...arcState,
};

/** The state a metric over its target is in: a ceiling is `exceeded`, a floor is `surplus`. */
export function arcOverState(metric: ArcMetricName): ArcStateName {
  return arcTargetKind[metric] === 'ceiling' ? 'exceeded' : 'surplus';
}

/**
 * A number that is a real amount: finite and above zero, or else zero. Mirrors `arc-math.ts`'s
 * `amount(finiteOrZero(n))` exactly, so the two cannot disagree about a negative or a `NaN`.
 */
const arcAmount = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

/**
 * The state one ring is in — the single place the at-target boundary is computed, and the only
 * sanctioned way to turn a (metric, value, target) triple into a state.
 *
 * **SAFE TO CALL FROM A RENDER PATH.** It is total: every `number` pair resolves to a member of
 * `arcRingStateNames`, and it never throws for a caller's input. Call it, look the answer up in
 * `arcRingState`, draw that. No `try`/`catch`, and — the important half — no pre-check of the
 * target at the call site, because a pre-check is a second copy of this boundary and copies of this
 * boundary are what #272 and #289 were opened to remove.
 *
 * NO TARGET (issue #289). `target` zero, negative or not finite is `'noTarget'`: there is nothing
 * to be a proportion of, so the ring is the bare track and the caption says "No target set". It is
 * NOT `met`. That was the bug — a fresh install, nothing logged, no target, and the ring said
 * "Target hit", announcing the completion of something the person never set out to do. A `throw`
 * was considered and rejected: the day-one screen is exactly this input, so throwing would make the
 * first render of the app the one that needs guarding.
 *
 * ZERO-ISH VALUES. A value that is negative or not finite counts as zero, which is `arc-math.ts`'s
 * rule: a degenerate ring is recoverable, `NaN` in an SVG is not.
 *
 * WITH a target it resolves through `position`, not through a second opinion about the comparison:
 * a value is `'below'`, `'at'` or `'above'`, and exactly one of the four target states claims that
 * position for the metric's target direction. So `position` is load-bearing data rather than
 * documentation — move it one step and this function returns the wrong state, which
 * `tokens.test.tsx` fails on.
 *
 * THE BOUNDARY, spelled out because three copies of it once existed: `value === target` is `met`,
 * never `under` and never over. One `>=` for a `>` is a day that hit its calorie budget exactly
 * being told it blew it.
 */
export function arcStateFor(metric: ArcMetricName, value: number, target: number): ArcRingStateName {
  const t = arcAmount(target);
  if (t === 0) return 'noTarget';
  const v = arcAmount(value);
  const position: ArcStateSpec['position'] = v > t ? 'above' : v === t ? 'at' : 'below';
  const kind = arcTargetKind[metric];
  const state = arcStateNames.find(
    (s) =>
      arcState[s].position === position && (arcState[s].appliesTo === 'both' || arcState[s].appliesTo === kind),
  );
  // Unreachable from any INPUT: with a real target, `position` is one of three values and the four
  // states cover all three for both target directions — which `tokens.test.tsx` asserts rather than
  // assumes. It is reachable only from a mistake in this file (a moved `position`, a dropped
  // state), and it throws rather than falling back to a guess because a silent default would mask
  // precisely that mistake. It stays unpinned by a test on purpose: the only way to give it a
  // reachable case would be to make `target <= 0` throw, which is the render-path crash the
  // `noTarget` guard above exists to avoid (issue #289).
  if (state === undefined) throw new Error(`arcStateFor: no state for a value ${position} a ${kind} target`);
  return state;
}

/** The colours one ring actually draws, roles already resolved. */
export type ArcStateColors = {
  /**
   * The first lap — the target's own worth of ring. `null` in `noTarget`: there is no lap, so the
   * ring is `arc.track` alone and nothing is drawn over it (issue #289).
   */
  readonly firstLap: string | null;
  /** The overage lap, or `null` when the value has not passed target. */
  readonly overage: string | null;
  /** The caption under the ring. */
  readonly caption: string;
};

/** The four arc tokens that depend on which metric is being drawn. */
function arcMetricColors(arc: ColorTokens['arc'], metric: ArcMetricName) {
  return metric === 'kcal'
    ? { lap: arc.kcal, overBase: arc.kcalOverBase, overage: arc.kcalOverage, caption: arc.kcalText }
    : { lap: arc.protein, overBase: arc.proteinOverBase, overage: arc.proteinOverage, caption: arc.proteinText };
}

/**
 * Resolve a state's colour roles for one metric in one theme. The single place the mapping lives,
 * so a ring, a chart legend and the design canvas cannot each resolve it differently:
 *
 *   const { firstLap, overage, caption } = arcStateColors(color, 'kcal', arcOverState('kcal'));
 *
 * It takes any `ArcRingStateName`, so the answer `arcStateFor` gives can be passed straight in
 * (issue #289). Draw the base ring in `color.arc.track` and `firstLap` over it when it is not
 * `null`; `null` is the no-target ring, which is the track and nothing else.
 */
export function arcStateColors(
  color: ColorTokens,
  metric: ArcMetricName,
  state: ArcRingStateName,
): ArcStateColors {
  const m = arcMetricColors(color.arc, metric);
  const spec = arcRingState[state];
  const caption =
    spec.captionColor === 'metricText' ? m.caption
    : spec.captionColor === 'metText' ? color.arc.metText
    : spec.captionColor === 'exceededText' ? color.arc.exceededText
    : color.arc.surplusText;
  return {
    firstLap:
      spec.firstLap === null ? null
      : spec.firstLap === 'metric' ? m.lap
      : m.overBase,
    overage: spec.overage === null ? null : m.overage,
    caption,
  };
}

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
  ...measure(['state.success', 'state.caution', 'state.danger'], ['bg.canvas'], ['bg.surface'], ['bg.raised']),
  ...measure(['text.onKcal'], ['data.kcal'], ['fill.kcalPress']),
  ...measure(['text.onStrength'], ['data.strength'], ['fill.strengthPress']),
  ...measure(['text.onBody'], ['data.body'], ['fill.bodyPress']),
  ...measure(['text.onDanger'], ['state.danger'], ['fill.dangerPress']),
  ...measure(['text.primary', 'data.kcal'], ['bg.tileLogged']),

  // Today
  ...measure(['sectionLabel.labelText', 'sectionLabel.metaText'], ['bg.canvas'], ['card.bg']),
  ...measure(['arc.targetTickIcon', 'arc.valueText', 'arc.labelText', 'arc.captionText', 'arc.kcalText', 'arc.proteinText'], ['card.bg']),
  // The over-target state's own colours (issue #272). The two overage laps are strokes rather than
  // text, and they are held to the text bar anyway: a 10 pt lap is the only thing on the ring that
  // says how far past target the day went, so it has to be legible, not merely visible.
  ...measure(['arc.metText', 'arc.exceededText', 'arc.surplusText', 'arc.kcalOverage', 'arc.proteinOverage'], ['card.bg']),
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

/**
 * WCAG 1.4.11 for things that are NEVER text but still carry meaning — the ring's strokes
 * (issue #287). A 10 pt arc that states a proportion has to be seen; it does not have to be read.
 *
 * It is a lower bar than `MIN_TEXT_CONTRAST` on purpose, and the lower bar is the better design:
 * a track dragged up to 4.5:1 stops reading as empty and the ring reads as full, which is the
 * failure #272 spent four states killing. `dimPairs` holds the other end so this one cannot be
 * "fixed" by brightening until the distinction is gone.
 */
export const MIN_GRAPHIC_CONTRAST = 3;

/**
 * The never-text strokes, each on the ground it is drawn on. The reason this list exists separately
 * from `contrastPairs`: "not text" had been taken to mean "not measured", and that is how the ring
 * track reached 1.43:1 in dark and 1.35:1 in light without a single test objecting.
 */
export const graphicPairs: readonly ContrastPair[] = [
  // The empty track — the proportion of the target still to go, on the card it is drawn on.
  ...measure(['arc.track'], ['card.bg']),
  // The completed first lap of an over-target ring, which replaces the bright lap rather than
  // sitting next to it: the `arc.overKnockout` cut means each lap's only neighbour is the card.
  ...measure(['arc.kcalOverBase', 'arc.proteinOverBase'], ['card.bg']),
];

/**
 * The floor on how far apart a dim stroke and the full-brightness stroke it stands in for must stay.
 *
 * Lower than 3:1 by necessity, not by choice: in the light theme the bright lap is itself a mid-tone
 * (`data.kcal` is 5.56:1 on white), and no colour can sit 3:1 from both white and a 5.56:1 colour —
 * the arithmetic forbids it. So in light the distinction is carried by chroma (a saturated amber lap
 * against a neutral grey track) with 1.79:1 of luminance behind it, and in dark by luminance outright
 * (the track is 3.06:1 from the card and the lap is 9.17:1 — a threefold step).
 *
 * What this constant is for is the ceiling it implies: it goes red if a later pass lifts a dim stroke
 * toward the text bar until "unfilled" and "filled" stop being different pictures.
 */
export const MIN_DIM_SEPARATION = 1.7;

/** `[dim, bright]`: a stroke and the full-brightness stroke whose place it takes. */
export const dimPairs: readonly (readonly [dim: ColorPath, bright: ColorPath])[] = [
  // Under target: the track is what the lap has not reached yet.
  ['arc.track', 'arc.kcal'],
  ['arc.track', 'arc.protein'],
  // Over target: the first lap drops to muted, so "done" cannot look like "doing".
  ['arc.kcalOverBase', 'arc.kcal'],
  ['arc.proteinOverBase', 'arc.protein'],
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

/** A `withSpring` config: critical-damping ratio plus the time it is allowed to take to settle. */
export type SpringConfig = {
  readonly dampingRatio: number;
  readonly duration: number;
};

/**
 * What reduce motion does to a **finger-tracked** gesture. Two answers, not one, because a tracked
 * gesture has two phases and they are not the same kind of motion:
 *
 * - `tracked` — the part that happens while the finger is down. This is direct manipulation: the
 *   content is under the finger and the user is causing every pixel of it. Suppressing it does not
 *   calm anything, it removes the gesture, so this is `same` for every tracked gesture we ship.
 * - `release` — the part that keeps moving after the finger lifts. Unattended travel across the
 *   whole screen is the vestibular one, and it is the one reduce motion replaces.
 *
 * `MotionEvent.reduced` cannot express this: it has a single answer, which is correct for a
 * fire-and-forget animation and wrong here.
 */
export type TrackedReduced = {
  readonly tracked: ReducedKind;
  readonly release: { readonly kind: ReducedKind; readonly duration: number };
};

/**
 * When a tracked gesture is allowed to take the touch, and from whom. Issue #249: a pager that
 * does not name this either steals a gesture that belonged to something inside it, or never
 * starts because something inside it got there first. Both are decided here rather than in the
 * screen, so every tracked gesture we ever add arbitrates the same way.
 */
export type TrackedActivation = {
  /** Finger travel, in points, before the gesture takes the touch over. */
  readonly distancePt: number;
  /** How many times more horizontal than vertical the drag must be: `|dx| > ratio × |dy|`. */
  readonly axisRatio: number;
  /**
   * The travel at which a gesture *inside* this one is allowed to have already claimed the touch.
   * `distancePt` must stay strictly above it, which is what makes the inner gesture win.
   */
  readonly innerClaimPt: number;
  /** Whether the gesture exists only on a navigator's root screen, leaving pushed screens alone. */
  readonly onlyAtNavigationRoot: boolean;
};

/**
 * What happens to the finger's speed at the instant it lifts (issue #249). A release is one of two
 * visibly different things and nothing else in the token set says which: either the spring inherits
 * the finger's velocity and the flick continues through the lift, or it starts from rest and the
 * content halts for a frame before setting off again.
 */
export type ReleaseVelocityHandoff = {
  /** Points of spring velocity per point/second of finger velocity. 1 is a full hand-off. */
  readonly carry: number;
  /**
   * The ceiling on the carried speed, in multiples of the spring's own average speed for the
   * distance that is left. 1 means the spring is never handed more speed than it was going to
   * generate itself.
   *
   * That average speed is `remainingPt ÷ (releaseSpring.duration ÷ 1000)`, **in points per
   * second** — `duration` is milliseconds, and every velocity in this file is pt/s (see `carry`
   * above and `commitVelocityPtPerS`). Dividing by the raw millisecond figure gives pt/ms, which
   * is 1000× too small: at 100 pt remaining the cap would be 0.45 pt/s instead of 455 pt/s, which
   * clamps every hand-off to nothing and silently turns `carry: 1` into `carry: 0`.
   */
  readonly capSpringSpeeds: number;
  /** What to do with a release whose velocity points away from the committed destination. */
  readonly awayFromDestination: 'drop' | 'carry';
};

/**
 * The full specification of one finger-tracked gesture — everything a pager needs that a
 * `MotionEvent` cannot carry. A tracked gesture has no duration while the finger is down: its
 * position is a function of the finger, so what has to be named instead is the gain, the
 * threshold that decides where it lands, the spring that takes it there, and what the edge does.
 */
export type TrackedGesture = {
  /** The `motion.spring` key that carries the content to its destination on release. */
  readonly releaseSpring: keyof typeof spring;
  /** When the gesture takes the touch, and which gestures beat it to it (issue #249). */
  readonly activation: TrackedActivation;
  /** Content points travelled per point of finger travel while the finger is down. */
  readonly trackingGain: number;
  /** Fraction of the page width past which a release commits to the next page. */
  readonly commitFraction: number;
  /** Release speed, in points per second, that commits regardless of distance travelled. */
  readonly commitVelocityPtPerS: number;
  /** Gain applied past the first or last page: resistance, not a wall. */
  readonly edgeResistance: number;
  /** Fraction of the page width at which the over-drag past the first/last page stops dead. */
  readonly edgeMaxTravelFraction: number;
  /** Whether paging past the last page returns to the first. */
  readonly wrapAround: boolean;
  /** What the finger's speed at lift-off does to the release spring (issue #249). */
  readonly releaseVelocity: ReleaseVelocityHandoff;
  /** Whether a dependent indicator interpolates with the drag or flips once the outcome is known. */
  readonly indicatorFlip: 'onCommit' | 'continuous';
  /** The `haptics` key fired on a committed release, or `null` for a decided "none". */
  readonly commitHaptic: HapticName | null;
  /** The `haptics` key fired when the over-drag reaches `edgeMaxTravelFraction`, or `null`. */
  readonly edgeHaptic: HapticName | null;
  readonly reduced: TrackedReduced;
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

/** Spring configs for Reanimated's `withSpring`. Hoisted so a token can name one by key. */
const spring = {
  /** Bottom sheets rising (portion, search). */
  sheet: { dampingRatio: 0.82, duration: 200 },
  /**
   * The swipe-between-tabs carousel carrying a part-dragged screen to the tab it committed to —
   * or back to the one it came from (issue #246, consumed by #82). Read it through
   * `motion.carousel.releaseSpring`, never by this key directly: the carousel token is the
   * specification, and this is only where the two numbers live.
   *
   * Crisper and less bouncy than `sheet`. A sheet may overshoot a little — it is arriving, and a
   * touch of bounce reads as weight. A full-screen pager must not: at 390 pt wide, an overshoot
   * shows a sliver of the screen *past* the one you asked for, and that reads as a bug, not as
   * physics. 0.9 is just short of critical damping — about 0.6 pt of overshoot on a 390 pt
   * travel, below the point anyone can see it — so the screen looks like it decelerates rather
   * than stops dead. 220 ms sits under `ceilingMs` and covers the worst case, a release at 1 %
   * dragged that has the whole width to cross.
   */
  carouselRelease: { dampingRatio: 0.9, duration: 220 },
} as const satisfies Record<string, SpringConfig>;

export const motion = {
  /** Nothing animates longer than this, except `chartDraw`, which runs once per screen entry. */
  ceilingMs: 260,
  /** Cubic-bezier control points for Reanimated's `Easing.bezier(...)`. */
  easing,
  /** Spring configs for Reanimated's `withSpring`. */
  spring,
  /**
   * The swipe-between-tabs carousel (issue #246, built by #82) — the one **finger-tracked**
   * gesture that moves a whole screen, and the app's most-used gesture once it lands.
   *
   * WHY THIS IS NOT A `motion.events` KEY. Everything in `events` is fire-and-forget: one
   * `duration`, one `easing`, one `reduced`. While the finger is down the carousel has no
   * duration at all — the screen's position is `trackingGain ×` the finger's, a function of the
   * finger and not of time. Giving it a `duration` would describe only the release and would name
   * a time for the phase the user actually spends the gesture in. It also needs three things
   * `MotionEvent` has nowhere to put: a commit threshold, an edge rule, and a two-phase
   * reduce-motion answer (see `TrackedReduced`). So tracked gestures get their own shape, and
   * `motion.events` keeps meaning exactly one thing.
   *
   * WHY THE THRESHOLDS ARE HERE AND NOT IN `interaction`. `interaction` holds the quantities for
   * gestures whose animation lives in `motion.events` — the long-press that opens a sheet, the
   * detent the slider snaps to. The carousel has no `events` entry to pair with, so splitting it
   * would leave two half-specs and no single place that says what the gesture is. It stays whole.
   *
   * The tab bar reads `glyph.tab` and the `tabBar.*` colours as it does today; this token only
   * decides *when* it changes (`indicatorFlip`).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────────
   * THE ARBITRATION, CONCRETELY (issue #249). #82 lists three gestures the pager has to live
   * alongside. All three are settled by one rule plus one scope:
   *
   * **The rule — the pager claims last, and never takes a touch an inner gesture already holds.**
   * `activation.distancePt` (12) sits strictly above `activation.innerClaimPt` (6), and 6 is
   * exactly where `src/components/shared/SwipeToDelete.tsx`'s `onMoveShouldSetPanResponder`
   * claims (`Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)`). So on a day-log row the row holds
   * the responder six points before the pager would ask for it, and RN never takes a responder
   * away from a child. The same ordering covers the Charts tab's horizontal scrollers, which claim
   * at a few points of travel like any `ScrollView`. Nothing had to be negotiated — the pager
   * loses these by construction, which is why it is testable from the token alone.
   *
   * One consequence #82 must handle, and it is a change in `SwipeToDelete`, not here: a *shut* row
   * claims a rightward drag it then clamps to zero travel (`dragOffset`'s `Math.min(0, …)`), so
   * today a right-swipe anywhere on the day log would be swallowed and the pager would be dead on
   * the most-used half of Today. A row may only claim the direction it can actually move — left
   * while shut, either way while revealed. That is one predicate in ui-engineer's file and it
   * falls inside #82's own acceptance ("DayLogRow swipe-to-delete still works on Today").
   *
   * **No hand-off when an inner scroller runs out.** iOS chains a scroll into its parent at the
   * end of the content; the pager does not accept that. One gesture has one owner for its whole
   * life. A mid-drag hand-off changes what is under the finger without the finger doing anything,
   * and on a chart that is how you lose your place in your own data.
   *
   * **The scope — `activation.onlyAtNavigationRoot`.** The carousel exists on the four tab roots
   * and nowhere else. `app/(tabs)` is the root `Stack`'s first screen, so at a tab root there is
   * nothing to pop and the iOS edge-swipe back gesture does not exist to conflict with; on a
   * pushed screen (`app/foods/[id]`, `app/meals/[id]`) the horizontal drag belongs to the
   * navigator, whole, and the pager is not mounted. This is why there is deliberately **no
   * left-edge exclusion zone**: a dead strip at the bezel would kill the one-handed flick from the
   * frame of the phone, which is the gesture `commitVelocityPtPerS` exists to serve, and it would
   * buy protection from a gesture that is not there. Android's own back gesture is consumed in the
   * system gesture insets before the app sees the touch, for the same reason.
   */
  carousel: {
    releaseSpring: 'carouselRelease',
    /**
     * When the pager takes the touch. See THE ARBITRATION above for what each number is beating.
     *
     * 12 pt is far enough that the sideways drift in a brisk vertical flick never trips it and
     * that `SwipeToDelete` has already claimed at 6, and close enough that the screen is moving
     * before you can wonder whether the phone heard you. `axisRatio` 2 keeps the claim inside
     * 26.6° of horizontal: Today and Charts are vertical lists, scrolling them happens far more
     * often than changing tab, so every ambiguous diagonal has to go to the scroll — at ratio 1
     * (45°) a fast thumb up the day log changes tab instead, which is unforgivable on priority 1.
     */
    activation: {
      distancePt: 12,
      axisRatio: 2,
      /** Where `SwipeToDelete`'s `PanResponder` claims. `distancePt` must stay above it. */
      innerClaimPt: 6,
      onlyAtNavigationRoot: true,
    },
    /**
     * 1:1. The screen moves exactly as far as the finger, in the same direction, for the whole
     * drag. Any other number means the content slides out from under the thumb, and on the app's
     * most-used gesture that reads as the phone arguing with you. Priority 1 is how the app feels.
     */
    trackingGain: 1,
    /**
     * Release past 22 % of the page width and the next tab commits; release short of it and the
     * current screen springs back. 22 % of a 390 pt screen is ~86 pt — roughly how far a thumb
     * swings across the screen without the hand re-gripping, so a committed swipe is a flick you
     * can do one-handed rather than a drag across the whole phone (a 50 % threshold needs the
     * second hand). It is deliberately below half: with `commitVelocityPtPerS` as the other way
     * in, the cost of a mistaken commit is one swipe back, and the cost of a missed commit is
     * doing the whole gesture again.
     */
    commitFraction: 0.22,
    /**
     * …or release moving faster than 420 pt/s (~1.1 screen widths per second) and it commits
     * however little distance it covered. The two rules are an OR, and this one is why a quick
     * flick from the bezel works: a fast swipe lifts off early and would otherwise fail
     * `commitFraction` and spring back, which is the single most common way a pager feels broken.
     * Below this speed the gesture is a positioning drag and distance decides.
     */
    commitVelocityPtPerS: 420,
    /**
     * Past the first tab or the last one there is no screen to bring in, so the drag keeps only
     * 30 % of the finger's travel and the release spring pulls it back. Resistance, not a wall:
     * a dead edge leaves you unsure whether the gesture was recognised at all, while 30 % says
     * "heard you, there is nothing over here" in the gesture itself. Nothing commits at an edge.
     */
    edgeResistance: 0.3,
    /**
     * …and it stops there. `edgeResistance` says how hard the over-drag is; this says where it
     * ends. 10 % of a 390 pt screen is ~39 pt of content travel, which at gain 0.3 costs ~130 pt
     * of finger — a long, deliberate pull, never a wobble, so nobody meets the stop by accident.
     *
     * A hard stop rather than an asymptote. An asymptote keeps surrendering a pixel however long
     * you pull, which reads as a pager that is lagging behind your finger; a stop says, in the
     * gesture itself, "this is the end of the row". It is also what gives `edgeHaptic` a defined
     * instant to fire at. It stays well below `commitFraction`, so an over-drag can never reach a
     * committing distance: nothing commits at an edge, in either rule.
     */
    edgeMaxTravelFraction: 0.1,
    /**
     * No wrap-around — the answer to the question #82 left open for design ("no wrap-around past
     * the first/last tab (to confirm with design)"). Four tabs in a fixed bottom-bar order are a
     * row, not a ring: Today is on the left and Settings is on the right, and that is the one
     * spatial fact the tab bar teaches. Wrapping makes a left-swipe from Today land on Settings,
     * which contradicts the bar the user is looking at, and it deletes the only signal the gesture
     * has for "you are at an end" — `edgeResistance` and `edgeMaxTravelFraction` both exist
     * because this is `false`.
     */
    wrapAround: false,
    /**
     * The flick carries. At lift-off the spring inherits the finger's velocity at full gain, so a
     * fast swipe continues at its own speed through the release instead of halting for a frame and
     * setting off again from rest. That halt is the difference between a pager that feels native
     * and one that feels like a web page, and it is visible on exactly the gesture
     * `commitVelocityPtPerS` is built for.
     *
     * `capSpringSpeeds: 1` is what keeps the carry from undoing `carouselRelease`'s no-overshoot
     * promise. The carried speed is clamped to the spring's own average speed for the distance
     * that is left — `remainingPt ÷ (duration ÷ 1000)` — so the hand-off can only ever remove the
     * jerk at lift-off, never add travel the spring did not plan for. The dangerous release is not
     * the fast one; it is the fast one with almost nothing left to cover (a flick that crossed
     * nearly the whole width before lifting), where an uncapped 2 000 pt/s hand-off throws the
     * screen well past its destination and shows a sliver of the tab *after* the one you asked
     * for. A flat pt/s ceiling cannot catch that case, because the same number is fine at 300 pt
     * remaining and ruinous at 20; only a cap tied to the remaining distance scales with it.
     *
     * `awayFromDestination: 'drop'` handles the rare, real release where the drag passed
     * `commitFraction` but the finger was already reversing when it left the glass. Handing that
     * velocity over walks the screen backwards and then hauls it forwards, which reads as a glitch
     * rather than as physics, so only the component toward the destination is carried.
     */
    releaseVelocity: {
      carry: 1,
      capSpringSpeeds: 1,
      awayFromDestination: 'drop',
    },
    /**
     * The tab bar flips in one frame once the release has committed — it does not interpolate
     * with the drag. Two reasons. The glyph change is a swap, not a tween: `glyph.tab` goes
     * outline → filled cut, which has no halfway. And a continuously-interpolated indicator puts
     * two tabs in a half-active state mid-drag, which is ambiguity in the one element whose only
     * job is to say unambiguously where you are. So the bar states the destination the moment
     * the destination is known — at release, not when the screen crosses a halfway line, because
     * until the finger lifts nothing is decided and the drag can still come back.
     */
    indicatorFlip: 'onCommit',
    /**
     * **No haptic on a committed tab change.** `null` rather than absent: the question #249 asked
     * is answered, not still open, and a later reader should not have to re-derive it.
     *
     * Three reasons, in the order that decided it. The swipe is direct manipulation — the whole
     * screen travelled under your thumb and a different screen is now in front of you, so a buzz
     * confirms nothing you cannot already see, and the Motion board's own rule is that motion and
     * feedback are feedback, never decoration. It would fire dozens of times a session, which is
     * how a haptic vocabulary goes deaf: `foodLogged` only works as "the food is saved" while it is
     * rare enough to mean something, and a tick on every tab change blunts it. And there is no
     * crossing to fire at anyway — `indicatorFlip` is `onCommit` precisely because nothing is
     * decided until the finger lifts, so a mid-drag "you have crossed the line" tick would be
     * claiming an outcome the drag can still take back.
     *
     * This is a `null` with a reason, not a gap. If the client wants one, it goes here and the
     * vocabulary argument above is what has to be answered.
     */
    commitHaptic: null,
    /**
     * The edge gets one, because the edge is the one outcome the screen cannot show you. Pull past
     * the first or last tab and 30 % of your travel happens and then springs back — nothing
     * appears, because there is no screen over there to appear. A tick at the hard stop
     * (`edgeMaxTravelFraction`) is the gesture answering "heard you, there is nothing this way",
     * and it lands while the finger is still down and can still stop pulling, which is the only
     * time the information is useful.
     *
     * Fires **once per gesture**, on first reaching the stop — not repeatedly, not again on
     * release, and never when a release commits or springs back inside the row. Like every haptic
     * in this app it survives reduce motion (`haptics`' own rule): it is feedback, not animation.
     */
    edgeHaptic: 'carouselEdge',
    reduced: {
      /**
       * The drag survives reduce motion untouched. It is not an animation we are playing at the
       * user — it is their finger, at `trackingGain` 1, and the screen stopping short of it is
       * either a broken gesture or a gesture with no feedback at all. Direct manipulation is the
       * documented exception to prefers-reduced-motion, and the existing Motion board's "nothing
       * vestibular either way" for the tab change is what that means for a tracked drag.
       */
      tracked: 'same',
      /**
       * The release is the part that moves on its own, so it is the part that goes: the screen
       * lands on the committed tab in one frame instead of springing 220 ms across the width.
       * Snap-back on a non-committed release is the same — instant return. The commit thresholds
       * and `edgeResistance` are unchanged: reduce motion changes what you watch, never what
       * your finger has to do.
       */
      release: { kind: 'instant', duration: 0 },
    },
  },
  /**
   * Every named animation in the app, by the *event* that causes it — never by the component that
   * happens to play it, so two surfaces reacting to the same event cannot drift apart.
   *
   * A key lives here only while the design language still calls for it. Issue #210's audit found
   * which keys no production code reaches; issue #224 ruled on each one (wire / retire / defer),
   * and a key ruled **retire** is deleted outright rather than left to rot. Two went that way:
   * `searchLift` (the shipped search presents the sheet and *then* takes focus, issue #79 — the
   * bar never lifts into the field, and reviving that is a new design decision, not a dead token)
   * and `tabFade` (issue #82 makes the tab change a finger-tracked carousel; a 140 ms cross-fade
   * is a different transition, and the carousel's own motion gets its own token when it lands).
   * A key that is designed but not yet wired says so in its own doc below
   * and names the issue that will wire it, so "unreached" is never a silent state. The guard that
   * keeps this honest is `src/components/quick-add/motionEventsReachability.audit.test.tsx`: add a
   * key here with neither a consumer nor a tracked exception and the suite goes red.
   */
  events: {
    /** Quick-add tile finger-down: scale 1 → 0.972. The only thing that moves. */
    tilePressIn: { duration: 90, easing: 'out', reduced: { kind: 'instant', duration: 0 } },
    /** Tile finger-up: back to 1. */
    tilePressOut: { duration: 130, easing: 'out', reduced: { kind: 'instant', duration: 0 } },
    /** A ring sweeping to its new length after a log. Retargets if interrupted, never queues. */
    arcSweep: { duration: 260, easing: 'standard', reduced: { kind: 'instant', duration: 0 } },
    /**
     * The amber wash arriving across a logged tile (then holds `interaction.tileLoggedHoldMs`).
     * #224 ruled **wire** — `QuickAddTile` swaps `tile.bgLogged` in one frame today, and the tile's
     * logged state is the product's only confirmation that a log happened. Issue #228 wires it.
     */
    loggedWashIn: { duration: 120, easing: 'out', reduced: { kind: 'instant', duration: 0 } },
    /** The wash leaving. Wired with `loggedWashIn` by #228. */
    loggedWashOut: { duration: 200, easing: 'out', reduced: { kind: 'instant', duration: 0 } },
    /** The ×2 badge popping in on a second tap inside the repeat window. */
    repeatBadge: { duration: 160, easing: 'standard', reduced: { kind: 'fade', duration: 120 } },
    /** Undo toast rising 16 pt and fading in above the tab bar. */
    toastIn: { duration: 180, easing: 'out', reduced: { kind: 'fade', duration: 180 } },
    /** Undo toast leaving. */
    toastOut: { duration: 140, easing: 'out', reduced: { kind: 'fade', duration: 140 } },
    /**
     * Portion or search sheet rising from the bottom edge, screen dimming behind.
     * #224 ruled **defer**, blocked on a dependency: both sheets present through React Native
     * core's `Modal animationType="slide"` because adding a native bottom-sheet module has to be
     * raised first (`CLAUDE.md`), so this spring is the specification that slide approximates.
     * Issue #231 decides the dependency and then either wires these two or retires them.
     */
    sheetIn: { duration: 200, easing: 'spring', reduced: { kind: 'fade', duration: 120 } },
    /** Sheet leaving (including after a row logs). Deferred with `sheetIn` — see #231. */
    sheetOut: { duration: 160, easing: 'standard', reduced: { kind: 'fade', duration: 120 } },
    /** Presets ↔ Exact: the preset steps and the slider cross-fade in place; sheet height animates. */
    portionModeSwap: { duration: 160, easing: 'standard', reduced: { kind: 'instant', duration: 0 } },
    /** Food form: picking Custom… opens the label / basis / amount fields in place of the locked
     * read-out (height + fade); picking a preset closes them. Interruptible: a second chip tap
     * mid-animation reverses it from where it is. */
    customReveal: { duration: 200, easing: 'standard', reduced: { kind: 'instant', duration: 0 } },
    /**
     * The slider thumb settling onto a detent it was released near.
     * #224 ruled **wire**, not retire: `PortionSheet`'s slider already snaps the *value* on release
     * and fires `haptics.sliderDetent` — only the visual settle is missing, so the thumb teleports
     * while the haptic says something physical happened. Issue #230 wires it.
     */
    sliderSnap: { duration: 120, easing: 'out', reduced: { kind: 'instant', duration: 0 } },
    /**
     * A row or chip background changing to its pressed colour.
     * #224 ruled **wire** — every press colour in the app is a one-frame swap today. Issue #229
     * puts this token behind them. Reduce motion keeps it: a colour change is not vestibular.
     */
    rowPress: { duration: 90, easing: 'out', reduced: { kind: 'same', duration: 90 } },
    /**
     * Form frame (issue #207): the pinned footer's divider hairline fading in while body content
     * runs underneath the footer, and out again when the body is scrolled to its end. Opacity only,
     * on a 1 pt line — nothing vestibular — so reduce motion keeps it (`same`). The footer's own
     * travel when the keyboard opens is NOT here on purpose: it rides the keyboard's own curve, and
     * a Vitals duration laid over it would only desync the two.
     */
    footerDividerFade: { duration: 120, easing: 'out', reduced: { kind: 'same', duration: 120 } },
    /**
     * The active set collapsing 102 → 44 pt as the next set expands.
     * #224 ruled **defer**, blocked on a screen that does not exist: `app/(tabs)/workout.tsx` is a
     * placeholder, so there is no set row to collapse. Issue #232 tracks both Workout keys.
     */
    setCollapse: { duration: 220, easing: 'inOut', reduced: { kind: 'instant', duration: 0 } },
    /** The rest ring's last-three-seconds pulse (the depletion itself is `continuous.restRing`).
     * Deferred with `setCollapse` on the Workout screen — see #232. */
    restPulse: { duration: 240, easing: 'inOut', reduced: { kind: 'instant', duration: 0 } },
    /**
     * Trend and average lines stroking on, points fading in behind. Once per screen entry.
     * #224 ruled **defer**, blocked on a screen that does not exist: `app/(tabs)/charts.tsx` is a
     * placeholder. Issue #233 tracks both Charts keys.
     */
    chartDraw: { duration: 420, easing: 'out', reduced: { kind: 'instant', duration: 0 }, staggerMs: 12 },
    /** Axis rescale and path morph on a range switch. Deferred with `chartDraw` — see #233. */
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
  spring: Record<string, SpringConfig>;
  carousel: TrackedGesture;
  events: Record<string, MotionEvent>;
  continuous: Record<string, unknown>;
};

export type MotionEventName = keyof typeof motion.events;
/** A spring by name: `motion.spring[motion.carousel.releaseSpring]`. */
export type SpringName = keyof typeof spring;

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
  /**
   * The swipe-between-tabs carousel hitting the end of the row (issue #249, fired by #82) — the
   * over-drag reaching `motion.carousel.edgeMaxTravelFraction` at the first or last tab, once per
   * gesture. The lightest pair in the vocabulary, the same one `setLogged` uses, because it reports
   * a *non*-event: there was no tab that way. It must never read like a confirmation —
   * `foodLogged`'s medium impact is the only haptic that means something was written.
   *
   * There is deliberately no sibling for a committed tab change; see `motion.carousel.commitHaptic`
   * for why that is `null`.
   */
  carouselEdge: { ios: 'impactLight', android: 'EFFECT_TICK' },
} as const satisfies Record<string, Haptic>;

/** A haptic by name, for a token that names one instead of restating its two strings. */
export type HapticName = keyof typeof haptics;
