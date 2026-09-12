/**
 * Visual evidence for the Today date header, rings and weight chip (issue #41) — both themes, one
 * PNG each.
 *
 * WHY THIS EXISTS. There is no simulator in this environment. This draws the same markup the real
 * components draw — the same `formatTodayDate`, `arcModel()`, `formatWeightKg` and `tokens.ts` — so
 * the picture is evidence about these components, not a second implementation of them. Same
 * discipline as `src/components/charts/__evidence__/build-evidence.mjs` (the arcs on their own),
 * which this reuses for ring geometry rather than duplicating it a third time.
 *
 * Run: node src/components/today/__evidence__/build-evidence.mjs
 * (Node >= 23.6 — imports the .ts sources directly via native type stripping.)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arcModel } from '../../charts/arc-math.ts';
import { formatWeightKg } from '../../format/weight.ts';
import { radius, size, space, themes, type as typeTokens } from '../../../theme/tokens.ts';
import { formatTodayDate } from '../date-header.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LOCALE = 'en-GB';
const AT = Date.UTC(2025, 8, 10, 16, 12);
const TIME_ZONE = 'UTC';

const font = (t) =>
  `font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:${t.fontSize}px;` +
  `line-height:${t.lineHeight}px;letter-spacing:${t.letterSpacing}px;` +
  (t.textTransform ? `text-transform:${t.textTransform};` : '');

const colorsFor = (theme, metric) =>
  metric === 'kcal'
    ? { lap: theme.color.arc.kcal, overBase: theme.color.arc.kcalOverBase, caption: theme.color.arc.kcalText }
    : { lap: theme.color.arc.protein, overBase: theme.color.arc.proteinOverBase, caption: theme.color.arc.proteinText };

/** Same layer order as `ProgressArc.tsx` / the charts evidence script. */
function ring(state, theme, id) {
  const { diameter, stroke } = size.arc;
  const model = arcModel({ ...state, diameter, stroke, locale: LOCALE, tickLength: size.arc.targetTickLength });
  const { center, radius: r, circumference } = model.geometry;
  const c = colorsFor(theme, state.metric);
  const dash = `${circumference} ${circumference}`;
  const firstLap = circumference * (1 - Math.min(1, Math.max(0, model.ratio)));
  const overLap = circumference * (1 - Math.min(1, Math.max(0, model.ratio - 1)));
  const active = model.isOver ? overLap : firstLap;
  const attrs = `cx="${center}" cy="${center}" r="${r}" fill="none"`;
  const glowId = `arc-glow-${id}`;

  const bloom =
    theme.glow.ringOpacity > 0
      ? `<defs><filter id="${glowId}" x="0" y="0" width="${diameter}" height="${diameter}" filterUnits="userSpaceOnUse">
           <feGaussianBlur in="SourceGraphic" stdDeviation="${theme.glow.ringRadius / 2}"/>
         </filter></defs>
         <circle ${attrs} stroke="${c.lap}" stroke-width="${stroke}" stroke-linecap="round"
                 stroke-dasharray="${dash}" stroke-dashoffset="${active}"
                 opacity="${theme.glow.ringOpacity}" filter="url(#${glowId})"/>`
      : '';

  const over = `
    <circle ${attrs} stroke="${theme.color.arc.overKnockout}" stroke-width="${stroke + 2 * size.arc.overKnockout}"
            stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="${overLap}"/>
    <circle ${attrs} stroke="${c.lap}" stroke-width="${stroke}" stroke-linecap="round"
            stroke-dasharray="${dash}" stroke-dashoffset="${overLap}"/>
    <line x1="${model.tick.x1}" y1="${model.tick.y1}" x2="${model.tick.x2}" y2="${model.tick.y2}"
          stroke="${theme.color.arc.targetTickIcon}" stroke-width="${size.arc.targetTickWidth}" stroke-linecap="round"/>`;

  const under = `<circle ${attrs} stroke="${c.lap}" stroke-width="${stroke}" stroke-linecap="round"
                         stroke-dasharray="${dash}" stroke-dashoffset="${firstLap}"/>`;

  const svg = `
    <svg width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}">
      ${bloom}
      <g transform="rotate(-90 ${center} ${center})">
        <circle ${attrs} stroke="${model.isOver ? c.overBase : theme.color.arc.track}" stroke-width="${stroke}"/>
        ${model.isOver ? over : under}
      </g>
    </svg>`;

  return `
    <div class="ring" style="width:${diameter}px;height:${diameter}px">
      ${svg}
      <div class="readout">
        <span style="${font(typeTokens.microSm)}color:${theme.color.arc.labelText}">${model.label}</span>
        <span style="${font(typeTokens.displayXl)}color:${theme.color.arc.valueText}">${model.valueText}</span>
        ${model.targetText ? `<span style="${font(typeTokens.ringCaption)}color:${theme.color.arc.captionText}">${model.targetText}</span>` : ''}
      </div>
      <div class="caption" style="${font(typeTokens.label)}color:${c.caption}">${model.caption}</div>
    </div>`;
}

/** The date header + rings card, in its two states: a real target, and `isDefault` (honest empty
 * rings plus the one-tap "Set" affordance). */
function headerCard(theme, isDefault) {
  const dateLabel = formatTodayDate(AT, TIME_ZONE, LOCALE);
  const kcalTarget = isDefault ? 0 : 2400;
  const proteinTarget = isDefault ? 0 : 180;
  const setPill = isDefault
    ? `<span class="set" style="${font(typeTokens.label)}color:${theme.color.data.kcal}">Set</span>`
    : '';

  return `
  <figure class="card wide">
    <figcaption class="title">${isDefault ? 'Day one — isDefault' : 'A day in progress'}</figcaption>
    <div class="header-row">
      <span style="${font(typeTokens.title)}color:${theme.color.text.primary}">${dateLabel}</span>
      ${setPill}
    </div>
    <div class="rings-card" style="background:${theme.color.card.bg};border:1px solid ${theme.color.card.border}">
      <div class="rings-row">
        ${ring({ metric: 'kcal', value: isDefault ? 0 : 1240, target: kcalTarget }, theme, `${theme.name}-k-${isDefault}`)}
        <div class="divider" style="background:${theme.color.line.hairline}"></div>
        ${ring({ metric: 'protein', value: isDefault ? 0 : 96, target: proteinTarget }, theme, `${theme.name}-p-${isDefault}`)}
      </div>
    </div>
  </figure>`;
}

const SCALE_GLYPH = '⚖';

function weightChip(theme, title, { value, delta, deltaGood }) {
  const c = theme.color.chip;
  const deltaColor = c.weightAccentText;
  return `
  <figure class="card">
    <figcaption class="title">${title}</figcaption>
    <div class="chip" style="height:${size.chip.height}px;border-radius:${radius.lg}px;background:${c.bg}">
      <span style="font-size:${size.icon.md}px;color:${c.weightAccentText}">${SCALE_GLYPH}</span>
      <span class="chip-body">
        <span style="${font(typeTokens.microSm)}color:${c.labelText}">WEIGHT</span>
        <span class="chip-value">
          <span style="${font(typeTokens.numericMd)}color:${c.valueText}">${value}</span>
          ${delta ? `<span style="${font(typeTokens.caption)}color:${deltaColor}${deltaGood ? '' : ''}">${delta}</span>` : ''}
        </span>
      </span>
    </div>
  </figure>`;
}

function page(theme) {
  const header = `
    ${headerCard(theme, false)}
    ${headerCard(theme, true)}`;
  const chips = `
    ${weightChip(theme, 'No weigh-ins — honest empty state', { value: 'No weigh-ins', delta: null })}
    ${weightChip(theme, 'One weigh-in — no delta', { value: formatWeightKg(83.4), delta: null })}
    ${weightChip(theme, 'Weekly loss', { value: formatWeightKg(83.4), delta: `↓ ${formatWeightKg(0.4)}` })}
    ${weightChip(theme, 'Weekly gain', { value: formatWeightKg(84.1), delta: `↑ ${formatWeightKg(0.5)}` })}`;

  return `<!doctype html><meta charset="utf-8"><title>Today header + weight chip — ${theme.name}</title>
  <style>
    :root { color-scheme: ${theme.name}; }
    body { margin:0; padding:${space[7]}px; background:${theme.color.bg.canvas};
           font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; }
    h1 { font-size:15px; font-weight:600; margin:0 0 20px; color:${theme.color.text.secondary}; letter-spacing:.02em; }
    .grid { display:flex; flex-wrap:wrap; gap:22px 18px; align-items:flex-start; }
    .card { margin:0; display:flex; flex-direction:column; align-items:flex-start; gap:${space[3]}px;
            background:${theme.color.bg.surface}; border-radius:18px; padding:18px; }
    .card.wide { width:360px; }
    .title { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${theme.color.text.tertiary}; }
    .header-row { display:flex; align-items:center; justify-content:space-between; width:100%; }
    .set { min-height:44px; display:flex; align-items:center; }
    .rings-card { width:100%; border-radius:24px; padding:20px; box-sizing:border-box; }
    .rings-row { display:flex; align-items:center; justify-content:space-around; }
    .ring { position:relative; display:flex; flex-direction:column; align-items:center; gap:8px; }
    .readout { position:absolute; top:0; left:0; right:0; height:118px; display:flex; flex-direction:column;
               align-items:center; justify-content:center; gap:6px; }
    .divider { width:1px; height:118px; }
    .chip { width:280px; box-sizing:border-box; display:flex; align-items:center; gap:${space[4]}px; padding:0 ${space[5]}px; }
    .chip-body { display:flex; flex-direction:column; gap:${space[1]}px; }
    .chip-value { display:flex; align-items:baseline; gap:${space[2]}px; }
  </style>
  <h1>Today header + weight chip — ${theme.name} — real arcModel(), formatTodayDate(), formatWeightKg(), real tokens</h1>
  <div class="grid">${header}${chips}</div>`;
}

mkdirSync(HERE, { recursive: true });
const stage = mkdtempSync(join(tmpdir(), 'vitals-today-evidence-'));
for (const name of ['dark', 'light']) {
  const html = join(stage, `today-${name}.html`);
  writeFileSync(html, page(themes[name]));
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=900,840',
    `--screenshot=${join(HERE, `today-${name}.png`)}`,
    `file://${html}`,
  ]);
  console.log(`wrote today-${name}.png`);
}
