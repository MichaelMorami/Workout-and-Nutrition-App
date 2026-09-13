/**
 * Visual evidence for `<TargetsGroup>` (issue #44) — both themes, one PNG each.
 *
 * WHY THIS EXISTS. There is no simulator in this environment. This draws the same markup the real
 * component draws — the same `tokens.ts` values `TargetsGroup.tsx`/`Stepper.tsx` themselves use —
 * so the picture is evidence about the component, not a second implementation of it. Same
 * discipline as `src/components/food-list/__evidence__/build-evidence.mjs`.
 *
 * Three states, per theme: day one (`isDefault: true`, both rows read "Set"), the rows once targets
 * are set, and the shared sheet open with its two steppers mid-edit.
 *
 * Run: node src/components/settings/__evidence__/build-evidence.mjs
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

function targetRow(theme, label, valueText, valueColor) {
  const { settings } = theme.color;
  return `
  <div class="row" style="min-height:${size.row.settingsHit}px;background:${settings.groupBg}">
    <span class="rowLabel" style="${font(typeTokens.body)}color:${settings.labelText}">${label}</span>
    <span style="${font(typeTokens.numericRow)}color:${valueColor}">${valueText}</span>
    <span style="${font(typeTokens.body)}color:${settings.chevronIcon}">&rsaquo;</span>
  </div>`;
}

function targetsGroup(theme, kcalText, proteinText) {
  const { settings, data, line } = theme.color;
  return `<div class="group">
    <span style="${font(typeTokens.micro)}color:${settings.groupTitleText}">Targets</span>
    <div class="targetsCard" style="border-radius:${radius.lg}px;background:${settings.groupBg}">
      ${targetRow(theme, 'Daily calories', kcalText, data.kcal)}
      <div class="divider" style="background:${line.hairline}"></div>
      ${targetRow(theme, 'Daily protein', proteinText, data.protein)}
    </div>
    <span style="${font(typeTokens.label)}color:${settings.noteText}">Carbs and fat are deliberately not tracked. Two numbers you will actually hit beat four you will not.</span>
  </div>`;
}

function stepper(theme, label, value, unit) {
  const { stepper: s, text } = theme.color;
  const display = Math.round(value).toLocaleString(LOCALE);
  return `
  <div class="stepper">
    <span style="${font(typeTokens.label)}color:${text.secondary}">${label}</span>
    <div class="stepperRow">
      <div class="stepBtn" style="width:${size.stepper.buttonWidth}px;min-height:${size.stepper.buttonHit}px;border-radius:${radius.md}px;background:${s.buttonBg}">
        <span style="${font(typeTokens.numericLg)}color:${s.buttonIcon}">&minus;</span>
      </div>
      <div class="valueWell" style="min-height:${size.stepper.buttonHit}px;border-radius:${radius.md}px;background:${s.valueBg}">
        <span style="${font(typeTokens.stepperValue)}color:${s.valueText}">${display}</span>
        ${unit ? `<span style="${font(typeTokens.unit)}color:${s.unitText}">${unit}</span>` : ''}
      </div>
      <div class="stepBtn" style="width:${size.stepper.buttonWidth}px;min-height:${size.stepper.buttonHit}px;border-radius:${radius.md}px;background:${s.buttonBg}">
        <span style="${font(typeTokens.numericLg)}color:${s.buttonIcon}">+</span>
      </div>
    </div>
  </div>`;
}

function targetsSheet(theme, kcalTarget, proteinTarget) {
  const { bg, line, text, button } = theme.color;
  return `
  <div class="sheetWrap">
    <div class="scrim" style="background:${bg.scrim}"></div>
    <div class="sheet" style="background:${bg.surface};border-radius:${radius.xl}px">
      <div class="grabber" style="background:${line.strong};border-radius:999px"></div>
      <span style="${font(typeTokens.title)}color:${text.primary}">Targets</span>
      ${stepper(theme, 'Daily calories', kcalTarget, 'kcal')}
      ${stepper(theme, 'Daily protein', proteinTarget, 'g')}
      <div class="done" style="min-height:${size.button.primaryHit}px;border-radius:${radius.md}px;background:${button.kcalBg}">
        <span style="${font(typeTokens.button)}color:${button.kcalText}">Done</span>
      </div>
    </div>
  </div>`;
}

function card(theme, title, body, width = 360) {
  return `
  <figure class="card" style="width:${width}px">
    <figcaption class="title">${title}</figcaption>
    <div class="surface" style="background:${theme.color.bg.canvas}">${body}</div>
  </figure>`;
}

function page(theme) {
  const dayOne = card(theme, 'Day one — isDefault, both rows read "Set"', targetsGroup(theme, 'Set', 'Set'));
  const populated = card(theme, 'Targets set', targetsGroup(theme, '2,400 kcal', '180 g'));
  const sheet = card(theme, 'Shared sheet — a stepper per target, no keyboard, no save button', targetsSheet(theme, 2400, 180), 340);

  return `<!doctype html><meta charset="utf-8"><title>Targets — ${theme.name}</title>
  <style>
    :root { color-scheme: ${theme.name}; }
    body { margin:0; padding:${space[7]}px; background:${theme.color.bg.canvas};
           font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; }
    h1 { font-size:15px; font-weight:600; margin:0 0 20px; color:${theme.color.text.secondary}; letter-spacing:.02em; }
    .grid { display:flex; flex-wrap:wrap; gap:22px 18px; align-items:flex-start; }
    .card { margin:0; display:flex; flex-direction:column; align-items:flex-start; gap:${space[3]}px; }
    .title { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${theme.color.text.tertiary}; max-width:340px; }
    .surface { width:100%; box-sizing:border-box; border-radius:18px; overflow:hidden; padding:${space[5]}px; display:flex; flex-direction:column; gap:${space[4]}px; }
    .group { display:flex; flex-direction:column; gap:${space[2]}px; }
    .targetsCard { overflow:hidden; }
    .row { display:flex; align-items:center; gap:${space[3]}px; padding:0 ${space[6]}px; box-sizing:border-box; }
    .rowLabel { flex:1; }
    .divider { height:1px; }
    .stepper { display:flex; flex-direction:column; gap:${space[2]}px; }
    .stepperRow { display:flex; align-items:center; gap:${space[3]}px; }
    .stepBtn { display:flex; align-items:center; justify-content:center; box-sizing:border-box; }
    .valueWell { flex:1; display:flex; align-items:baseline; justify-content:center; gap:${space[1]}px; box-sizing:border-box; }
    .sheetWrap { display:flex; flex-direction:column; width:100%; }
    .scrim { height:40px; border-radius:12px 12px 0 0; }
    .sheet { padding:${space[7]}px; padding-bottom:${space[9]}px; display:flex; flex-direction:column; gap:${space[6]}px; box-sizing:border-box; }
    .grabber { align-self:center; width:36px; height:5px; }
    .done { display:flex; align-items:center; justify-content:center; box-sizing:border-box; }
  </style>
  <h1>Settings — Targets group &amp; sheet — ${theme.name} — real tokens</h1>
  <div class="grid">${dayOne}${populated}${sheet}</div>`;
}

mkdirSync(HERE, { recursive: true });
const stage = mkdtempSync(join(tmpdir(), 'vitals-targets-evidence-'));
for (const name of ['dark', 'light']) {
  const html = join(stage, `targets-${name}.html`);
  writeFileSync(html, page(themes[name]));
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=1200,760',
    `--screenshot=${join(HERE, `targets-${name}.png`)}`,
    `file://${html}`,
  ]);
  console.log(`wrote targets-${name}.png`);
}
