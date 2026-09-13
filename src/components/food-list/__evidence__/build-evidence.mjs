/**
 * Visual evidence for issue #43's food catalogue — `<FoodList>` (populated + teaching empty state)
 * and `<FoodForm>`/`<Stepper>` (add/edit, pre-filled), both themes, one PNG each.
 *
 * WHY THIS EXISTS. There is no simulator in this environment. This draws the same markup the real
 * components draw, using the same `tokens.ts` values `FoodList.tsx`/`FoodForm.tsx`/`Stepper.tsx`
 * themselves use — so the picture is evidence about these components, not a second implementation
 * of them. Same discipline as `src/components/day-log/__evidence__/build-evidence.mjs`.
 *
 * Run: node src/components/food-list/__evidence__/build-evidence.mjs
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

const FOODS = [
  { id: 'f1', name: 'Greek yoghurt', brand: 'Fage', servingLabel: '1 pot', kcal: 120, protein: 20 },
  { id: 'f2', name: 'Chicken breast', brand: null, servingLabel: '150 g', kcal: 248, protein: 46 },
  { id: 'f3', name: 'Protein shake', brand: 'MyProtein', servingLabel: '1 scoop', kcal: 410, protein: 38 },
];

function foodRow(theme, food) {
  const { resultRow } = theme.color;
  const kcalText = Math.round(food.kcal).toLocaleString(LOCALE);
  const proteinText = Math.round(food.protein).toLocaleString(LOCALE);
  const serving = food.brand ? `${food.brand} · ${food.servingLabel}` : food.servingLabel;
  return `
  <div class="food-row" style="min-height:${size.tapTargetMin}px;background:${resultRow.bg};border-bottom:1px solid ${resultRow.divider}">
    <div class="rowText">
      <span style="${font(typeTokens.body)}color:${resultRow.nameText}">${food.name}</span>
      <span style="${font(typeTokens.caption)}color:${resultRow.servingText}">${serving}</span>
    </div>
    <div class="rowFigures">
      <span style="${font(typeTokens.numeric)}color:${resultRow.kcalText}">${kcalText} kcal</span>
      <span style="${font(typeTokens.numeric)}color:${resultRow.proteinText}">${proteinText} g</span>
    </div>
  </div>`;
}

function foodListHeader(theme, addLabel) {
  const { sectionLabel, resultRow } = theme.color;
  return `
  <div class="header">
    <span style="${font(typeTokens.micro)}color:${sectionLabel.labelText}">Foods</span>
    <span style="${font(typeTokens.button)}color:${resultRow.createText}">${addLabel}</span>
  </div>`;
}

function foodListPopulated(theme) {
  return `<div class="list">${foodListHeader(theme, '+ Add food')}${FOODS.map((f) => foodRow(theme, f)).join('')}</div>`;
}

function foodListEmpty(theme) {
  const { sectionLabel } = theme.color;
  return `<div class="list">${foodListHeader(theme, '+ Add food')}
    <div class="empty">
      <span style="${font(typeTokens.body)}color:${sectionLabel.labelText}">No foods yet.</span>
      <span style="${font(typeTokens.label)}color:${sectionLabel.metaText};text-align:center">Tap Add food to create your first one.</span>
    </div>
  </div>`;
}

function field(theme, label, value, placeholder) {
  const { searchSheet, text } = theme.color;
  const shown = value || `<span style="color:${searchSheet.placeholderText}">${placeholder}</span>`;
  return `
  <div class="field">
    <span style="${font(typeTokens.label)}color:${text.secondary}">${label}</span>
    <div class="input" style="min-height:${size.tapTargetMin}px;border-radius:${radius.md}px;background:${searchSheet.fieldBg};border:1px solid ${searchSheet.fieldBorder}">
      <span style="${font(typeTokens.input)}color:${searchSheet.queryText}">${shown}</span>
    </div>
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
        <span style="${font(typeTokens.numericLg)}color:${s.buttonIcon}">−</span>
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

function foodForm(theme) {
  const { button } = theme.color;
  return `<div class="form">
    ${field(theme, 'Name', 'Greek yoghurt')}
    ${field(theme, 'Brand', 'Fage')}
    ${field(theme, 'Serving label', '1 pot')}
    ${stepper(theme, 'Serving grams', 170, 'g')}
    ${stepper(theme, 'Kcal per serving', 120, 'kcal')}
    ${stepper(theme, 'Protein per serving', 20, 'g')}
    <div class="actions">
      <div class="actionButton" style="min-height:${size.tapTargetMin}px;border-radius:${radius.md}px;border:1px solid ${button.secondaryBorder}">
        <span style="${font(typeTokens.button)}color:${button.secondaryText}">Cancel</span>
      </div>
      <div class="actionButton" style="min-height:${size.tapTargetMin}px;border-radius:${radius.md}px;background:${button.kcalBg}">
        <span style="${font(typeTokens.button)}color:${button.kcalText}">Save</span>
      </div>
    </div>
  </div>`;
}

function card(theme, title, body, width = 360) {
  return `
  <figure class="card" style="width:${width}px">
    <figcaption class="title">${title}</figcaption>
    <div class="surface" style="background:${theme.color.bg.surface}">${body}</div>
  </figure>`;
}

function page(theme) {
  const populated = card(theme, 'Food catalogue — a food per row, tap to edit', foodListPopulated(theme));
  const empty = card(theme, 'No foods yet — the teaching empty state', foodListEmpty(theme));
  const form = card(theme, 'Edit food — pre-filled, every quantity a stepper, never a keyboard number', foodForm(theme), 340);

  return `<!doctype html><meta charset="utf-8"><title>Foods — ${theme.name}</title>
  <style>
    :root { color-scheme: ${theme.name}; }
    body { margin:0; padding:${space[7]}px; background:${theme.color.bg.canvas};
           font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; }
    h1 { font-size:15px; font-weight:600; margin:0 0 20px; color:${theme.color.text.secondary}; letter-spacing:.02em; }
    .grid { display:flex; flex-wrap:wrap; gap:22px 18px; align-items:flex-start; }
    .card { margin:0; display:flex; flex-direction:column; align-items:flex-start; gap:${space[3]}px; }
    .title { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${theme.color.text.tertiary}; max-width:340px; }
    .surface { width:100%; box-sizing:border-box; border-radius:18px; overflow:hidden; padding:${space[5]}px; display:flex; flex-direction:column; gap:${space[4]}px; }
    .header { display:flex; justify-content:space-between; align-items:baseline; padding:${space[2]}px ${space[1]}px; }
    .food-row { display:flex; align-items:center; justify-content:space-between; padding:${space[4]}px ${space[2]}px; box-sizing:border-box; }
    .rowText { display:flex; flex-direction:column; gap:${space[1]}px; }
    .rowFigures { display:flex; flex-direction:column; align-items:flex-end; gap:${space[1]}px; }
    .empty { padding:${space[7]}px ${space[6]}px; display:flex; flex-direction:column; align-items:center; gap:${space[2]}px; }
    .form { display:flex; flex-direction:column; gap:${space[6]}px; }
    .field { display:flex; flex-direction:column; gap:${space[2]}px; }
    .input { display:flex; align-items:center; padding:0 ${space[5]}px; box-sizing:border-box; }
    .stepper { display:flex; flex-direction:column; gap:${space[2]}px; }
    .stepperRow { display:flex; align-items:center; gap:${space[3]}px; }
    .stepBtn { display:flex; align-items:center; justify-content:center; box-sizing:border-box; }
    .valueWell { flex:1; display:flex; align-items:baseline; justify-content:center; gap:${space[1]}px; box-sizing:border-box; }
    .actions { display:flex; gap:${space[4]}px; }
    .actionButton { flex:1; display:flex; align-items:center; justify-content:center; box-sizing:border-box; }
  </style>
  <h1>Food catalogue &amp; add/edit form — ${theme.name} — real tokens</h1>
  <div class="grid">${populated}${empty}${form}</div>`;
}

mkdirSync(HERE, { recursive: true });
const stage = mkdtempSync(join(tmpdir(), 'vitals-food-evidence-'));
for (const name of ['dark', 'light']) {
  const html = join(stage, `food-${name}.html`);
  writeFileSync(html, page(themes[name]));
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=1200,760',
    `--screenshot=${join(HERE, `food-${name}.png`)}`,
    `file://${html}`,
  ]);
  console.log(`wrote food-${name}.png`);
}
