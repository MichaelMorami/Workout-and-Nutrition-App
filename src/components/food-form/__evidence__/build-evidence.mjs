/**
 * Visual evidence for `<Stepper>` (issue #87) — both themes, one PNG each.
 *
 * WHY THIS EXISTS. There is no simulator in this environment. This draws the same markup the real
 * component draws — the same `tokens.ts` values `Stepper.tsx` itself uses — so the picture is
 * evidence about the component, not a second implementation of it. Same discipline as
 * `src/components/settings/__evidence__/build-evidence.mjs`.
 *
 * Three states, per theme: resting (unchanged from before this issue), tap-to-type open (the value
 * well swaps to a `decimal-pad` field, bordered in `line.strong` — see the TOKEN GAP note in
 * `Stepper.tsx`), and mid-hold (the − / + glyph highlighted, standing in for the auto-repeat/
 * accelerate a screenshot cannot otherwise show motion for).
 *
 * Run: node src/components/food-form/__evidence__/build-evidence.mjs
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
const LOCALE = 'en-GB';

const font = (t) =>
  `font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:${t.fontSize}px;` +
  `line-height:${t.lineHeight}px;letter-spacing:${t.letterSpacing}px;` +
  (t.textTransform ? `text-transform:${t.textTransform};` : '');

function stepBtn(theme, glyph, emphasised) {
  const { stepper: s } = theme.color;
  const bg = emphasised ? s.buttonBgPress : s.buttonBg;
  return `
  <div class="stepBtn" style="width:${size.stepper.buttonWidth}px;min-height:${size.stepper.buttonHit}px;border-radius:${radius.md}px;background:${bg}">
    <span style="${font(typeTokens.numericLg)}color:${s.buttonIcon}">${glyph}</span>
  </div>`;
}

/** The resting value well — unit shown, no border. Matches `Stepper.tsx`'s `!editing` branch. */
function restingWell(theme, label, value, unit) {
  const { stepper: s, text } = theme.color;
  const display = Math.round(value).toLocaleString(LOCALE);
  return `
  <div class="stepper">
    <span style="${font(typeTokens.label)}color:${text.secondary}">${label}</span>
    <div class="stepperRow">
      ${stepBtn(theme, '&minus;', false)}
      <div class="valueWell" style="min-height:${size.stepper.buttonHit}px;border-radius:${radius.md}px;background:${s.valueBg};border:0">
        <span style="${font(typeTokens.stepperValue)}color:${s.valueText}">${display}</span>
        ${unit ? `<span style="${font(typeTokens.unit)}color:${s.unitText}">${unit}</span>` : ''}
      </div>
      ${stepBtn(theme, '+', false)}
    </div>
  </div>`;
}

/** The editing value well — issue #87's tap-to-type field, `line.strong` border (see `Stepper.tsx`'s
 * TOKEN GAP note: there is no dedicated "editable" token yet, so this reuses the existing generic
 * emphasis colour). No unit while typing, decimal-pad caret shown as plain text. */
function editingWell(theme, label, draft) {
  const { stepper: s, line, text } = theme.color;
  return `
  <div class="stepper">
    <span style="${font(typeTokens.label)}color:${text.secondary}">${label}</span>
    <div class="stepperRow">
      ${stepBtn(theme, '&minus;', false)}
      <div class="valueWell" style="min-height:${size.stepper.buttonHit}px;border-radius:${radius.md}px;background:${s.valueBg};border:1px solid ${line.strong}">
        <span style="${font(typeTokens.stepperValue)}color:${s.valueText}">${draft}<span class="caret" style="background:${s.valueText}"></span></span>
      </div>
      ${stepBtn(theme, '+', false)}
    </div>
  </div>`;
}

/** A held + mid-repeat — the button itself takes its pressed colour, standing in for a screenshot's
 * inability to show the auto-repeat/accelerate motion `Stepper.test.tsx`'s fake-timer tests cover. */
function holdingWell(theme, label, value, unit) {
  const { stepper: s, text } = theme.color;
  const display = Math.round(value).toLocaleString(LOCALE);
  return `
  <div class="stepper">
    <span style="${font(typeTokens.label)}color:${text.secondary}">${label}</span>
    <div class="stepperRow">
      ${stepBtn(theme, '&minus;', false)}
      <div class="valueWell" style="min-height:${size.stepper.buttonHit}px;border-radius:${radius.md}px;background:${s.valueBg};border:0">
        <span style="${font(typeTokens.stepperValue)}color:${s.valueText}">${display}</span>
        ${unit ? `<span style="${font(typeTokens.unit)}color:${s.unitText}">${unit}</span>` : ''}
      </div>
      ${stepBtn(theme, '+', true)}
    </div>
  </div>`;
}

function card(theme, title, body, width = 300) {
  return `
  <figure class="card" style="width:${width}px">
    <figcaption class="title">${title}</figcaption>
    <div class="surface" style="background:${theme.color.bg.canvas}">${body}</div>
  </figure>`;
}

function page(theme) {
  const resting = card(theme, 'Resting — tap the value or hold +/-', restingWell(theme, 'Kcal per 100 g', 120, 'kcal'));
  const editing = card(theme, 'Tap-to-type open — decimal-pad, current value selected (issue #87)', editingWell(theme, 'Kcal per 100 g', '612'));
  const holding = card(theme, 'Holding + — auto-repeats, then accelerates after ~1 s', holdingWell(theme, 'Kcal per 100 g', 845, 'kcal'));

  return `<!doctype html><meta charset="utf-8"><title>Stepper — ${theme.name}</title>
  <style>
    :root { color-scheme: ${theme.name}; }
    body { margin:0; padding:${space[7]}px; background:${theme.color.bg.canvas};
           font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; }
    h1 { font-size:15px; font-weight:600; margin:0 0 20px; color:${theme.color.text.secondary}; letter-spacing:.02em; }
    .grid { display:flex; flex-wrap:wrap; gap:22px 18px; align-items:flex-start; }
    .card { margin:0; display:flex; flex-direction:column; align-items:flex-start; gap:${space[3]}px; }
    .title { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${theme.color.text.tertiary}; max-width:300px; }
    .surface { width:100%; box-sizing:border-box; border-radius:18px; overflow:hidden; padding:${space[5]}px; display:flex; flex-direction:column; gap:${space[4]}px; }
    .stepper { display:flex; flex-direction:column; gap:${space[2]}px; }
    .stepperRow { display:flex; align-items:center; gap:${space[3]}px; }
    .stepBtn { display:flex; align-items:center; justify-content:center; box-sizing:border-box; }
    .valueWell { flex:1; display:flex; align-items:baseline; justify-content:center; gap:${space[1]}px; box-sizing:border-box; }
    .caret { display:inline-block; width:1px; height:1em; margin-left:2px; vertical-align:-0.15em; animation: blink 1s step-end infinite; }
    @keyframes blink { 50% { opacity: 0; } }
  </style>
  <h1>Stepper — tap the value to type it exactly; hold +/- to accelerate — ${theme.name} — real tokens</h1>
  <div class="grid">${resting}${editing}${holding}</div>`;
}

mkdirSync(HERE, { recursive: true });
const stage = mkdtempSync(join(tmpdir(), 'vitals-stepper-evidence-'));
for (const name of ['dark', 'light']) {
  const html = join(stage, `stepper-${name}.html`);
  writeFileSync(html, page(themes[name]));
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=1100,420',
    `--screenshot=${join(HERE, `stepper-${name}.png`)}`,
    `file://${html}`,
  ]);
  console.log(`wrote stepper-${name}.png`);
}
