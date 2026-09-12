/**
 * Visual evidence for `<ProgressArc>` — six states × both themes, as two PNGs.
 *
 * WHY THIS EXISTS. Nothing mounts the arcs on a screen yet (`app/(tabs)/index.tsx` is ui-engineer's
 * placeholder), so a simulator shot would show the placeholder, not the ring. This draws the same
 * SVG the component draws — same layer order, same `arcModel()`, same `tokens.ts` — so the picture
 * on the PR is evidence about the component and not about a second implementation of it.
 *
 * WHAT IS AND IS NOT PROVED. Geometry, draw order, colour and the bloom are real: the ring markup is
 * generated from the imported `arcModel()` and the imported theme, and the glow is the same
 * `feGaussianBlur` the component emits. Type is approximate — Archivo is not installed in the
 * browser, so the readout falls back to a system sans. Layout on a real screen belongs to the PR
 * that first mounts it.
 *
 * Run: node src/components/charts/__evidence__/build-evidence.mjs
 * (Node >= 23.6 — imports the .ts sources directly via native type stripping, like
 * `design/build-canvas.mjs`.)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arcModel } from '../arc-math.ts';
import { size, themes, type as typeTokens } from '../../../theme/tokens.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LOCALE = 'en-GB';

/** The six states worth a picture: the four the ring must get right, plus protein and no-target. */
const STATES = [
  { title: 'Zero', metric: 'kcal', value: 0, target: 2400 },
  { title: 'Partial', metric: 'kcal', value: 1240, target: 2400 },
  { title: 'At target', metric: 'kcal', value: 2400, target: 2400 },
  { title: 'Over target', metric: 'kcal', value: 2580, target: 2400 },
  { title: 'Protein, over', metric: 'protein', value: 192, target: 180 },
  { title: 'No target set', metric: 'kcal', value: 1240, target: 0 },
];

const colorsFor = (theme, metric) =>
  metric === 'kcal'
    ? { lap: theme.color.arc.kcal, overBase: theme.color.arc.kcalOverBase, caption: theme.color.arc.kcalText }
    : { lap: theme.color.arc.protein, overBase: theme.color.arc.proteinOverBase, caption: theme.color.arc.proteinText };

const font = (t) =>
  `font-size:${t.fontSize}px;line-height:${t.lineHeight}px;letter-spacing:${t.letterSpacing}px;` +
  (t.textTransform ? `text-transform:${t.textTransform};` : '');

/** The same layer order as `ProgressArc.tsx`: bloom, base, then either the over pair or one lap. */
function ringSvg(state, theme, id) {
  const { diameter, stroke } = size.arc;
  const model = arcModel({ ...state, diameter, stroke, locale: LOCALE, tickLength: size.arc.targetTickLength });
  const { center, radius, circumference } = model.geometry;
  const c = colorsFor(theme, state.metric);
  const dash = `${circumference} ${circumference}`;
  const firstLap = circumference * (1 - Math.min(1, Math.max(0, model.ratio)));
  const overLap = circumference * (1 - Math.min(1, Math.max(0, model.ratio - 1)));
  const active = model.isOver ? overLap : firstLap;
  const ring = `cx="${center}" cy="${center}" r="${radius}" fill="none"`;
  const glowId = `arc-glow-${id}`;

  const bloom =
    theme.glow.ringOpacity > 0
      ? `<defs><filter id="${glowId}" x="0" y="0" width="${diameter}" height="${diameter}" filterUnits="userSpaceOnUse">
           <feGaussianBlur in="SourceGraphic" stdDeviation="${theme.glow.ringRadius / 2}"/>
         </filter></defs>
         <circle ${ring} stroke="${c.lap}" stroke-width="${stroke}" stroke-linecap="round"
                 stroke-dasharray="${dash}" stroke-dashoffset="${active}"
                 opacity="${theme.glow.ringOpacity}" filter="url(#${glowId})"/>`
      : '';

  const over = `
    <circle ${ring} stroke="${theme.color.arc.overKnockout}" stroke-width="${stroke + 2 * size.arc.overKnockout}"
            stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="${overLap}"/>
    <circle ${ring} stroke="${c.lap}" stroke-width="${stroke}" stroke-linecap="round"
            stroke-dasharray="${dash}" stroke-dashoffset="${overLap}"/>
    <line x1="${model.tick.x1}" y1="${model.tick.y1}" x2="${model.tick.x2}" y2="${model.tick.y2}"
          stroke="${theme.color.arc.targetTickIcon}" stroke-width="${size.arc.targetTickWidth}" stroke-linecap="round"/>`;

  const under = `<circle ${ring} stroke="${c.lap}" stroke-width="${stroke}" stroke-linecap="round"
                         stroke-dasharray="${dash}" stroke-dashoffset="${firstLap}"/>`;

  return { model, colors: c, svg: `
    <svg width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}">
      ${bloom}
      <g transform="rotate(-90 ${center} ${center})">
        <circle ${ring} stroke="${model.isOver ? c.overBase : theme.color.arc.track}" stroke-width="${stroke}"/>
        ${model.isOver ? over : under}
      </g>
    </svg>` };
}

function card(state, theme, id) {
  const { model, colors, svg } = ringSvg(state, theme, id);
  const { diameter } = size.arc;
  return `
  <figure class="card">
    <figcaption class="title">${state.title}</figcaption>
    <div class="ring" style="width:${diameter}px;height:${diameter}px">
      ${svg}
      <div class="readout">
        <span style="${font(typeTokens.microSm)}color:${theme.color.arc.labelText}">${model.label}</span>
        <span style="${font(typeTokens.displayXl)}color:${theme.color.arc.valueText}">${model.valueText}</span>
        ${model.targetText ? `<span style="${font(typeTokens.ringCaption)}color:${theme.color.arc.captionText}">${model.targetText}</span>` : ''}
      </div>
    </div>
    <span style="${font(typeTokens.label)}color:${colors.caption}">${model.caption}</span>
  </figure>`;
}

function page(theme) {
  const cards = STATES.map((s, i) => card(s, theme, `${theme.name}${i}`)).join('');
  return `<!doctype html><meta charset="utf-8"><title>ProgressArc — ${theme.name}</title>
  <style>
    :root { color-scheme: ${theme.name}; }
    body { margin:0; padding:28px; background:${theme.color.bg.canvas};
           font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
    h1 { font-size:15px; font-weight:600; margin:0 0 20px; color:${theme.color.text.secondary}; letter-spacing:.02em; }
    .grid { display:grid; grid-template-columns: repeat(3, 200px); gap:22px 18px; }
    .card { margin:0; display:flex; flex-direction:column; align-items:center; gap:8px;
            background:${theme.color.bg.surface}; border-radius:18px; padding:18px 10px 16px; }
    .title { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${theme.color.text.tertiary}; }
    .ring { position:relative; }
    .readout { position:absolute; inset:0; display:flex; flex-direction:column;
               align-items:center; justify-content:center; gap:6px; }
  </style>
  <h1>&lt;ProgressArc&gt; — ${theme.name} — real arcModel(), real tokens, real feGaussianBlur bloom</h1>
  <div class="grid">${cards}</div>`;
}

mkdirSync(HERE, { recursive: true });
// Only the PNGs are committed — the page itself is scaffolding, so it goes to a temp dir.
const stage = mkdtempSync(join(tmpdir(), 'vitals-arc-evidence-'));
for (const name of ['dark', 'light']) {
  const html = join(stage, `progress-arc-${name}.html`);
  writeFileSync(html, page(themes[name]));
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=720,560',
    `--screenshot=${join(HERE, `progress-arc-${name}.png`)}`,
    `file://${html}`,
  ]);
  console.log(`wrote progress-arc-${name}.png`);
}
