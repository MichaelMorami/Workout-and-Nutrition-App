/**
 * Visual evidence for issue #264 — what a fast drag puts under the thumb, both themes.
 *
 * WHY THIS EXISTS. There is no simulator in this environment, and this bug is only visible *during*
 * a gesture, so a screenshot of the sheet at rest shows nothing. This draws the Exact slider row
 * `PortionSheet.tsx` itself draws — track, fill, detent ticks, thumb, nudges, readout — from the
 * same `tokens.ts` values and the same geometry the tests drive (a 400 pt track, an 8-serving
 * range, the finger at 271 pt), so the picture is evidence about the component rather than a second
 * implementation of it. Same discipline as this folder's `build-evidence.mjs` (#90) and
 * `build-readout-evidence.mjs` (#94).
 *
 * Two cards per theme, for a candidate the data model cannot weigh (a meal), whose Exact control
 * counts in servings: the value a drag used to produce at that position, and the one it produces
 * now. The ticks are every 0.5-serving detent; the hollow ones in the first card are the detents a
 * drag could never land on, because the move handler rounded to a whole serving.
 *
 * Run: node src/components/quick-add/__evidence__/build-slider-detent-evidence.mjs
 * (Node >= 23.6 — imports the .ts sources directly via native type stripping.)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { interaction, radius, size, space, themes, type as typeTokens } from '../../../theme/tokens.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** The geometry `PortionSheet.test.tsx`'s issue #264 cases drive, so the two agree by construction. */
const TRACK = 400;
const RANGE = interaction.servingSteps.custom.max;
const FINGER = 271;
const DETENT = 0.5;

const raw = (FINGER / TRACK) * RANGE;
const before = Math.round(raw);
const after = Math.round(raw / DETENT) * DETENT;
const pixelsOf = (servings) => (servings / RANGE) * TRACK;

const font = (t) =>
  `font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:${t.fontSize}px;` +
  `line-height:${t.lineHeight}px;letter-spacing:${t.letterSpacing}px;` +
  (t.textTransform ? `text-transform:${t.textTransform};` : '');

function ticks(theme, halvesReachable) {
  const { slider } = theme.color;
  const marks = [];
  for (let half = 0; half <= RANGE * 2; half += 1) {
    const servings = half / 2;
    const whole = half % 2 === 0;
    const solid = whole || halvesReachable;
    marks.push(`
      <span class="tick" style="
        left:${pixelsOf(servings) - size.slider.detentWidth / 2}px;
        width:${size.slider.detentWidth}px;
        height:${whole ? size.slider.detentHeight : size.slider.detentHeight * 0.6}px;
        background:${solid ? slider.detentIcon : 'transparent'};
        box-shadow:${solid ? 'none' : `inset 0 0 0 1px ${slider.detentIcon}`};
        opacity:${solid ? 1 : 0.45};"></span>`);
  }
  return marks.join('');
}

function trackRow(theme, value, halvesReachable) {
  const { slider } = theme.color;
  const thumbLeft = Math.min(TRACK - size.slider.thumb, Math.max(0, pixelsOf(value) - size.slider.thumb / 2));
  const nudge = (glyph) => `
    <span class="nudge" style="width:${size.slider.nudgeWidth}px;height:${size.slider.nudgeHit}px;
      border-radius:${radius.md}px;background:${slider.nudgeBg}">
      <span style="${font(typeTokens.numericLg)}color:${slider.nudgeIcon}">${glyph}</span>
    </span>`;
  return `
    <div class="slider-row" style="gap:${space[3]}px">
      ${nudge('&minus;')}
      <div class="hit" style="width:${TRACK}px;height:${size.slider.thumbHit}px">
        <div class="track" style="top:${(size.slider.thumbHit - size.slider.track) / 2}px;
          height:${size.slider.track}px;border-radius:${radius.pill}px;background:${slider.track}">
          <div style="width:${(pixelsOf(value) / TRACK) * 100}%;height:100%;border-radius:${radius.pill}px;background:${slider.fill}"></div>
        </div>
        <div class="ticks" style="top:${(size.slider.thumbHit + size.slider.track) / 2 + 5}px">${ticks(theme, halvesReachable)}</div>
        <span class="thumb" style="left:${thumbLeft}px;top:${(size.slider.thumbHit - size.slider.thumb) / 2}px;
          width:${size.slider.thumb}px;height:${size.slider.thumb}px;border-radius:${radius.pill}px;
          background:${slider.thumb};border:${size.slider.thumbRing}px solid ${slider.thumbRing}"></span>
        <span class="finger" style="left:${FINGER}px;height:${size.slider.thumbHit}px;background:${theme.color.text.primary}"></span>
      </div>
      ${nudge('+')}
    </div>`;
}

function card(theme, { heading, value, halvesReachable, verdict }) {
  const { portionSheet, slider } = theme.color;
  return `
  <figure class="card" style="background:${portionSheet.bg};border-radius:${radius.lg}px;padding:${space[4]}px;gap:${space[3]}px">
    <figcaption class="title" style="color:${theme.color.text.tertiary}">${heading}</figcaption>
    <span style="${font(typeTokens.portionReadout)}color:${portionSheet.readoutText}">&times;${value}</span>
    <div class="figures-row" style="gap:${space[4]}px">
      <span style="${font(typeTokens.numericLg)}color:${portionSheet.kcalText}">${Math.round(410 * value).toLocaleString('en-US')} kcal</span>
      <span style="${font(typeTokens.numericLg)}color:${portionSheet.proteinText}">${Math.round(38 * value)} g protein</span>
    </div>
    ${trackRow(theme, value, halvesReachable)}
    <div class="log-button" style="background:${portionSheet.logButtonBg};border-radius:${radius.md}px;min-height:${size.portionSheet.logButtonHit}px">
      <span style="${font(typeTokens.button)}color:${portionSheet.logButtonText}">Log &times;${value}</span>
    </div>
    <span class="verdict" style="${font(typeTokens.label)}color:${slider.rangeText}">${verdict}</span>
  </figure>`;
}

function page(theme) {
  const cards = [
    card(theme, {
      heading: `Before — finger at ${FINGER} pt, thumb at &times;${before}`,
      value: before,
      halvesReachable: false,
      verdict: `The thumb stalls ${Math.round(FINGER - pixelsOf(before))} pt behind the finger and the hollow half-serving
                detents are unreachable by a drag &mdash; so lifting the finger here snaps to &times;${after}, a value
                neither the readout nor the Log button ever showed.`,
    }),
    card(theme, {
      heading: `After — finger at ${FINGER} pt, thumb at &times;${after}`,
      value: after,
      halvesReachable: true,
      verdict: `Every 0.5-serving detent is a value the drag can land on, the thumb sits under the finger, and &times;${after}
                is what the readout shows, what the release keeps and what gets logged.`,
    }),
  ].join('');
  return `<!doctype html><meta charset="utf-8"><title>Exact slider — the value under the thumb (issue #264) — ${theme.name}</title>
  <style>
    :root { color-scheme: ${theme.name}; }
    body { margin:0; padding:${space[7]}px; background:${theme.color.bg.canvas};
           font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; }
    h1 { font-size:15px; font-weight:600; margin:0 0 20px; color:${theme.color.text.secondary}; letter-spacing:.02em; }
    .grid { display:flex; flex-direction:column; gap:22px; align-items:flex-start; }
    .card { margin:0; display:flex; flex-direction:column; align-items:flex-start; width:${TRACK + size.slider.nudgeWidth * 2 + space[3] * 2}px; }
    .title { font-size:11px; letter-spacing:.06em; text-transform:uppercase; }
    .figures-row { display:flex; }
    .slider-row { display:flex; align-items:center; }
    .nudge { display:inline-flex; align-items:center; justify-content:center; }
    .hit { position:relative; }
    .track { position:absolute; left:0; right:0; overflow:hidden; }
    .ticks { position:absolute; left:0; right:0; }
    .tick { position:absolute; display:block; }
    .thumb { position:absolute; box-sizing:border-box; display:block; }
    .finger { position:absolute; top:0; width:1px; display:block; opacity:.55; }
    .log-button { width:100%; box-sizing:border-box; display:flex; align-items:center; justify-content:center; }
    .verdict { max-width:${TRACK}px; }
  </style>
  <h1>Portion sheet — Exact slider, a meal at ${FINGER} pt of a ${TRACK} pt track (issue #264) — ${theme.name} — real tokens</h1>
  <div class="grid">${cards}</div>`;
}

mkdirSync(HERE, { recursive: true });
const stage = mkdtempSync(join(tmpdir(), 'vitals-slider-detent-evidence-'));
for (const name of ['dark', 'light']) {
  const html = join(stage, `slider-detent-${name}.html`);
  writeFileSync(html, page(themes[name]));
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=640,780',
    `--screenshot=${join(HERE, `slider-detent-${name}.png`)}`,
    `file://${html}`,
  ]);
  console.log(`wrote slider-detent-${name}.png`);
}
