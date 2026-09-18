/**
 * Visual evidence for issue #43's food catalogue — `<FoodList>` (populated + teaching empty state)
 * and `<FoodForm>`/`<Stepper>` (add/edit, pre-filled) — plus issue #100's swipe-left delete: a row
 * mid-swipe with the shared `<SwipeToDelete>` square button revealed, and the undo toast it shows
 * after a delete, both themes, one PNG each.
 *
 * WHY THIS EXISTS. There is no simulator in this environment. This draws the same markup the real
 * components draw, using the same `tokens.ts` values `FoodList.tsx`/`FoodForm.tsx`/`Stepper.tsx`/
 * `SwipeToDelete.tsx`/`UndoToast.tsx` themselves use — so the picture is evidence about these
 * components, not a second implementation of them. Same discipline as
 * `src/components/day-log/__evidence__/build-evidence.mjs`.
 *
 * THE DELETE ICON IS A STAND-IN. `SwipeToDelete.tsx` draws `glyph.delete` (`Ionicons` "trash") —
 * Chrome headless has no Ionicons font loaded, so the button below shows the same square, the same
 * `state.danger` fill and the same `size.deleteButton.side`/`radius.sm` geometry, with a plain
 * unicode glyph standing in for the icon. The toast's own check mark needs no such stand-in:
 * `UndoToast.tsx` renders it as a plain `'✓'` `<Text>`, not an icon, so this copies it verbatim.
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

/** One row wrapped in `<SwipeToDelete>`'s own geometry (`SwipeToDelete.tsx`): the delete layer is
 * always mounted underneath, just covered, and `reveal` slides the front layer left by
 * `DELETE_SLIDE_WIDTH` (`deleteButton.gap + deleteButton.side`) to show it — the same effect the
 * real `PanResponder`-driven `offset` produces on an actual swipe. */
function swipeRow(theme, food, { reveal = false } = {}) {
  const { deleteButton: db } = size;
  const slideWidth = db.gap + db.side;
  const translateX = reveal ? -slideWidth : 0;
  return `
  <div class="swipe-wrap" style="min-height:${size.tapTargetMin}px">
    <div class="delete-layer" style="opacity:${reveal ? 1 : 0}">
      <div class="delete-btn" style="width:${db.side}px;height:${db.side}px;border-radius:${radius.sm}px;background:${theme.color.state.danger}">
        <span style="color:${theme.color.text.onDanger};font-size:${size.icon.deleteAction}px;line-height:1">🗑</span>
      </div>
    </div>
    <div class="swipe-front" style="transform:translateX(${translateX}px);min-height:${size.tapTargetMin}px;background:${theme.color.resultRow.bg}">
      ${foodRow(theme, food).replace('<div class="food-row"', '<div class="food-row" style="border-bottom:none"')}
    </div>
  </div>`;
}

/** `<UndoToast>`'s own markup (`UndoToast.tsx`): check mark, title, meta — the meta carrying the
 * "Still in Breakfast, Post-workout" clause `archiveToastMeta()` (`FoodList.tsx`) appends when the
 * archived food is still used by a saved meal — and the Undo button, same tokens throughout. */
function undoToast(theme, title, meta) {
  const { toast } = theme.color;
  return `
  <div class="toast" style="height:${size.toast.height}px;border-radius:${radius.xl}px;background:${toast.bg};border:1px solid ${toast.border}">
    <div class="toastBody">
      <span style="color:${toast.checkIcon};font-size:${size.icon.md}px">✓</span>
      <div class="toastText">
        <span style="${font(typeTokens.body)}color:${toast.titleText}">${title}</span>
        <span style="${font(typeTokens.label)}color:${toast.metaText}">${meta}</span>
      </div>
    </div>
    <div class="toastUndo" style="min-width:${size.toast.undoMinWidth}px;min-height:${size.toast.undoHit}px;border-radius:${radius.md}px;background:${toast.undoBg}">
      <span style="${font(typeTokens.button)}color:${toast.undoText}">Undo</span>
    </div>
  </div>`;
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
  const swiping = card(
    theme,
    'Swipe-left — Delete revealed, no confirmation (issue #100)',
    [swipeRow(theme, FOODS[0], { reveal: true }), swipeRow(theme, FOODS[1])].join(''),
  );
  const deletedNoMeals = card(
    theme,
    'Deleted — undo toast, not in any saved meal',
    undoToast(theme, 'Greek yoghurt', '120 kcal · 20 g protein'),
    320,
  );
  const deletedInMeals = card(
    theme,
    'Deleted — the toast names the saved meals still using it',
    undoToast(theme, 'Chicken breast', '248 kcal · 46 g protein · Still in Breakfast, Post-workout'),
    340,
  );

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
    .swipe-wrap { position:relative; width:100%; overflow:hidden; }
    .delete-layer { position:absolute; inset:0; display:flex; justify-content:flex-end; align-items:center; padding-right:${space[4]}px; box-sizing:border-box; }
    .delete-btn { display:flex; align-items:center; justify-content:center; box-sizing:border-box; }
    .swipe-front { position:relative; box-sizing:border-box; }
    .toast { display:flex; align-items:center; justify-content:space-between; padding:0 ${space[5]}px; box-sizing:border-box; gap:${space[3]}px; width:100%; }
    .toastBody { display:flex; align-items:center; gap:${space[3]}px; flex:1; min-width:0; }
    .toastText { display:flex; flex-direction:column; gap:${space[1]}px; min-width:0; }
    .toastUndo { display:flex; align-items:center; justify-content:center; padding:0 ${space[4]}px; box-sizing:border-box; }
  </style>
  <h1>Food catalogue, add/edit form &amp; swipe-delete undo — ${theme.name} — real tokens</h1>
  <div class="grid">${populated}${empty}${form}${swiping}${deletedNoMeals}${deletedInMeals}</div>`;
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
    '--window-size=1200,1050',
    `--screenshot=${join(HERE, `food-${name}.png`)}`,
    `file://${html}`,
  ]);
  console.log(`wrote food-${name}.png`);
}
