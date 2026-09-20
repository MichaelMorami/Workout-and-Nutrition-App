// Vitals — the form frame (issue #207): the keyboard-up pinned footer pattern, for every form in
// the app. FoodForm is the first adopter; the boards are drawn with its content because that is the
// form being converted, but nothing here is FoodForm-specific except the words inside the fields.
// Emits .dc.html artboards + canvas.json under design/keyboard-footer/canvas/.
// Every colour, size, space and duration is read from src/theme/tokens.ts, so the ruling and the
// code cannot drift. Dark and light are generated from the same markup.
// Run: node design/keyboard-footer/build.mjs   (Node >= 23.6: imports the .ts tokens natively)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tokens from '../../src/theme/tokens.ts';

const { themes, fontInstances, space, radius, size, layout, motion, formFooterPaddingBottom } = tokens;
const TT = tokens.type;
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'canvas');
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ helpers */
const s = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':' + v).join(';');
const FONT = "Archivo,'Helvetica Neue',Helvetica,system-ui,sans-serif";
const r4 = (x) => Math.round(x * 10000) / 10000;
const TYPE = Object.fromEntries(Object.entries(TT).map(([role, st]) => {
  const f = fontInstances[st.fontFamily];
  return [role, {
    fontSize: st.fontSize + 'px', fontWeight: f.wght, fontStretch: f.wdth + '%',
    letterSpacing: r4(st.letterSpacing / st.fontSize) + 'em', lineHeight: String(r4(st.lineHeight / st.fontSize)),
    textTransform: st.textTransform,
  }];
}));
const t = (k, extra = {}) => s({ ...TYPE[k], ...extra });
const px = (n) => n + 'px';

const ico = (d, { sz = 20, w = size.icon.stroke, c = 'currentColor' } = {}) =>
  `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none">${d}</svg>`;
const I = {
  lock: '<rect x="5" y="10.4" width="14" height="10" rx="2.6"/><path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6"/>',
  back: '<path d="M14.8 5.6L8.4 12l6.4 6.4"/>',
};

/* -------------------------------------------------- contrast (same maths as tokens.test.tsx) */
const parse = (v) => {
  const h = /^#([0-9a-f]{6})$/i.exec(v);
  if (h) { const n = parseInt(h[1], 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }; }
  const m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(v);
  return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
};
const over = (top, bot) => { const k = (a, b) => Math.round(a * top.a + b * (1 - top.a)); return { r: k(top.r, bot.r), g: k(top.g, bot.g), b: k(top.b, bot.b), a: 1 }; };
const lum = ({ r, g, b }) => { const l = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b); };
const get = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);
function ratio(th, fg, ground) {
  const [base, ...layers] = ground;
  const bg = layers.reduce((acc, p) => over(parse(get(th.color, p)), acc), parse(get(th.color, base)));
  const f = over(parse(get(th.color, fg)), bg);
  const [hi, lo] = [lum(f), lum(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/* ------------------------------------------------------------------ device chrome
 * The phone draws these, not Vitals, so they are not tokens — the canvas only illustrates them.
 * `SAFE` is `useSafeAreaInsets().bottom` on a gesture-bar iPhone; `SAFE_SM` is a home-button phone
 * and most Androids, which report none at all. */
const W = 390, H = 844, STATUS = 59, SAFE = 34, KEYBOARD = 336;
const W_SM = 375, H_SM = 667, STATUS_SM = 20, SAFE_SM = 0, KEYBOARD_SM = 260;
const G = layout.gutter;
const FF = size.foodForm;
const HAIR = FF.fieldBorderWidth, FOCUS = FF.fieldBorderWidthFocus;
const HEADER = size.button.headerHit + space[3];   // the expo-router stack header, drawn by the OS

const caret = (c) => `<span style="${s({ width: '2px', height: '22px', borderRadius: '1px', background: c.foodForm.caret, flex: 'none' })}"></span>`;

function keyboardZone(c, h, label) {
  return `<div style="${s({ height: px(h), flex: 'none', background: c.bg.canvas, borderTop: `${HAIR}px dashed ${c.line.strong}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: px(space[2]) })}"><span style="${t('micro', { color: c.text.tertiary })}">${label}</span><span style="${t('label', { color: c.text.tertiary })}">${h} pt · drawn by the phone, not by Vitals</span></div>`;
}

function homeIndicator(c, h) {
  return `<div style="${s({ height: px(h), flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' })}">${h > 0 ? `<span style="${s({ width: '134px', height: '5px', borderRadius: px(radius.pill), background: c.line.strong })}"></span>` : ''}</div>`;
}

/* ------------------------------------------------------------------ form parts */
function fieldLabel(c, label, unit) {
  const F = c.foodForm;
  return `<span style="${s({ display: 'flex', alignItems: 'baseline', gap: px(space[2]) })}"><span style="${t('label', { color: F.fieldLabelText })}">${label}</span>${unit ? `<span style="${t('unit', { color: F.sectionMetaText })}">${unit}</span>` : ''}</span>`;
}

function field(c, label, value, { placeholder = '', focused = false, flex = '1' } = {}) {
  const F = c.foodForm;
  const border = focused ? `${FOCUS}px solid ${F.fieldBorderFocus}` : `${HAIR}px solid ${F.fieldBorder}`;
  return `<div style="${s({ flex, minWidth: '0', display: 'flex', flexDirection: 'column', gap: px(space[2]) })}">
    ${fieldLabel(c, label)}
    <span style="${s({ height: px(FF.fieldHit), borderRadius: px(radius.md), background: F.fieldBg, border, display: 'flex', alignItems: 'center', padding: `0 ${space[5]}px`, minWidth: '0' })}"><span style="${t('input', { color: value ? F.inputText : F.placeholderText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}">${value || placeholder}</span>${focused ? caret(c) : ''}</span>
  </div>`;
}

function eyebrow(c, left, right) {
  const F = c.foodForm;
  return `<div style="${s({ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' })}"><span style="${t('micro', { color: F.sectionText })}">${left}</span>${right ? `<span style="${t('label', { color: F.sectionMetaText })}">${right}</span>` : ''}</div>`;
}

const CHIPS = ['100 g', '100 ml', '1 cup', '1 tbsp', '1 tsp', 'Custom…'];
function chipGrid(c, selected) {
  const F = c.foodForm;
  return `<div style="${s({ display: 'grid', gridTemplateColumns: `repeat(${FF.chipColumns}, minmax(0, 1fr))`, gap: px(FF.chipGap) })}">${CHIPS.map((label) => {
    const sel = label === selected;
    return `<span style="${s({ height: px(FF.chipHit), borderRadius: px(radius.md), background: sel ? F.chipSelectedBg : F.chipBg, border: `${sel ? FF.chipBorderSelected : FF.chipBorder}px solid ${sel ? F.chipSelectedBorder : F.chipBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', color: sel ? F.chipSelectedText : F.chipText, ...TYPE[sel ? 'controlSelected' : 'control'] })}">${label}</span>`;
  }).join('')}</div>`;
}

function lockedRow(c, amount, unit) {
  const F = c.foodForm;
  return `<div style="${s({ height: px(FF.lockedRowHeight), display: 'flex', alignItems: 'center', gap: px(space[3]) })}">
    <span style="${s({ color: F.lockIcon })}">${ico(I.lock, { sz: FF.lockIcon })}</span>
    <span style="${s({ display: 'flex', alignItems: 'baseline', gap: px(space[1]) })}"><span style="${t('numericLg', { color: F.lockedAmountText })}">${amount}</span><span style="${t('unit', { color: F.lockedMetaText })}">${unit}</span></span>
    <span style="${t('label', { color: F.lockedMetaText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}">Set by the preset. Pick Custom… to change it.</span>
  </div>`;
}

function stepper(c, value, { color, unit, focused = false } = {}) {
  const S = c.stepper, F = c.foodForm;
  const btn = (g) => `<span style="${s({ width: px(FF.nutritionButtonWidth), height: px(FF.nutritionHit), flex: 'none', borderRadius: px(radius.md), background: S.buttonBg, color: S.buttonIcon, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPE.numericLg })}">${g}</span>`;
  return `<div style="${s({ display: 'flex', gap: px(FF.stepperGap), alignItems: 'center', flex: '1', minWidth: '0' })}">
    ${btn('−')}
    <span style="${s({ flex: '1', minWidth: '0', height: px(FF.nutritionHit), borderRadius: px(radius.md), background: S.valueBg, boxShadow: focused ? `inset 0 0 0 ${FOCUS}px ${F.fieldBorderFocus}` : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: px(space[1]) })}"><span style="${t('stepperValue', { color: color || S.valueText })}">${value}</span>${focused ? caret(c) : ''}${unit ? `<span style="${t('unit', { color: S.unitText })}">${unit}</span>` : ''}</span>
    ${btn('+')}
  </div>`;
}

function nutrition(c, kcal, prot, focus) {
  const F = c.foodForm;
  const col = (label, unit, v, color, f) => `<div style="${s({ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: px(space[2]) })}">${fieldLabel(c, label, unit)}${stepper(c, v, { color, focused: f })}</div>`;
  return `<div style="${s({ display: 'flex', flexDirection: 'column', gap: px(space[3]) })}">
    ${eyebrow(c, 'Per 100 g', 'as printed on the pack')}
    <div style="${s({ display: 'flex', gap: px(FF.nutritionGap) })}">${col('Calories', 'kcal', kcal, F.kcalValueText, focus === 'kcal')}${col('Protein', 'g', prot, F.proteinValueText, focus === 'protein')}</div>
  </div>`;
}

/* The scrolling body. `scrollTo` is how far it has been scrolled under the pinned footer. */
function body(c, st, scrollTo = 0) {
  const inner = `<div style="${s({ display: 'flex', flexDirection: 'column', gap: px(space[6]), padding: `${space[2]}px ${G}px ${layout.formBodyPadBottom}px` })}">
    <div style="${s({ display: 'flex', gap: px(space[4]) })}">${field(c, 'Name', st.name, { flex: '1.7', focused: st.focus === 'name' })}${field(c, 'Brand', st.brand, { placeholder: 'Optional' })}</div>
    <div style="${s({ display: 'flex', flexDirection: 'column', gap: px(space[3]) })}">
      ${eyebrow(c, 'Serving', 'Weight · grams')}
      ${chipGrid(c, st.chip)}
      ${lockedRow(c, st.amount, 'g')}
    </div>
    ${nutrition(c, st.kcal, st.prot, st.focus)}
  </div>`;
  return `<div style="${s({ flex: '1', minHeight: '0', overflow: 'hidden', position: 'relative' })}"><div style="${s({ position: 'absolute', left: '0', right: '0', top: px(-scrollTo) })}">${inner}</div></div>`;
}

function preview(c, text, kcal, prot) {
  const F = c.foodForm;
  return `<div style="${s({ height: px(FF.previewHeight), borderRadius: px(radius.md), background: F.previewBg, display: 'flex', alignItems: 'center', gap: px(space[2]), padding: `0 ${space[5]}px` })}">
    <span style="${t('body', { color: F.previewServingText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: '0', flex: '0 1 auto' })}">${text}</span>
    <span style="${t('body', { color: F.previewUnitText, flex: 'none' })}">=</span>
    <span style="${s({ display: 'flex', alignItems: 'baseline', gap: px(space[1]), flex: 'none', whiteSpace: 'nowrap' })}"><span style="${t('numericMd', { color: F.previewKcalText })}">${kcal}</span><span style="${t('caption', { color: F.previewUnitText })}">kcal</span><span style="${t('caption', { color: F.previewUnitText })}">·</span><span style="${t('numericMd', { color: F.previewProteinText })}">${prot}</span><span style="${t('caption', { color: F.previewUnitText })}">g protein</span></span>
  </div>`;
}

/**
 * THE PINNED FOOTER. Height is constant for a given keyboard state: two rows with the keyboard up,
 * plus the optional note row only when it is down. `padBottom` comes from the one rule in
 * `formFooterPaddingBottom(keyboardVisible, safeAreaBottom)` — never from a literal.
 */
function footer(c, { primary, note = null, divider = false, screen = false, keyboardUp = false, safe = SAFE, gutter = G }) {
  const F = c.foodForm, B = c.button;
  const padBottom = formFooterPaddingBottom(keyboardUp, safe);
  return `<div style="${s({ flex: 'none', background: screen ? F.footerBgScreen : F.footerBg, borderTop: `${HAIR}px solid ${divider ? F.footerDivider : 'transparent'}`, padding: `${layout.formFooterPadTop}px ${gutter}px ${padBottom}px`, display: 'flex', flexDirection: 'column', gap: px(layout.formFooterRowGap) })}">
    ${preview(c, '100 g', '97', '9')}
    <div style="${s({ display: 'flex', gap: px(space[4]) })}">
      <span style="${s({ flex: '1', height: px(size.button.primaryHit), borderRadius: px(radius.md), border: `${HAIR}px solid ${B.secondaryBorder}`, color: B.secondaryText, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPE.button })}">Cancel</span>
      <span style="${s({ flex: '2', height: px(size.button.primaryHit), borderRadius: px(radius.md), background: B.kcalBg, color: B.kcalText, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPE.button })}">${primary}</span>
    </div>
    ${note && !keyboardUp ? `<span style="${t('label', { color: F.historyNoteText, textAlign: 'center' })}">${note}</span>` : ''}
  </div>`;
}

function stackHeader(c, title) {
  return `<div style="${s({ flex: 'none', height: px(HEADER), display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: `0 ${G}px` })}">
    <span style="${s({ position: 'absolute', left: px(space[3]), height: px(size.button.headerHit), display: 'flex', alignItems: 'center', gap: px(space[1]), color: c.text.primary, ...TYPE.button })}">${ico(I.back, { sz: size.icon.lg })}Foods</span>
    <span style="${t('headline', { color: c.text.primary })}">${title}</span>
  </div>`;
}

const frame = (inner, { w = W, h = H } = {}) =>
  `<div style="${s({ position: 'relative', width: px(w), height: px(h), overflow: 'hidden', fontFamily: FONT })}">${inner}</div>`;

/* ------------------------------------------------------------------ the screen variant
 * `/foods/new` and `/foods/[id]`: the frame IS the screen, under the stack header. */
function screenBoard(th, { keyboardUp = false, note = null, title = 'Add food', st, scrollTo = 0, overlay = false, w = W, h = H, statusH = STATUS, safe = SAFE, kb = KEYBOARD } = {}) {
  const c = th.color;
  const inner = `<div style="${s({ position: 'absolute', inset: '0', background: c.bg.canvas, display: 'flex', flexDirection: 'column' })}">
    <div style="${s({ height: px(statusH), flex: 'none' })}"></div>
    ${stackHeader(c, title)}
    ${body(c, st, scrollTo)}
    ${footer(c, { primary: 'Save food', note, divider: keyboardUp || scrollTo > 0, screen: true, keyboardUp, safe })}
    ${keyboardUp ? keyboardZone(c, kb, 'System keyboard') : homeIndicator(c, safe)}
  </div>`;
  return frame(inner + (overlay ? anatomy(th, { keyboardUp, statusH, safe, kb, w, h }) : ''), { w, h });
}

/* ------------------------------------------------------------------ the sheet variant
 * `CreateFoodSheet`: the SHEET owns the avoider; the frame inside it owns nothing but its footer. */
function sheetBoard(th, { keyboardUp = true, st, scrollTo = 0, w = W, h = H, statusH = STATUS, safe = SAFE, kb = KEYBOARD } = {}) {
  const c = th.color;
  const backdrop = `<div style="${s({ position: 'absolute', inset: '0', background: c.bg.canvas })}"><div style="${s({ height: px(statusH) })}"></div><div style="${s({ padding: `0 ${layout.gutterToday}px`, ...TYPE.displayLg, color: c.text.primary })}">Today</div></div>`;
  const sheet = `<div style="${s({ position: 'absolute', left: '0', right: '0', top: px(statusH + size.searchSheet.topInset), bottom: px(keyboardUp ? kb : 0), background: c.searchSheet.bg, borderRadius: `${radius.xl}px ${radius.xl}px 0 0`, boxShadow: th.shadow.sheet, display: 'flex', flexDirection: 'column', gap: px(space[4]), overflow: 'hidden', paddingTop: px(space[3]) })}">
    <div style="${s({ flex: 'none', width: px(size.searchSheet.grabberWidth), height: px(size.searchSheet.grabberHeight), borderRadius: px(radius.pill), background: c.searchSheet.grabber, margin: '0 auto' })}"></div>
    <div style="${s({ flex: 'none', padding: `0 ${G}px` })}"><span style="${t('title', { color: c.searchSheet.titleText || c.text.primary })}">New food</span></div>
    ${body(c, st, scrollTo)}
    ${footer(c, { primary: 'Save &amp; log 100 g', divider: keyboardUp || scrollTo > 0, keyboardUp, safe })}
  </div>`;
  const kbz = keyboardUp ? `<div style="${s({ position: 'absolute', left: '0', right: '0', bottom: '0' })}">${keyboardZone(c, kb, 'System keyboard')}</div>` : '';
  return frame(`${backdrop}<div style="${s({ position: 'absolute', inset: '0', background: c.searchSheet.scrim })}"></div>${sheet}${kbz}`, { w, h });
}

/* ------------------------------------------------------------------ the anatomy overlay */
function anatomy(th, { keyboardUp, statusH, safe, kb, w, h }) {
  const c = th.color;
  const footerH = layout.formFooterPadTop + FF.previewHeight + layout.formFooterRowGap + size.button.primaryHit + formFooterPaddingBottom(keyboardUp, safe);
  const below = keyboardUp ? kb : safe;
  const bodyH = h - statusH - HEADER - footerH - below;
  const band = (top, height, label, colour) => `<div style="${s({ position: 'absolute', left: '0', right: '0', top: px(top), height: px(height), border: `1px dashed ${colour}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '4px 6px' })}"><span style="${s({ ...TYPE.micro, color: colour, background: c.bg.canvas, padding: '2px 5px', borderRadius: '5px' })}">${label}</span></div>`;
  return `<div style="${s({ position: 'absolute', inset: '0', pointerEvents: 'none' })}">
    ${band(statusH, HEADER, 'HEADER · the OS stack header', c.text.tertiary)}
    ${band(statusH + HEADER, bodyH, `BODY · scrolls · ${bodyH} pt`, c.data.protein)}
    ${band(statusH + HEADER + bodyH, footerH, `FOOTER · pinned · ${footerH} pt`, c.data.kcal)}
    ${band(h - below, below, keyboardUp ? `KEYBOARD · ${kb} pt` : `SAFE AREA · ${safe} pt`, c.text.tertiary)}
  </div>`;
}

/* ------------------------------------------------------------------ the states drawn */
const ST = { name: 'Greek yoghurt', brand: 'Fage', chip: '100 g', amount: 100, kcal: 97, prot: 9 };
const ST_TYPING = { ...ST, focus: 'protein' };

const boards = (th) => ({
  anatomy: screenBoard(th, { st: ST, overlay: true }),
  rest: screenBoard(th, { st: ST, note: null }),
  typing: screenBoard(th, { st: ST_TYPING, keyboardUp: true, scrollTo: 150 }),
  edit: screenBoard(th, { st: ST, title: 'Greek yoghurt', note: 'Changes apply from now on. Past logs keep their numbers.' }),
  sheet: sheetBoard(th, { st: ST_TYPING, keyboardUp: true, scrollTo: 150 }),
  small: screenBoard(th, {
    st: ST_TYPING, keyboardUp: true, scrollTo: 96, overlay: true,
    w: W_SM, h: H_SM, statusH: STATUS_SM, safe: SAFE_SM, kb: KEYBOARD_SM,
  }),
});

/* ------------------------------------------------------------------ spec board */
const BOARD = '#101218', B1 = themes.dark.color.text.primary, B2 = themes.dark.color.text.secondary, B3 = themes.dark.color.text.tertiary;
const BHAIR = '#2A2E36', BSURF = '#181B21', ACC = themes.dark.color.data.kcal;
const OK = themes.dark.color.data.protein, NO = themes.dark.color.state.danger;
const hl = (x) => `<span style="color:${B1}">${x}</span>`;
const code = (x) => `<span style="${s({ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: '12px', color: B1 })}">${x}</span>`;
const callout = (txt, dot = ACC) => `<div style="${s({ display: 'flex', gap: '9px', alignItems: 'flex-start' })}"><span style="${s({ width: '5px', height: '5px', borderRadius: '999px', background: dot, marginTop: '7px', flex: 'none' })}"></span><span style="${t('label', { fontSize: '13px', lineHeight: '1.5', color: B2, textWrap: 'pretty' })}">${txt}</span></div>`;
const stack = (items, gap = 9) => `<div style="${s({ display: 'flex', flexDirection: 'column', gap: px(gap) })}">${items.join('\n')}</div>`;
const panel = (title, sub, inner) => `<div style="${s({ background: BSURF, border: `1px solid ${BHAIR}`, borderRadius: '20px', padding: '22px 24px', marginTop: '20px' })}">
  <div style="${t('title', { fontSize: '17px', color: B1 })}">${title}</div>
  ${sub ? `<div style="${t('label', { fontSize: '13px', lineHeight: '1.5', color: B3, marginTop: '5px', marginBottom: '16px', textWrap: 'pretty' })}">${sub}</div>` : '<div style="height:14px"></div>'}
  ${inner}
</div>`;
const table = (head, rows, widths) => `<div style="${s({ display: 'flex', flexDirection: 'column' })}">
  <div style="${s({ display: 'flex', gap: '16px', padding: '0 0 8px', borderBottom: `1px solid ${BHAIR}` })}">${head.map((h, i) => `<span style="${t('micro', { color: B3, width: px(widths[i]), flex: 'none' })}">${h}</span>`).join('')}</div>
  ${rows.map((r) => `<div style="${s({ display: 'flex', gap: '16px', padding: '10px 0', borderBottom: `1px solid ${BHAIR}`, alignItems: 'flex-start' })}">${r.map((cell, i) => `<span style="${t('label', { fontSize: '13px', lineHeight: '1.45', color: i === 0 ? B1 : B2, width: px(widths[i]), flex: 'none', textWrap: 'pretty' })}">${cell}</span>`).join('')}</div>`).join('')}
</div>`;

const footerH = (keyboardUp, safe) => layout.formFooterPadTop + FF.previewHeight + layout.formFooterRowGap + size.button.primaryHit + formFooterPaddingBottom(keyboardUp, safe);
const bodyOf = (h, statusH, chrome, keyboardUp, safe, kb) => h - statusH - chrome - footerH(keyboardUp, safe) - (keyboardUp ? kb : safe);
const D = themes.dark, Lt = themes.light;

const PAIRS = [
  ['foodForm.previewServingText', ['foodForm.footerBgScreen', 'foodForm.previewBg']],
  ['foodForm.previewKcalText', ['foodForm.footerBgScreen', 'foodForm.previewBg']],
  ['foodForm.previewProteinText', ['foodForm.footerBgScreen', 'foodForm.previewBg']],
  ['foodForm.previewServingText', ['foodForm.footerBg', 'foodForm.previewBg']],
  ['foodForm.historyNoteText', ['foodForm.footerBgScreen']],
  ['button.kcalText', ['foodForm.footerBgScreen', 'button.kcalBg']],
  ['button.secondaryText', ['foodForm.footerBgScreen']],
];

function specBoard() {
  return `<div style="${s({ width: '1240px', background: BOARD, padding: '40px', color: B1, fontFamily: FONT })}">
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '9px' })}">
    <div style="${t('displayLg', { fontSize: '30px', color: B1 })}">The form frame</div>
    <div style="${t('body', { fontSize: '15.5px', color: B2, maxWidth: '860px', textWrap: 'pretty' })}">Issue #207. Every form in Vitals is the same three parts: an optional header, one scrolling body, and an action footer that never scrolls. The footer rides the keyboard. Nothing is broken today — Save is reachable on both platforms — so this is priority 1, the feel: with the keyboard up, the thing you are about to press is already under your thumb, and you never scroll to find it.</div>
  </div>

  ${panel('1 · The ruling', 'Six sentences. Everything below is detail under them.', stack([
    callout(`${hl('Pinned, not scrolling.')} The footer is a sibling of the scroll view, never its last child. It is ${code('flex: none')}; the body is ${code('flex: 1')} with ${code('minHeight: 0')}. The body is the only part that ever shrinks.`),
    callout(`${hl('One avoider per presentation.')} Keyboard avoidance belongs to the outermost frame on screen and there is exactly one of it. On a pushed screen that is the form; inside a sheet it is the sheet, and the form inside adds none.`),
    callout(`${hl('The footer owns the bottom inset; the body owns none.')} ${code('formFooterPaddingBottom(keyboardVisible, insets.bottom)')} is the whole rule, and it lives in tokens.ts so no form can get it half right.`),
    callout(`${hl('The footer rides the keyboard’s own curve.')} Vitals adds no duration, no spring and no offset to that travel — the only thing that would do is desync the footer from the keys.`),
    callout(`${hl('The footer never collapses.')} Two rows with the keyboard up, always: the preview strip and the action row. A note row is keyboard-down only. On the smallest phone the body gets small; the footer does not move.`),
    callout(`${hl('No new native module.')} ${code('KeyboardAvoidingView')} from React Native core, as ${code('PortionSheet')} already uses. Charts and forms both have to run in Expo Go.`),
  ]))}

  ${panel('2 · The inset, and who owns it', `The one mistake this pattern exists to prevent: adding the safe-area inset on top of the keyboard. The keyboard is already sitting on the home indicator, so the inset would lift the button off a band of dead keys. ${code('formFooterPaddingBottom')} in ${code('src/theme/tokens.ts')} is the only place that decision is made.`, table(
    ['Device', 'insets.bottom', 'Keyboard down', 'Keyboard up', 'Why'],
    [
      ['Gesture-bar iPhone', '34', `${formFooterPaddingBottom(false, 34)} pt`, `${formFooterPaddingBottom(true, 34)} pt`, 'At rest the inset clears the gesture bar. With the keyboard up the keyboard covers it.'],
      ['Home-button iPhone', '0', `${formFooterPaddingBottom(false, 0)} pt`, `${formFooterPaddingBottom(true, 0)} pt`, `No inset to honour, so ${code('formFooterPadBottom')} is the floor that keeps the button off the edge.`],
      ['Android, 3-button nav', '0', `${formFooterPaddingBottom(false, 0)} pt`, `${formFooterPaddingBottom(true, 0)} pt`, 'Same floor. The nav bar is outside the app window.'],
      ['Android, gesture nav', '24', `${formFooterPaddingBottom(false, 24)} pt`, `${formFooterPaddingBottom(true, 24)} pt`, 'The inset wins at rest because it is larger than the pad.'],
    ], [170, 110, 120, 110, 620]))}

  ${panel('3 · Tokens', `Four distances and one duration. Nothing else in this pattern is a number a form may type. Colour needs nothing new: a footer is, by ruling, the ground it floats over — ${code('bg.surface')} in a sheet, ${code('bg.canvas')} on a pushed screen — and its divider is ${code('line.hairline')} at ${code('StyleSheet.hairlineWidth')}, like every other divider in the app. A form only asks design-lead for a colour when it wants a ground of its own.`, table(
    ['Token', 'Value', 'What it is for'],
    [
      [code('layout.formFooterPadTop'), `${layout.formFooterPadTop} pt`, 'Between the footer’s divider and its first row.'],
      [code('layout.formFooterPadBottom'), `${layout.formFooterPadBottom} pt`, `The footer’s bottom pad, and the floor under the safe-area inset. Read it through ${code('formFooterPaddingBottom()')}, never directly.`],
      [code('layout.formFooterRowGap'), `${layout.formFooterRowGap} pt`, 'Between the footer’s own rows: preview ↔ actions ↔ note.'],
      [code('layout.formBodyPadBottom'), `${layout.formBodyPadBottom} pt`, 'Under the last control in the scrolling body, so it comes to rest clear of the divider.'],
      [code('motion.events.footerDividerFade'), `${motion.events.footerDividerFade.duration} ms · ${motion.events.footerDividerFade.easing} · reduced ${motion.events.footerDividerFade.reduced.kind}`, 'The divider fading in and out. Wired in step 2 — an unconsumed motion token is issue #210’s mistake, so if the divider ships as a hard toggle this token comes out again.'],
      [code('formFooterPaddingBottom(kb, inset)'), 'function', 'The inset rule of section 2, exported from tokens.ts.'],
    ], [300, 220, 630]))}

  ${panel('4 · Sheets — one avoider, and only one', `${code('PortionSheet')} already wraps its scrim and sheet in a ${code('KeyboardAvoidingView')} (issue #94). That is the precedent and it stands: in a sheet the avoider is the sheet’s, because the scrim has to rise with it. A second avoider inside the form would shift the content twice.`, table(
    ['Host', 'Who avoids the keyboard', 'What the form does'],
    [
      [`${code('/foods/new')}, ${code('/foods/[id]')}`, 'The form frame itself — it is the outermost thing under the stack header.', `Owns the ${code('KeyboardAvoidingView')}. Passes the header height as ${code('keyboardVerticalOffset')}.`],
      [code('CreateFoodSheet'), 'The sheet, wrapping scrim + sheet, exactly as PortionSheet does.', `Renders with its avoider off (${code('FoodForm')}’s existing ${code('variant=\'sheet\'')} already says which host it is in — no new prop).`],
      [code('PortionSheet'), 'The sheet. Unchanged by this ruling.', 'Has no form footer; its Log button is the last child of the sheet.'],
    ], [220, 340, 590]))}

  ${panel('5 · Mechanism — what ui-engineer builds', `One component, owned by ui-engineer, so the second and third form need no design input at all. Suggested home: ${code('src/components/form/FormFrame.tsx')}. Names below are the contract; the internals are ui-engineer’s.`, `<div style="${s({ display: 'flex', gap: '28px' })}">
    ${stack([
      callout(`${hl('Shape')}: ${code('<KeyboardAvoidingView>')} → ${code('<ScrollView>')} (the body) + ${code('<View>')} (the footer). Footer outside the scroll view, always.`),
      callout(`${hl('behavior')}: ${code('\'padding\'')} on iOS. On Android too — Expo SDK 57 is edge-to-edge, so the window no longer resizes itself under the keyboard. This choice lives in the frame, in one line, for every form: if the carried device check shows a double shift on some Android build, it changes there and nowhere else.`),
      callout(`${hl('keyboardVerticalOffset')}: the height of whatever chrome sits above the frame — the stack header on a pushed screen, ${code('0')} in a sheet. A prop with a ${code('0')} default, never a literal inside the frame.`),
      callout(`${hl('Kill')} ${code('automaticallyAdjustKeyboardInsets')} on the body. It exists in ${code('FoodForm')} today to make Save scrollable; with a pinned footer it double-shifts the content. Keep ${code('keyboardShouldPersistTaps="handled"')} — a chip or Save with the keyboard up must land on the first tap (issue #79).`, NO),
      callout(`${hl('Never')} ${code('useAnimatedKeyboard')}, ${code('react-native-keyboard-controller')}, or a hand-rolled ${code('Keyboard.addListener')} height animation. One mechanism, in core, that Expo Go runs.`, NO),
    ])}
    ${stack([
      callout(`${hl('Props')}: ${code('footerBg')} (the host’s ground), ${code('avoidsKeyboard')} (default ${code('true')}; ${code('false')} when a sheet already avoids), ${code('headerOffset')} (default ${code('0')}), ${code('footer')} (the rows), ${code('children')} (the body), ${code('testID')}.`),
      callout(`${hl('Gutter')}: the frame owns the side gutter (${code('layout.gutter')}) on both body and footer, so the divider runs edge to edge. The host screen must stop adding ${code('paddingHorizontal')} around the form — ${code('/foods/new')} and ${code('/foods/[id]')} both do today.`),
      callout(`${hl('testIDs')}: ${code('‹id›-frame')}, ${code('‹id›-body')}, ${code('‹id›-footer')}, ${code('‹id›-footer-divider')}. The existing ${code('‹id›-save')} and ${code('‹id›-cancel')} keep their names inside the footer.`),
      callout(`${hl('Tests')}: ${code('useSafeAreaInsets()')} needs a provider in RNTL — wrap in ${code('<SafeAreaProvider initialMetrics={…}>')} with a fixed inset rather than mocking the module, so the 34 pt and the 0 pt cases are both real. Assert Save is rendered outside the scroll view, which is the acceptance line “reachable with the keyboard up without scrolling”.`),
      callout(`${hl('Thumb')}: the primary action stays in the bottom third in every state on these boards, and Cancel keeps the narrower half. Both clear ${code('size.button.primaryHit')} = ${size.button.primaryHit} pt, over the ${size.tapTargetMin} pt floor.`, OK),
    ])}
  </div>`)}

  ${panel('6 · The divider', `One hairline, on the footer, and nothing at the top of the body. It says “there is more form under here”, so it follows the bottom of the scroll, not the top.`, stack([
    callout(`${hl('Shown')} while the body can scroll and is not at its end: ${code('contentOffset.y + layoutMeasurement.height < contentSize.height - 1')}. ${hl('Hidden')} when the body fits, or is scrolled to the bottom — there is nothing under the footer to hint at.`),
    callout(`${hl('Fades')} over ${motion.events.footerDividerFade.duration} ms (${code('motion.events.footerDividerFade')}). Opacity on a 1 pt line, so reduce motion keeps it as is (${code('reduced.kind: \'same\'')}) — there is nothing vestibular in a hairline.`),
    callout(`${hl('Colour')} ${code('line.hairline')} at ${code('StyleSheet.hairlineWidth')}, the same divider the log rows and the search sheet draw. ${code('foodForm.footerDivider')} already resolves to it.`),
  ]))}

  ${panel('7 · Reduce motion', 'Motion is feedback, never decoration — so there is very little of it here, and what there is survives.', stack([
    callout(`${hl('The footer’s travel')} is the keyboard’s. The OS animates the keyboard and honours the user’s own settings; ${code('KeyboardAvoidingView')} follows it frame for frame. Vitals owns no duration for it, which is why ${code('motion.events')} gains no ${code('footerLift')} entry — a token nothing consumes is issue #210’s mistake, and one that fought the OS curve would be worse.`),
    callout(`${hl('The divider')} fades either way: ${motion.events.footerDividerFade.duration} ms of opacity is under the 150 ms where a cross-fade starts to read as movement.`),
    callout(`${hl('Nothing else moves.')} No sheet re-height, no content re-flow, no scroll animation on focus. If a form wants to bring a field into view on focus, that is the scroll view’s own behaviour, not an animation this pattern owns.`),
  ]))}

  ${panel('8 · The small screen, where the footer and the keyboard compete', `Drawn on the “Small screen” board: 375 × 667, no safe-area inset, a ${KEYBOARD_SM} pt keyboard. The footer is ${footerH(true, SAFE_SM)} pt and does not move; the body takes what is left and scrolls. The note row being keyboard-down only is what keeps the footer at two rows on every phone.`, table(
    ['Case', 'Screen', 'Chrome', 'Keyboard', 'Footer', 'Body left'],
    [
      ['Pushed screen, at rest', `${W} × ${H}`, `${STATUS} + ${HEADER}`, '—', `${footerH(false, SAFE)} pt`, `${bodyOf(H, STATUS, HEADER, false, SAFE, KEYBOARD)} pt`],
      ['Pushed screen, typing', `${W} × ${H}`, `${STATUS} + ${HEADER}`, `${KEYBOARD} pt`, `${footerH(true, SAFE)} pt`, `${bodyOf(H, STATUS, HEADER, true, SAFE, KEYBOARD)} pt`],
      ['Create sheet, typing', `${W} × ${H}`, `${STATUS} + ${size.searchSheet.topInset} + 57`, `${KEYBOARD} pt`, `${footerH(true, SAFE)} pt`, `${bodyOf(H, STATUS + size.searchSheet.topInset, 57, true, SAFE, KEYBOARD)} pt`],
      ['Small screen, typing', `${W_SM} × ${H_SM}`, `${STATUS_SM} + ${HEADER}`, `${KEYBOARD_SM} pt`, `${footerH(true, SAFE_SM)} pt`, `${bodyOf(H_SM, STATUS_SM, HEADER, true, SAFE_SM, KEYBOARD_SM)} pt`],
    ], [200, 130, 150, 110, 110, 400]))}

  ${panel('9 · Contrast, both themes', `The footer is a surface text sits on in every state, so it is measured on both grounds it can have. Composited the way ${code('tokens.test.tsx')} composites. Floor ${'4.5'} : 1.`, table(
    ['Foreground', 'On', 'Dark', 'Light'],
    PAIRS.map(([fg, on]) => [code(fg), on.join(' + '), ratio(D, fg, on).toFixed(2), ratio(Lt, fg, on).toFixed(2)]),
    [300, 420, 100, 100]))}
</div>`;
}

/* ------------------------------------------------------------------ emit */
const dc = (inner, bg) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&amp;display=swap">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: ${bg}; font-family: ${FONT}; -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums; }
  </style>
</helmet>
${inner}
</x-dc>
</body>
</html>`;

const dark = boards(D), light = boards(Lt);
const BOARDS = [
  ['anatomy', 'Anatomy — header · body · pinned footer · safe area', 'Anatomy', W, H],
  ['rest', 'Pushed screen — keyboard down, footer on the safe-area inset', 'ScreenRest', W, H],
  ['typing', 'Pushed screen — keyboard up, footer riding it, divider on', 'ScreenTyping', W, H],
  ['edit', 'Edit — the note row, which is keyboard-down only', 'EditNote', W, H],
  ['sheet', 'Create sheet — the sheet owns the avoider, the form owns none', 'SheetTyping', W, H],
  ['small', 'Small screen — 375 × 667, keyboard up, footer and keyboard competing', 'SmallScreen', W_SM, H_SM],
];
const files = {};
for (const [key, , file] of BOARDS) {
  files[`${file}.dc.html`] = dc(dark[key], D.color.bg.canvas);
  files[`${file}Light.dc.html`] = dc(light[key], Lt.color.bg.canvas);
}
files['Spec.dc.html'] = dc(specBoard(), BOARD);
for (const [name, html] of Object.entries(files)) writeFileSync(join(OUT, name), html);

const GAP = 110, ROW = H + 300, SPEC_H = 3180;
let x = 0;
const place = (page) => BOARDS.map(([, title, file, w, h], i) => {
  const at = x;
  x += w + GAP;
  if (i === BOARDS.length - 1) x = 0;
  return { file: `${file}${page === 'page-2' ? 'Light' : ''}.dc.html`, title: page === 'page-2' ? `${title} — light` : title, x: at, y: 0, w, h, page };
});

const canvas = {
  pages: [
    { id: 'page-1', name: 'Form frame — dark + ruling' },
    { id: 'page-2', name: 'Form frame — light' },
  ],
  artboards: [
    ...place('page-1'),
    { file: 'Spec.dc.html', title: 'Ruling — pinned footer, the inset, sheets, mechanism, reduce motion, small screen', x: 0, y: ROW, w: 1240, h: SPEC_H, page: 'page-1' },
    ...place('page-2'),
  ],
  annotations: [
    {
      id: 'brief', page: 'page-1', x: 0, y: -320, w: 1400,
      text: 'ISSUE #207 — THE FORM FRAME\n\nEvery form in Vitals is one shape: an optional header, one scrolling body, and an action footer that never scrolls and rides the keyboard. FoodForm is the first adopter, not the subject — the ruling is the pattern.\n\nNothing is broken today: the #188 review confirmed Save is scroll-reachable on both platforms. This is the feel. With the keyboard up, the thing you are about to press is already under your thumb.',
    },
    {
      id: 'inset', page: 'page-1', x: 1520, y: -320, w: 900,
      text: 'THE INSET\n\nThe footer owns it; the body owns none. formFooterPaddingBottom(keyboardVisible, insets.bottom) in tokens.ts is the whole rule: the pad alone with the keyboard up, max(inset, pad) with it down. Adding the safe-area inset on top of the keyboard is the one mistake this pattern exists to prevent.',
    },
    { id: 'spec-note', page: 'page-1', x: 0, y: ROW - 210, w: 1240, text: 'The ruling below is the contract for step 2 (ui-engineer). Section 5 is what gets built; sections 2, 6 and 7 are what a reviewer checks it against.' },
    { id: 'light-note', page: 'page-2', x: 0, y: -240, w: 1400, text: 'The light theme — same markup, same tokens. Every footer pair is measured on both grounds, in both themes, at 4.5 : 1 or better (ruling section 9).' },
  ],
  launch: { view: 'canvas', page: 'page-1' },
};
writeFileSync(join(OUT, 'canvas.json'), JSON.stringify(canvas, null, 2) + '\n');
console.log('wrote', Object.keys(files).length, 'artboards to', OUT);
