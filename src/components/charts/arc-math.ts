/**
 * The maths behind a progress arc. Pure — no React, no rendering, no tokens.
 *
 * It lives apart from `ProgressArc.tsx` so the geometry can be unit-tested against hand-computed
 * fixtures instead of a screenshot. A wrong scale is the one chart bug a picture will not catch.
 *
 * The geometry mirrors `design/build-canvas.mjs`'s `ring()` exactly: radius is `(diameter - stroke) / 2`
 * so the stroke sits inside its box, and progress is drawn by offsetting a dash pattern rather than
 * by building an arc path — one animated scalar per lap, which is what keeps the sweep on the UI
 * thread.
 *
 * ROUNDING. Calories and grams are whole numbers everywhere in the UI, so `arcModel` rounds value and
 * target FIRST and derives both the shape and the words from the same rounded pair. Otherwise 2400.4
 * against a 2,400 target would draw an over-target ring while the caption read "0 over".
 */

/** Where a value stands against its target. `noTarget` is a target of zero, missing or nonsense. */
export type ArcStatus = 'noTarget' | 'under' | 'met' | 'over';

/** The two things Today rings. Each owns its colour, unit and wording. */
export type ArcMetric = 'kcal' | 'protein';

export type RingGeometry = {
  /** The box the ring is drawn in, points. */
  readonly diameter: number;
  /** Stroke thickness, points. */
  readonly stroke: number;
  /** Centre of the box, on both axes. */
  readonly center: number;
  /** Radius of the stroke's centre line. */
  readonly radius: number;
  /** Length of one full lap — the dash pattern and every offset are in these units. */
  readonly circumference: number;
};

export type TickLine = {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
};

/** Copy and units per metric. Calories go "over"; protein goes "past" — past target is not a warning. */
const METRIC_COPY: Record<ArcMetric, {
  /** The accessibility label and the name a person would say. */
  readonly name: string;
  /** The eyebrow inside the ring. */
  readonly ringLabel: string;
  /** The unit spoken after the target ("… kcal", "… protein"). */
  readonly spokenUnit: string;
  /** The unit printed beside a number, if any. */
  readonly unit: string;
  /** The word for an overage. */
  readonly overWord: string;
}> = {
  kcal: { name: 'Calories', ringLabel: 'Kcal', spokenUnit: 'kcal', unit: '', overWord: 'over' },
  protein: { name: 'Protein', ringLabel: 'Protein', spokenUnit: 'protein', unit: 'g', overWord: 'past' },
};

/** A non-finite number is treated as 0 — a degenerate ring is recoverable, `NaN` in an SVG is not. */
const finiteOrZero = (n: number): number => (Number.isFinite(n) ? n : 0);

const clamp01 = (n: number): number => Math.min(1, Math.max(0, finiteOrZero(n)));

/** Amounts are never negative: a negative total is a bug upstream, not a ring drawn backwards. */
const amount = (n: number): number => Math.max(0, finiteOrZero(n));

/** Ring measurements for a box of `diameter` drawn with a stroke of `stroke`. */
export function ringGeometry(diameter: number, stroke: number): RingGeometry {
  const d = amount(diameter);
  const s = Math.min(amount(stroke), d);
  const radius = (d - s) / 2;
  return { diameter: d, stroke: s, center: d / 2, radius, circumference: 2 * Math.PI * radius };
}

/** How far through the target the value is. `0` when there is no target to measure against. */
export function progressRatio(value: number, target: number): number {
  const t = amount(target);
  if (t <= 0) return 0;
  return amount(value) / t;
}

export function arcStatus(value: number, target: number): ArcStatus {
  const t = amount(target);
  if (t <= 0) return 'noTarget';
  const v = amount(value);
  if (v > t) return 'over';
  if (v === t) return 'met';
  return 'under';
}

/** The first lap, 0–1. Stays full once past target — the overage is a lap of its own. */
export function firstLapFraction(value: number, target: number): number {
  return clamp01(progressRatio(value, target));
}

/** The second lap, 0–1. Clamped at one full lap, so a double-target day cannot spin the ring. */
export function overLapFraction(value: number, target: number): number {
  return clamp01(progressRatio(value, target) - 1);
}

/**
 * The `strokeDashoffset` that reveals `fraction` of a lap, given a dash pattern of
 * `[circumference, circumference]`: a full offset hides everything, a zero offset shows one lap.
 */
export function dashOffset(circumference: number, fraction: number): number {
  return amount(circumference) * (1 - clamp01(fraction));
}

/**
 * The tick drawn across the ring where the target sits, in the ring's own pre-rotation space
 * (the drawing rotates -90° so this lands at 12 o'clock).
 *
 * The ring is flush with its box — outer edge at `radius + stroke / 2` = the box edge — so the outer
 * half of the tick would fall outside the SVG and be clipped by the renderer. Clamping it here makes
 * that explicit and testable rather than something each platform decides for itself.
 */
export function targetTickLine(geometry: RingGeometry, length: number): TickLine {
  const half = amount(length) / 2;
  const x1 = Math.max(0, geometry.center + geometry.radius - half);
  const x2 = Math.min(geometry.diameter, geometry.center + geometry.radius + half);
  return { x1, y1: geometry.center, x2, y2: geometry.center };
}

const format = (n: number, locale: string | undefined): string => n.toLocaleString(locale);

/** A number with its unit, if the metric has one: `1,160` / `84 g`. */
const withUnit = (n: number, metric: ArcMetric, locale: string | undefined): string => {
  const { unit } = METRIC_COPY[metric];
  return unit ? `${format(n, locale)} ${unit}` : format(n, locale);
};

export type ArcCaptionInput = {
  readonly metric: ArcMetric;
  readonly value: number;
  readonly target: number;
  /** Defaults to the device locale. */
  readonly locale?: string;
};

/**
 * The line under the ring — and the cue that makes "over" survive greyscale, a screenshot or a
 * colourblind reader. Never let this become decoration.
 */
export function arcCaption({ metric, value, target, locale }: ArcCaptionInput): string {
  const v = Math.round(amount(value));
  const t = Math.round(amount(target));
  const status = arcStatus(v, t);
  if (status === 'noTarget') return 'No target set';
  if (status === 'met') return 'Target hit';
  if (status === 'over') return `${withUnit(v - t, metric, locale)} ${METRIC_COPY[metric].overWord}`;
  return `${withUnit(t - v, metric, locale)} left`;
}

export type ArcModelInput = {
  readonly metric: ArcMetric;
  readonly value: number;
  readonly target: number;
  readonly diameter: number;
  readonly stroke: number;
  /** Defaults to the device locale. */
  readonly locale?: string;
  /** Length of the target tick, points. `0` (the default) still yields a well-formed, zero-length line. */
  readonly tickLength?: number;
};

export type ArcModel = {
  readonly metric: ArcMetric;
  /** Value and target as drawn and spoken — rounded, so shape and words always agree. */
  readonly value: number;
  readonly target: number;
  readonly status: ArcStatus;
  /** `true` once past target: muted first lap, bright second lap, knockout and tick. */
  readonly isOver: boolean;
  readonly geometry: RingGeometry;
  /** Progress in laps, clamped to 2. This is the value the animation drives. */
  readonly ratio: number;
  readonly firstLapOffset: number;
  readonly overLapOffset: number;
  readonly tick: TickLine;
  /** The eyebrow inside the ring ("KCAL"). */
  readonly label: string;
  /** The big number inside the ring. */
  readonly valueText: string;
  /** "of 2,400" / "of 180 g". Empty when there is no target — "of 0" would invent one. */
  readonly targetText: string;
  readonly caption: string;
  readonly accessibilityLabel: string;
  readonly accessibilityText: string;
};

/** Everything `<ProgressArc>` needs to draw itself, computed once and testable on its own. */
export function arcModel({ metric, value, target, diameter, stroke, locale, tickLength = 0 }: ArcModelInput): ArcModel {
  const v = Math.round(amount(value));
  const t = Math.round(amount(target));
  const geometry = ringGeometry(diameter, stroke);
  const status = arcStatus(v, t);
  const copy = METRIC_COPY[metric];
  const caption = arcCaption({ metric, value: v, target: t, locale });
  // With no target there is nothing to be "of": printing "of 0" invents a target the user never set,
  // and a screen reader saying "1,240 of 0 kcal" is worse still. The caption carries this state.
  const targetText = status === 'noTarget' ? '' : `of ${withUnit(t, metric, locale)}`;
  const spoken = targetText ? `${format(v, locale)} ${targetText}` : format(v, locale);

  return {
    metric,
    value: v,
    target: t,
    status,
    isOver: status === 'over',
    geometry,
    ratio: Math.min(2, progressRatio(v, t)),
    firstLapOffset: dashOffset(geometry.circumference, firstLapFraction(v, t)),
    overLapOffset: dashOffset(geometry.circumference, overLapFraction(v, t)),
    tick: targetTickLine(geometry, tickLength),
    label: copy.ringLabel,
    valueText: format(v, locale),
    targetText,
    caption,
    accessibilityLabel: copy.name,
    accessibilityText: `${spoken} ${copy.spokenUnit}, ${caption}`,
  };
}
