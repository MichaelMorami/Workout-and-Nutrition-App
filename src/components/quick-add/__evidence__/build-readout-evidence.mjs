/**
 * Visual evidence for issue #94 — the Exact-mode readout's tap-to-type state, both themes.
 *
 * WHY THIS EXISTS. There is no simulator in this environment. This draws the same Exact-control
 * markup `PortionSheet.tsx` itself draws — the readout, the kcal/protein figures, the slider row and
 * the Log button — using the same `tokens.ts` values, so the picture is evidence about the
 * component, not a second implementation of it. Same discipline as this folder's own
 * `build-evidence.mjs` (issue #90).
 *
 * Two cards per theme: the readout at rest ("170 g", tappable) and mid-edit (the decimal-pad input,
 * selected, with the #87/#94-shared focus border) — proof the typed path uses the same visual
 * language as `<Stepper>`'s own value well, not a bespoke text field.
 *
 * Run: node src/components/quick-add/__evidence__/build-readout-evidence.mjs
 * (Node >= 23.6 — imports the .ts sources directly via native type stripping.)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { radius, size, space, themes, type as typeTokens } from '../../../theme/tokens.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const font = (t) =>
  `font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:${t.fontSize}px;` +
  `line-height:${t.lineHeight}px;letter-spacing:${t.letterSpacing}px;` +
  (t.textTransform ? `text-transform:${t.textTransform};` : '');

function figuresRow(theme, kcal, protein) {
  const { portionSheet } = theme.color;
  return `
  <div class="figures-row">
    <span style="${font(typeTokens.numericLg)}color:${portionSheet.kcalText}">${kcal} kcal</span>
    <span style="${font(typeTokens.numericLg)}color:${portionSheet.proteinText}">${protein} protein</span>
  </div>`;
}

function logButton(theme, label) {
  const { portionSheet } = theme.color;
  return `
  <div class="log-button" style="background:${portionSheet.logButtonBg};border-radius:${radius.md}px;min-height:${size.portionSheet.logButtonHit}px">
    <span style="${font(typeTokens.button)}color:${portionSheet.logButtonText}">${label}</span>
  </div>`;
}

function restingCard(theme) {
  const { portionSheet } = theme.color;
  return `
  <figure class="card">
    <figcaption class="title">Readout at rest — tap to type (issue #94)</figcaption>
    <span class="readout" style="${font(typeTokens.portionReadout)}color:${portionSheet.readoutText}">170 g</span>
    ${figuresRow(theme, '120', '20 g')}
    ${logButton(theme, 'Log 170 g')}
  </figure>`;
}

function editingCard(theme) {
  const { portionSheet, foodForm } = theme.color;
  return `
  <figure class="card">
    <figcaption class="title">Mid-edit — decimal-pad, value selected, #87's shared focus border</figcaption>
    <span class="readout editing" style="${font(typeTokens.portionReadout)}color:${portionSheet.readoutText};
      border-bottom:${size.foodForm.fieldBorderWidthFocus}px solid ${foodForm.fieldBorderFocus}">650</span>
    ${figuresRow(theme, '459', '76.5 g')}
    ${logButton(theme, 'Log 650 g')}
  </figure>`;
}

function page(theme) {
  const cards = [restingCard(theme), editingCard(theme)].join('');
  return `<!doctype html><meta charset="utf-8"><title>Portion sheet — Exact readout tap-to-type — ${theme.name}</title>
  <style>
    :root { color-scheme: ${theme.name}; }
    body { margin:0; padding:${space[7]}px; background:${theme.color.bg.canvas};
           font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; }
    h1 { font-size:15px; font-weight:600; margin:0 0 20px; color:${theme.color.text.secondary}; letter-spacing:.02em; }
    .grid { display:flex; flex-wrap:wrap; gap:22px 18px; align-items:flex-start; }
    .card { margin:0; display:flex; flex-direction:column; align-items:flex-start; gap:${space[3]}px;
            width:260px; background:${theme.color.portionSheet.bg}; padding:${space[4]}px; border-radius:${radius.lg}px; }
    .title { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${theme.color.text.tertiary}; max-width:260px; }
    .readout { display:inline-block; }
    .readout.editing { padding-bottom:2px; }
    .figures-row { display:flex; gap:${space[4]}px; }
    .log-button { width:100%; box-sizing:border-box; display:flex; align-items:center; justify-content:center; }
  </style>
  <h1>Portion sheet — Exact readout tap-to-type (issue #94) — ${theme.name} — real tokens</h1>
  <div class="grid">${cards}</div>`;
}

mkdirSync(HERE, { recursive: true });
const stage = mkdtempSync(join(tmpdir(), 'vitals-portion-readout-evidence-'));
for (const name of ['dark', 'light']) {
  const html = join(stage, `portion-readout-${name}.html`);
  writeFileSync(html, page(themes[name]));
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=620,320',
    `--screenshot=${join(HERE, `portion-readout-${name}.png`)}`,
    `file://${html}`,
  ]);
  console.log(`wrote portion-readout-${name}.png`);
}
