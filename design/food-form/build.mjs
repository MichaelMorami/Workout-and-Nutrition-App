// Vitals — food form canvas (issue #88): serving picker, custom weight/volume, nutrition per 100,
// live per-serving preview. Unblocks #89 (the form) and #93 (per-preset serving steps).
// Emits .dc.html artboards + canvas.json under design/food-form/canvas/.
// Every colour, type size, radius, size and step rule is read from src/theme/tokens.ts, so the
// canvas and the code cannot drift. Dark and light are generated from the same markup.
// Run: node design/food-form/build.mjs   (Node >= 23.6: imports the .ts tokens via native type stripping)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tokens from '../../src/theme/tokens.ts';

const { themes, fontInstances, space, radius, size, layout, motion, interaction, haptics, servingPresetKeys } = tokens;
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

const ico = (d, { sz = 20, w = size.icon.stroke, c = 'currentColor' } = {}) =>
  `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none">${d}</svg>`;
const I = {
  plus: '<path d="M12 5.6v12.8M5.6 12h12.8"/>',
  minus: '<path d="M5.6 12h12.8"/>',
  lock: '<rect x="5" y="10.4" width="14" height="10" rx="2.6"/><path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6"/>',
  back: '<path d="M14.8 5.6L8.4 12l6.4 6.4"/>',
};

/* ------------------------------------------------------------------ contrast (same maths as tokens.test.tsx) */
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

/* ------------------------------------------------------------------ copy + maths */
const CHIPS = [
  { key: '100g', label: '100 g' }, { key: '100ml', label: '100 ml' }, { key: 'cup', label: '1 cup' },
  { key: 'tbsp', label: '1 tbsp' }, { key: 'tsp', label: '1 tsp' }, { key: 'custom', label: 'Custom…' },
];
// Mirrors SERVING_PRESETS in src/db/servings.ts — drawn here only; the app reads the db table.
const PRESET = { '100g': ['weight', 100], '100ml': ['volume', 100], cup: ['volume', 250], tbsp: ['volume', 15], tsp: ['volume', 5] };
const unitOf = (basis) => (basis === 'weight' ? 'g' : 'ml');
const kcalFmt = (x) => Math.round(x).toLocaleString('en-GB');
const protFmt = (x) => (x < 10 ? (Math.round(x * 10) / 10).toString() : Math.round(x).toString());
const FRAC = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' };
const frac = (x) => { const w = Math.floor(x), f = FRAC[x - w]; return (w ? String(w) : '') + f || '0'; };

/* ------------------------------------------------------------------ chrome */
const W = 390, H = 844, STATUS = 59, HOME = 26, KEYBOARD = 336;
const G = layout.gutter;
const FF = size.foodForm;

function keyboardZone(c) {
  return `<div style="${s({ height: KEYBOARD + 'px', flex: 'none', background: c.bg.canvas, borderTop: `1px dashed ${c.line.strong}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' })}"><span style="${t('micro', { color: c.text.tertiary })}">System number pad</span><span style="${t('label', { color: c.text.tertiary })}">${KEYBOARD} pt · drawn by the phone, not by Vitals</span></div>`;
}

/* ------------------------------------------------------------------ form parts */
function fieldLabel(c, label, unit) {
  const F = c.foodForm;
  return `<span style="${s({ display: 'flex', alignItems: 'baseline', gap: space[2] + 'px' })}"><span style="${t('label', { color: F.fieldLabelText })}">${label}</span>${unit ? `<span style="${t('unit', { color: F.sectionMetaText })}">${unit}</span>` : ''}</span>`;
}

function field(c, label, value, { placeholder, focused = false, error = null, flex = '1' } = {}) {
  const F = c.foodForm;
  const border = error ? `1.5px solid ${F.fieldBorderError}` : focused ? `1.5px solid ${F.fieldBorderFocus}` : `1px solid ${F.fieldBorder}`;
  return `<div style="${s({ flex, minWidth: '0', display: 'flex', flexDirection: 'column', gap: space[2] + 'px' })}">
    ${fieldLabel(c, label)}
    <span style="${s({ height: FF.fieldHit + 'px', borderRadius: radius.md + 'px', background: F.fieldBg, border, display: 'flex', alignItems: 'center', padding: '0 12px', gap: '1px', minWidth: '0' })}"><span style="${t('input', { color: value ? F.inputText : F.placeholderText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}">${value || placeholder}</span>${focused ? `<span style="${s({ width: '2px', height: '22px', borderRadius: '1px', background: F.caret, flex: 'none' })}"></span>` : ''}</span>
    ${error ? `<span style="${t('label', { color: F.errorText })}">${error}</span>` : ''}
  </div>`;
}

function eyebrow(c, left, right) {
  const F = c.foodForm;
  return `<div style="${s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '16px' })}"><span style="${t('micro', { color: F.sectionText })}">${left}</span>${right ? `<span style="${t('label', { color: F.sectionMetaText })}">${right}</span>` : ''}</div>`;
}

/* state per chip: 'rest' | 'press' | 'selected' */
function chip(c, label, state = 'rest', width) {
  const F = c.foodForm, sel = state === 'selected';
  return `<span style="${s({ width: width ? width + 'px' : undefined, height: FF.chipHit + 'px', borderRadius: radius.md + 'px', background: sel ? F.chipSelectedBg : state === 'press' ? F.chipBgPress : F.chipBg, border: `${sel ? FF.chipBorderSelected : FF.chipBorder}px solid ${sel ? F.chipSelectedBorder : F.chipBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', color: sel ? F.chipSelectedText : F.chipText, ...TYPE[sel ? 'controlSelected' : 'control'] })}">${label}</span>`;
}

function chipGrid(c, selectedKey) {
  return `<div style="${s({ display: 'grid', gridTemplateColumns: `repeat(${FF.chipColumns}, minmax(0, 1fr))`, gap: FF.chipGap + 'px' })}">${CHIPS.map(({ key, label }) => chip(c, key === 'custom' && selectedKey === 'custom' ? 'Custom' : label, key === selectedKey ? 'selected' : 'rest')).join('')}</div>`;
}

function locked(c, key) {
  const F = c.foodForm, [basis, amount] = PRESET[key];
  const meta = 'Set by the preset. Pick Custom… to change it.';
  return `<div style="${s({ height: FF.lockedRowHeight + 'px', display: 'flex', alignItems: 'center', gap: space[3] + 'px', padding: '0 2px' })}">
    <span style="${s({ color: F.lockIcon })}">${ico(I.lock, { sz: FF.lockIcon + 2, w: 1.9 })}</span>
    <span style="${s({ display: 'flex', alignItems: 'baseline', gap: '4px' })}"><span style="${t('numericLg', { color: F.lockedAmountText })}">${amount}</span><span style="${t('unit', { color: F.lockedMetaText })}">${unitOf(basis)}</span></span>
    <span style="${t('label', { color: F.lockedMetaText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}">${meta}</span>
  </div>`;
}

function stepper(c, value, { color, unit, focused = false, width } = {}) {
  const S = c.stepper, F = c.foodForm;
  const btn = (d) => `<span style="${s({ width: FF.nutritionButtonWidth + 'px', height: FF.nutritionHit + 'px', flex: 'none', borderRadius: radius.md + 'px', background: S.buttonBg, border: `1px solid ${c.line.hairline}`, color: S.buttonIcon, display: 'flex', alignItems: 'center', justifyContent: 'center' })}">${ico(d, { sz: 18, w: 2.2 })}</span>`;
  return `<div style="${s({ display: 'flex', gap: space[1] + 'px', alignItems: 'center', width: width ? width + 'px' : undefined, flex: width ? 'none' : '1', minWidth: '0' })}">
    ${btn(I.minus)}
    <span style="${s({ flex: '1', minWidth: '0', height: FF.nutritionHit + 'px', borderRadius: radius.md + 'px', background: S.valueBg, border: focused ? `1.5px solid ${F.fieldBorderFocus}` : `1px solid ${c.line.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' })}"><span style="${t('stepperValue', { color: color || S.valueText })}">${value}</span>${focused ? `<span style="${s({ width: '2px', height: '22px', borderRadius: '1px', background: F.caret })}"></span>` : ''}${unit ? `<span style="${t('unit', { color: S.unitText })}">${unit}</span>` : ''}</span>
    ${btn(I.plus)}
  </div>`;
}

function segmented(c, opts, sel) {
  const C = c.segmented, P = size.portionSheet;
  return `<div style="${s({ display: 'flex', gap: '4px', padding: '4px', height: P.segmentHit + 'px', borderRadius: radius.md + 'px', background: C.trackBg, flex: '1', minWidth: '0' })}">${opts.map((o) => {
    const on = o === sel;
    return `<span style="${s({ flex: '1', minWidth: '0', height: P.segmentPainted + 'px', borderRadius: radius.sm + 'px', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', background: on ? C.selectedBg : 'transparent', border: `1px solid ${on ? C.selectedBorder : 'transparent'}`, color: on ? C.selectedText : C.optionText, ...TYPE[on ? 'controlSelected' : 'control'] })}">${o}</span>`;
  }).join('')}</div>`;
}

const STEP_W = FF.nutritionButtonWidth * 2 + space[1] * 2 + 86;
function customSlot(c, { label, basis, amount, labelFocused = false, error = null }) {
  return `<div style="${s({ display: 'flex', flexDirection: 'column', gap: space[4] + 'px' })}">
    ${field(c, 'Label', label, { placeholder: '1 scoop', focused: labelFocused, error })}
    <div style="${s({ display: 'flex', gap: space[4] + 'px', alignItems: 'flex-end' })}">
      <div style="${s({ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: space[2] + 'px' })}">${fieldLabel(c, 'Measured by')}${segmented(c, ['Weight', 'Volume'], basis === 'weight' ? 'Weight' : 'Volume')}</div>
      <div style="${s({ display: 'flex', flexDirection: 'column', gap: space[2] + 'px', flex: 'none' })}">${fieldLabel(c, 'Amount', unitOf(basis))}${stepper(c, amount, { width: STEP_W })}</div>
    </div>
  </div>`;
}

function nutrition(c, basis, kcal, prot, { focus = null } = {}) {
  const F = c.foodForm;
  const col = (label, unit, v, color, f) => `<div style="${s({ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: space[2] + 'px' })}">${fieldLabel(c, label, unit)}${stepper(c, v, { color, focused: f })}</div>`;
  return `<div style="${s({ display: 'flex', flexDirection: 'column', gap: space[3] + 'px' })}">
    ${eyebrow(c, `Per 100 ${unitOf(basis)}`, 'as printed on the pack')}
    <div style="${s({ display: 'flex', gap: FF.nutritionGap + 'px' })}">${col('Calories', 'kcal', kcal, F.kcalValueText, focus === 'kcal')}${col('Protein', 'g', prot, F.proteinValueText, focus === 'protein')}</div>
  </div>`;
}

function servingPhrase(label, basis, amount) {
  const amt = `${amount} ${unitOf(basis)}`;
  return label === amt ? amt : `${label || '1 serving'} (${amt})`;
}

function preview(c, { label, basis, amount, kcal100, prot100 }) {
  const F = c.foodForm;
  const k = kcal100 * amount / 100, p = prot100 * amount / 100;
  return `<div style="${s({ height: FF.previewHeight + 'px', borderRadius: radius.md + 'px', background: F.previewBg, display: 'flex', alignItems: 'center', gap: space[2] + 'px', padding: `0 ${space[5]}px` })}">
    <span style="${t('body', { color: F.previewServingText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: '0', flex: '0 1 auto' })}">${servingPhrase(label, basis, amount)}</span>
    <span style="${t('body', { color: F.previewUnitText, flex: 'none' })}">=</span>
    <span style="${s({ display: 'flex', alignItems: 'baseline', gap: '4px', flex: 'none', whiteSpace: 'nowrap' })}"><span style="${t('numericMd', { color: F.previewKcalText })}">${kcalFmt(k)}</span><span style="${t('caption', { color: F.previewUnitText })}">kcal</span><span style="${t('caption', { color: F.previewUnitText, padding: '0 2px' })}">·</span><span style="${t('numericMd', { color: F.previewProteinText })}">${protFmt(p)}</span><span style="${t('caption', { color: F.previewUnitText })}">g protein</span></span>
  </div>`;
}

function footer(c, pv, primary, { note = null, divider = false, home = true } = {}) {
  const F = c.foodForm, B = c.button;
  return `<div style="${s({ flex: 'none', background: F.footerBg, borderTop: `1px solid ${divider ? F.footerDivider : 'transparent'}`, padding: `${space[4]}px ${G}px ${home ? HOME + space[1] : space[4]}px`, display: 'flex', flexDirection: 'column', gap: space[4] + 'px' })}">
    ${preview(c, pv)}
    <div style="${s({ display: 'flex', gap: space[4] + 'px' })}">
      <span style="${s({ flex: '1', height: size.button.primaryHit + 'px', borderRadius: radius.md + 'px', border: `1px solid ${B.secondaryBorder}`, color: B.secondaryText, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPE.button })}">Cancel</span>
      <span style="${s({ flex: '2', height: size.button.primaryHit + 'px', borderRadius: radius.md + 'px', background: B.kcalBg, color: B.kcalText, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPE.button })}">${primary}</span>
    </div>
    ${note ? `<span style="${t('label', { color: F.historyNoteText, textAlign: 'center' })}">${note}</span>` : ''}
  </div>`;
}

/* The whole form body, top to bottom. */
function formBody(c, st) {
  const [basis] = st.key === 'custom' ? [st.basis] : PRESET[st.key];
  const slot = st.key === 'custom' ? customSlot(c, st) : locked(c, st.key);
  return `<div style="${s({ display: 'flex', flexDirection: 'column', gap: space[6] + 'px', padding: `${space[2]}px ${G}px ${space[6]}px` })}">
    <div style="${s({ display: 'flex', gap: space[4] + 'px' })}">${field(c, 'Name', st.name, { flex: '1.7' })}${field(c, 'Brand', st.brand, { placeholder: 'Optional' })}</div>
    <div style="${s({ display: 'flex', flexDirection: 'column', gap: space[3] + 'px' })}">
      ${eyebrow(c, 'Serving', basis === 'weight' ? 'Weight · grams' : 'Volume · millilitres')}
      ${chipGrid(c, st.key)}
      ${slot}
    </div>
    ${nutrition(c, basis, st.kcal100, st.prot100, { focus: st.focus })}
  </div>`;
}

function pv(st) {
  if (st.key === 'custom') return { label: st.label, basis: st.basis, amount: st.amount, kcal100: st.kcal100, prot100: st.prot100 };
  const [basis, amount] = PRESET[st.key];
  return { label: CHIPS.find((x) => x.key === st.key).label, basis, amount, kcal100: st.kcal100, prot100: st.prot100 };
}

function backdrop(c) {
  return `<div style="${s({ position: 'absolute', inset: '0', background: c.bg.canvas })}"><div style="${s({ height: STATUS + 'px' })}"></div><div style="${s({ padding: `0 ${layout.gutterToday}px`, ...TYPE.displayLg, color: c.text.primary })}">Today</div></div>`;
}

/* The create sheet (CreateFoodSheet) over Today. */
function sheetScreen(th, st, { keyboard = false, scrollTo = 0 } = {}) {
  const c = th.color;
  const saveLabel = `Save &amp; log ${st.key === 'custom' ? (st.label || '1 serving') : CHIPS.find((x) => x.key === st.key).label}`;
  const head = `<div style="${s({ flex: 'none', height: '52px', display: 'flex', alignItems: 'center', padding: `0 ${G}px` })}"><span style="${t('title', { color: c.portionSheet.titleText })}">New food</span></div>`;
  const sheet = `<div style="${s({ position: 'absolute', left: '0', right: '0', top: STATUS + size.searchSheet.topInset + 'px', bottom: '0', background: c.searchSheet.bg, borderRadius: `${radius.xl}px ${radius.xl}px 0 0`, boxShadow: th.shadow.sheet, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: '8px' })}">
    <div style="${s({ flex: 'none', width: size.searchSheet.grabberWidth + 'px', height: size.searchSheet.grabberHeight + 'px', borderRadius: '999px', background: c.searchSheet.grabber, margin: '0 auto' })}"></div>
    ${head}
    <div style="${s({ flex: '1', minHeight: '0', overflow: 'hidden', position: 'relative' })}"><div style="${s({ position: 'absolute', left: '0', right: '0', top: -scrollTo + 'px' })}">${formBody(c, st)}</div></div>
    ${footer(c, pv(st), saveLabel, { divider: keyboard || scrollTo > 0, home: !keyboard })}
    ${keyboard ? keyboardZone(c) : ''}
  </div>`;
  return `<div style="${s({ position: 'relative', width: W + 'px', height: H + 'px', overflow: 'hidden', fontFamily: FONT })}">${backdrop(c)}<div style="${s({ position: 'absolute', inset: '0', background: c.searchSheet.scrim })}"></div>${sheet}</div>`;
}

/* app/foods/[id] — a pushed stack screen on the canvas, no tab bar. */
function editScreen(th, st) {
  const c = th.color;
  const head = `<div style="${s({ flex: 'none', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: `0 ${G}px` })}">
    <span style="${s({ position: 'absolute', left: '8px', height: size.button.headerHit + 'px', display: 'flex', alignItems: 'center', gap: '2px', color: c.text.primary, ...TYPE.button })}">${ico(I.back, { sz: 24, w: 2.1 })}Foods</span>
    <span style="${t('headline', { color: c.text.primary })}">${st.name}</span>
  </div>`;
  return `<div style="${s({ position: 'relative', width: W + 'px', height: H + 'px', overflow: 'hidden', fontFamily: FONT, background: c.bg.canvas, display: 'flex', flexDirection: 'column' })}">
    <div style="${s({ height: STATUS + 'px', flex: 'none' })}"></div>
    ${head}
    <div style="${s({ flex: '1', minHeight: '0', overflow: 'hidden' })}">${formBody(c, st)}</div>
    ${footer({ ...c, foodForm: { ...c.foodForm, footerBg: c.bg.canvas } }, pv(st), 'Save changes', { note: 'Changes apply from now on. Past logs keep their numbers.' })}
  </div>`;
}

/* ------------------------------------------------------------------ the four required states + typing */
const S = {
  preset: { key: 'cup', name: 'Oat milk', brand: 'Oatly', kcal100: 46, prot100: 1 },
  customWeight: { key: 'custom', name: 'Whey protein', brand: 'MyProtein', label: '1 scoop', basis: 'weight', amount: 33, kcal100: 400, prot100: 76 },
  customVolume: { key: 'custom', name: 'Orange juice', brand: '', label: '1 glass', basis: 'volume', amount: 200, kcal100: 45, prot100: 0.7 },
  edit: { key: '100g', name: 'Greek yoghurt', brand: 'Fage', kcal100: 97, prot100: 9 },
  typing: { key: 'custom', name: 'Whey protein', brand: 'MyProtein', label: '1 scoop', basis: 'weight', amount: 33, kcal100: 400, prot100: 76, focus: 'protein' },
};

const screens = (th) => ({
  preset: sheetScreen(th, S.preset),
  customWeight: sheetScreen(th, S.customWeight),
  customVolume: sheetScreen(th, S.customVolume),
  edit: editScreen(th, S.edit),
  typing: sheetScreen(th, S.typing, { keyboard: true, scrollTo: 262 }),
});

/* ------------------------------------------------------------------ spec board */
const BOARD = '#101218', B1 = themes.dark.color.text.primary, B2 = themes.dark.color.text.secondary, B3 = themes.dark.color.text.tertiary;
const BHAIR = '#2A2E36', BSURF = '#181B21', ACC = themes.dark.color.data.kcal;
const hl = (x) => `<span style="color:${B1}">${x}</span>`;
const code = (x) => `<span style="${s({ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: '12px', color: B1 })}">${x}</span>`;
const callout = (txt, dot = ACC) => `<div style="${s({ display: 'flex', gap: '9px', alignItems: 'flex-start' })}"><span style="${s({ width: '5px', height: '5px', borderRadius: '999px', background: dot, marginTop: '7px', flex: 'none' })}"></span><span style="${t('label', { fontSize: '13px', lineHeight: '1.5', color: B2, textWrap: 'pretty' })}">${txt}</span></div>`;
const stack = (items, gap = 9) => `<div style="${s({ display: 'flex', flexDirection: 'column', gap: gap + 'px' })}">${items.join('\n')}</div>`;
const panel = (title, sub, inner) => `<div style="${s({ background: BSURF, border: `1px solid ${BHAIR}`, borderRadius: '20px', padding: '22px 24px', marginTop: '20px' })}">
  <div style="${t('title', { fontSize: '17px', color: B1 })}">${title}</div>
  ${sub ? `<div style="${t('label', { color: B2, marginTop: '7px', maxWidth: '1000px', textWrap: 'pretty' })}">${sub}</div>` : ''}
  <div style="${s({ marginTop: '16px' })}">${inner}</div>
</div>`;
const table = (head, rows, widths) => `<div style="${s({ display: 'flex', flexDirection: 'column' })}">
  <div style="${s({ display: 'flex', gap: '12px', paddingBottom: '8px', borderBottom: `1px solid ${BHAIR}` })}">${head.map((h, i) => `<span style="${t('microSm', { color: B3, width: widths[i] + 'px', flex: 'none' })}">${h}</span>`).join('')}</div>
  ${rows.map((r) => `<div style="${s({ display: 'flex', gap: '12px', padding: '9px 0', borderBottom: `1px solid ${BHAIR}`, alignItems: 'baseline' })}">${r.map((cell, i) => `<span style="${t('label', { fontSize: '13px', lineHeight: '1.45', color: i === 0 ? B1 : B2, width: widths[i] + 'px', flex: 'none', textWrap: 'pretty' })}">${cell}</span>`).join('')}</div>`).join('')}
</div>`;

function chipStates(th, name) {
  const c = th.color;
  const cell = (lab, st, note) => `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '8px', width: '112px' })}">${chip(c, lab, st, 112)}<span style="${t('caption', { color: c.text.tertiary })}">${note}</span></div>`;
  return `<div style="${s({ background: c.searchSheet.bg, borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' })}">
    <span style="${t('microSm', { color: c.text.tertiary })}">${name} · on the sheet</span>
    <div style="${s({ display: 'flex', gap: '14px' })}">${cell('1 cup', 'rest', 'Rest')}${cell('1 cup', 'press', 'Finger down')}${cell('1 cup', 'selected', 'Selected')}</div>
  </div>`;
}

function stepStrip(key) {
  const { increment, max } = interaction.servingSteps[key];
  const n = Math.round(max / increment);
  const c = themes.dark.color;
  return `<div style="${s({ display: 'flex', flexWrap: 'wrap', gap: '4px', width: '420px' })}">${Array.from({ length: n }, (_, i) => {
    const v = (i + 1) * increment, on = v === 1;
    return `<span style="${s({ minWidth: '30px', height: '24px', padding: '0 6px', borderRadius: radius.xs + 'px', background: on ? c.portionSheet.stepSelectedBg : c.portionSheet.stepBg, border: `1px solid ${on ? c.portionSheet.stepSelectedBg : c.portionSheet.stepBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: on ? c.portionSheet.stepSelectedText : c.portionSheet.stepText, ...TYPE.numericSm })}">${frac(v)}</span>`;
  }).join('')}</div>`;
}

const PAIRS = [
  ['foodForm.chipText', ['foodForm.chipBg']], ['foodForm.chipText', ['foodForm.chipBgPress']],
  ['foodForm.chipSelectedText', ['bg.surface', 'foodForm.chipSelectedBg']], ['foodForm.chipSelectedText', ['bg.canvas', 'foodForm.chipSelectedBg']],
  ['foodForm.lockedAmountText', ['bg.surface']], ['foodForm.lockedMetaText', ['bg.surface']], ['foodForm.lockIcon', ['bg.canvas']],
  ['foodForm.placeholderText', ['foodForm.fieldBg']], ['foodForm.errorText', ['bg.surface']],
  ['foodForm.kcalValueText', ['stepper.valueBg']], ['foodForm.proteinValueText', ['stepper.valueBg']],
  ['foodForm.previewServingText', ['foodForm.footerBg', 'foodForm.previewBg']], ['foodForm.previewUnitText', ['foodForm.footerBg', 'foodForm.previewBg']],
  ['foodForm.previewKcalText', ['foodForm.footerBg', 'foodForm.previewBg']], ['foodForm.previewProteinText', ['foodForm.footerBg', 'foodForm.previewBg']],
  ['foodForm.historyNoteText', ['bg.canvas']],
];

const STEP_REASON = {
  '100g': '50 g hops to 500 g: 50 g oats, 150 g rice, 250 g chicken. Finer amounts are Exact.',
  '100ml': '50 ml hops to 500 ml: a splash of milk, a 200 ml glass, a 500 ml bottle.',
  cup: 'Recipes measure cups in quarters (¼ cup oats, ¾ cup milk). Four cups is a litre.',
  tbsp: 'A drizzle of oil (¼) to ¼ cup (4). Past that the cup is the natural unit.',
  tsp: 'A pinch (¼) to one tablespoon (3). Past that the tablespoon is.',
  custom: 'Client ruling, 2026-09-15.',
};

function specBoard() {
  const D = themes.dark, L = themes.light;
  const taps = [
    ['New food, 100 g preset (the default)', '3 · bar, Create, Save', '2 · kcal, protein', 'Name comes from the query. 100 g is pre-selected, so most packs need no serving tap.'],
    ['New food, another preset (1 cup)', '3', '3 · chip, kcal, protein', 'One chip tap sets label, basis and amount together.'],
    ['New food, Custom weight (1 scoop, 33 g)', '3', '4 · Custom, amount, kcal, protein', 'Custom focuses the label field itself (no extra tap). Weight is carried over from 100 g.'],
    ['New food, Custom volume (1 glass, 200 ml)', '3', '5 · Custom, Volume, amount, kcal, protein', 'Basis carries over from the last chip, so from 100 ml / cup / tbsp / tsp it is 4.'],
    ['Edit an existing food', '1 · Save', 'only what changes', 'Opens pre-selected: its preset if label, basis and amount all match one, else Custom with its fields filled.'],
  ];
  return `<div style="${s({ width: '1240px', background: BOARD, padding: '36px 40px 48px', fontFamily: FONT, color: B1 })}">
  <div style="${t('displayLg', { fontSize: '30px', color: B1 })}">Food form — the spec</div>
  <div style="${t('body', { fontSize: '15.5px', color: B2, maxWidth: '980px', marginTop: '9px', textWrap: 'pretty' })}">Issue #88. The contract for #89 (the form) and #93 (serving steps). Every value on this page is read from ${code('src/theme/tokens.ts')}; the preset conversions come from ${code('SERVING_PRESETS')} in ${code('src/db/servings.ts')} and are not repeated in tokens.</div>

  ${panel('1 · The serving picker', 'Six chips in a fixed 3 × 2 grid. One line of six does not fit a 375 pt phone at a readable size, and a scrolling row would hide Custom… off-screen. Every chip is visible at once.', `<div style="${s({ display: 'flex', gap: '28px', alignItems: 'flex-start' })}">
    <div style="${s({ display: 'flex', flexDirection: 'column', gap: '12px' })}">${chipStates(D, 'Dark')}${chipStates(L, 'Light')}</div>
    ${stack([
      callout(`${hl('Chip')}: ${FF.chipHit} pt tall, full-width thirds, gap ${FF.chipGap} pt. Label ${code('type.control')}, fill ${code('foodForm.chipBg')}, 1 pt ${code('foodForm.chipBorder')}.`),
      callout(`${hl('Selected')}: calorie wash ${code('foodForm.chipSelectedBg')}, ${FF.chipBorderSelected} pt ${code('foodForm.chipSelectedBorder')}, bold label ${code('type.controlSelected')}. Shape and weight change as well as colour, so it reads in bad light and for colour-blind users.`),
      callout(`${hl('Tap')}: selects at once, fires ${code('haptics.servingPicked')} (${haptics.servingPicked.ios} / ${haptics.servingPicked.android}). Tapping the selected chip does nothing. No animation on the chip itself.`),
      callout(`${hl('Default')}: a new food opens on ${hl('100 g')}. Nutrition labels print per 100 g, so for most packs the serving is already right.`),
      callout(`${hl('Basis follows the chip')}: 100 g → weight; 100 ml, 1 cup, 1 tbsp, 1 tsp → volume. The SERVING eyebrow says which (“Weight · grams”), and the nutrition heading flips between “Per 100 g” and “Per 100 ml”. Numbers already typed stay; only their unit changes.`),
      callout(`${hl('Custom…')} reads “Custom” once selected. A custom serving belongs to its food and never becomes a chip.`),
    ])}
  </div>`)}

  ${panel('2 · Locked amount vs Custom fields', 'The same slot under the chips. A preset shows a read-only line; Custom opens three fields in its place, and the form grows downward so the chips never move under your thumb.', `<div style="${s({ display: 'flex', gap: '28px', alignItems: 'flex-start' })}">
    <div style="${s({ width: '390px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '14px' })}">
      <div style="${s({ background: D.color.bg.surface, borderRadius: '16px', padding: '10px 16px' })}">${locked(D.color, 'cup')}</div>
      <div style="${s({ background: D.color.bg.surface, borderRadius: '16px', padding: '14px 16px' })}">${customSlot(D.color, { label: '', basis: 'weight', amount: 33, error: 'Name the serving, e.g. 1 scoop.' })}</div>
    </div>
    ${stack([
      callout(`${hl('Locked, not disabled')}: padlock glyph, the amount in ${code('type.numericLg')}, and a line that says how to change it. No well, no border, no −/+ — nothing that looks tappable. Tokens ${code('foodForm.lockedAmountText')}, ${code('lockedMetaText')}, ${code('lockIcon')}; row ${FF.lockedRowHeight} pt.`),
      callout(`${hl('Custom')}: Label (text, placeholder “1 scoop”), Measured by (Weight | Volume, the existing ${code('segmented.*')} control), Amount (stepper, tap the value to type — #87). Picking Custom focuses Label, because typing it is the next thing you must do.`),
      callout(`${hl('Custom starts from the last chip')}: its basis and amount carry over (1 cup → Custom opens at Volume, 250 ml). Switching is never a reset.`),
      callout(`${hl('Motion')}: ${code('motion.events.customReveal')} — ${motion.events.customReveal.duration} ms, height + fade, interruptible. Reduce motion: ${motion.events.customReveal.reduced.kind}.`),
      callout(`${hl('Validation')}: Save with an empty Label outlines it in ${code('foodForm.fieldBorderError')} and prints the reason under it in ${code('foodForm.errorText')}. Never a dialog.`, D.color.state.danger),
    ])}
  </div>`)}

  ${panel('3 · Nutrition and the live preview', 'kcal and protein only (client ruling). Side-by-side steppers, entered per 100 of the basis, exactly as the pack prints them. The app does the maths for one serving, on the spot.', `<div style="${s({ display: 'flex', gap: '28px', alignItems: 'flex-start' })}">
    <div style="${s({ width: '390px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '14px' })}">
      <div style="${s({ background: D.color.bg.surface, borderRadius: '16px', padding: '14px 16px' })}">${nutrition(D.color, 'weight', 400, 76)}</div>
      <div style="${s({ background: D.color.bg.surface, borderRadius: '16px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' })}">
        ${preview(D.color, { label: '1 scoop', basis: 'weight', amount: 33, kcal100: 400, prot100: 76 })}
        ${preview(D.color, { label: '100 g', basis: 'weight', amount: 100, kcal100: 97, prot100: 9 })}
        ${preview(D.color, { label: '1 large slice of sourdough', basis: 'weight', amount: 60, kcal100: 250, prot100: 9 })}
      </div>
    </div>
    ${stack([
      callout(`${hl('Steppers')}: −/+ ${FF.nutritionButtonWidth} pt wide, ${FF.nutritionHit} pt tall, gap ${FF.nutritionGap} pt between the pair. The value well is the tap-to-type target (#87); the unit moves up to the label (“Calories kcal”) so the well holds 4 digits. Calories in ${code('foodForm.kcalValueText')}, protein in ${code('foodForm.proteinValueText')}.`, D.color.data.protein),
      callout(`${hl('Preview')}: “${hl('1 scoop (33 g) = 132 kcal · 25 g protein')}”, recalculated on every keystroke. ${FF.previewHeight} pt strip, ${code('foodForm.previewBg')}. When the label already is the amount (100 g), the bracket is dropped: “100 g = 97 kcal · 9 g protein”.`, D.color.data.protein),
      callout(`${hl('Numbers never truncate')}; a long label does, with an ellipsis. kcal rounds to a whole number; protein to one decimal under 10 g, whole above. Amounts render through ${code('formatGrams')} / ${code('formatMl')}.`, D.color.data.protein),
      callout(`${hl('Where it lives')}: in the sticky footer with Save, so it is always in view — and rides above the keyboard while you type (artboard “Typing”). The footer gains a ${code('foodForm.footerDivider')} hairline once content scrolls under it.`, D.color.data.protein),
    ])}
  </div>`)}

  ${panel('4 · Tap counts', `Counted the way ${code('test/tap-budget.test.tsx')} counts: fixed taps are bar, Create and Save; typing the name and numbers is the “plus name and numbers” carve-out. Form taps are listed separately so nothing hides. The search-to-Create budget stays at 3 fixed taps.`, table(['Path', 'Fixed taps', 'Form taps', 'Why'], taps.map((r) => [r[0], r[1], r[2], r[3]]), [260, 150, 250, 430]))}

  ${panel('5 · Serving steps per preset (issue #93)', `The portion sheet’s servings strip for a food, by its serving key. ${code('interaction.servingSteps')} in tokens.ts; ${code('max')} also opens the Exact slider’s range (#92). 1 = the food’s serving and is the pre-selected step. The strip is the fast path, not the only one — Exact and Custom cover the rest — so no strip is longer than 16 steps.`, `<div style="${s({ display: 'flex', flexDirection: 'column' })}">${[...servingPresetKeys, 'custom'].map((key) => {
      const { increment, max } = interaction.servingSteps[key];
      const label = CHIPS.find((x) => x.key === key).label.replace('…', '');
      return `<div style="${s({ display: 'flex', gap: '16px', padding: '12px 0', borderBottom: `1px solid ${BHAIR}`, alignItems: 'flex-start' })}">
        <span style="${t('tileName', { color: B1, width: '80px', flex: 'none' })}">${label}</span>
        <span style="${t('label', { fontSize: '13px', color: B2, width: '130px', flex: 'none' })}">step ${frac(increment)} · max ${max}</span>
        ${stepStrip(key)}
        <span style="${t('label', { fontSize: '13px', lineHeight: '1.45', color: B2, flex: '1', textWrap: 'pretty' })}">${STEP_REASON[key]}</span>
      </div>`;
    }).join('')}</div>`)}

  ${panel('6 · Contract for ui-engineer (#89)', 'Names the build must use. No colour, size or duration outside these.', `<div style="${s({ display: 'flex', gap: '28px' })}">
    ${stack([
      callout(`${hl('Colour')}: ${code('themes[name].color.foodForm.*')} for fields, eyebrows, chips, the locked read-out, nutrition values, the footer and preview. The Weight | Volume toggle keeps ${code('segmented.*')}; the steppers keep ${code('stepper.*')}; buttons keep ${code('button.*')}. The form no longer borrows ${code('searchSheet.*')}.`),
      callout(`${hl('Size')}: ${code('size.foodForm.*')} (chips, fields, locked row, nutrition steppers, preview). Buttons ${code('size.button.primaryHit')}.`),
      callout(`${hl('Motion / haptics')}: ${code('motion.events.customReveal')}, ${code('haptics.servingPicked')}.`),
      callout(`${hl('Steps')}: ${code('interaction.servingSteps[key]')}, keys ${code(servingPresetKeys.join(' · ') + ' · custom')}. Recommended to db-engineer: give each ${code('SERVING_PRESETS')} row the same ${code('key')}, so the UI never matches on a display label.`),
    ])}
    ${stack([
      callout(`${hl('testIDs')}: ${code('‹id›-serving-‹key›')} per chip (${code('-serving-cup')}, ${code('-serving-custom')}), ${code('‹id›-locked-amount')}, ${code('‹id›-serving-label')} (Custom only), ${code('‹id›-basis-weight|volume')}, ${code('‹id›-serving-amount')}, ${code('‹id›-kcal')}, ${code('‹id›-protein')}, ${code('‹id›-preview')}, ${code('‹id›-save')}, ${code('‹id›-cancel')}, ${code('‹id›-error')}.`),
      callout(`${hl('Heads-up')}: ${code('test/tap-budget.test.tsx')} types into ${code('-serving-label')} on a fresh Create form. Under this design that field exists only under Custom, so #89 needs qa-engineer to drop that line (the 100 g default needs no label). The 3 fixed taps do not change.`, D.color.state.danger),
      callout(`${hl('Save label')}: in the Create sheet “Save &amp; log ‹serving›” (“Save &amp; log 1 cup”); on ${code('/foods/new')} “Save food”; on ${code('/foods/[id]')} “Save changes” with the history note under it.`),
    ])}
  </div>`)}

  ${panel('7 · Contrast, both themes', `Measured from the tokens, composited like ${code('tokens.test.tsx')} does. Floor 4.5 : 1.`, table(['Foreground', 'On', 'Dark', 'Light'], PAIRS.map(([fg, on]) => [code(fg), on.join(' + '), ratio(D, fg, on).toFixed(2), ratio(L, fg, on).toFixed(2)]), [300, 380, 100, 100]))}
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

const D = themes.dark, Lt = themes.light;
const dark = screens(D), light = screens(Lt);
const BOARDS = [
  ['preset', 'Preset — 1 cup, new food from Create', 'Preset'],
  ['customWeight', 'Custom — weight (1 scoop, 33 g)', 'CustomWeight'],
  ['customVolume', 'Custom — volume (1 glass, 200 ml)', 'CustomVolume'],
  ['edit', 'Edit existing — preset pre-selected', 'Edit'],
  ['typing', 'Typing — preview rides the keyboard', 'Typing'],
];
const files = {};
for (const [key, , file] of BOARDS) {
  files[`${file}.dc.html`] = dc(dark[key], D.color.bg.canvas);
  files[`${file}Light.dc.html`] = dc(light[key], Lt.color.bg.canvas);
}
files['Spec.dc.html'] = dc(specBoard(), BOARD);
for (const [name, html] of Object.entries(files)) writeFileSync(join(OUT, name), html);

const GAP = 110, ROW = H + 260, SPEC_H = 3480;
const canvas = {
  pages: [
    { id: 'page-1', name: 'Food form — dark + spec' },
    { id: 'page-2', name: 'Food form — light' },
  ],
  artboards: [
    ...BOARDS.map(([, title, file], i) => ({ file: `${file}.dc.html`, title, x: i * (W + GAP), y: 0, w: W, h: H, page: 'page-1' })),
    { file: 'Spec.dc.html', title: 'Spec — picker, locked vs custom, preview, taps, steps, contrast', x: 0, y: ROW, w: 1240, h: SPEC_H, page: 'page-1' },
    ...BOARDS.map(([, title, file], i) => ({ file: `${file}Light.dc.html`, title: `${title} — light`, x: i * (W + GAP), y: 0, w: W, h: H, page: 'page-2' })),
  ],
  annotations: [
    { id: 'brief', page: 'page-1', x: 0, y: -300, w: 1380, text: 'ISSUE #88 — THE FOOD FORM\n\nPick a serving from six chips: 100 g · 100 ml · 1 cup · 1 tbsp · 1 tsp · Custom…. A preset fills the amount and locks it; Custom asks for a label, weight or volume, and the amount. Nutrition goes underneath, per 100 g or per 100 ml — as printed on the pack — and the line above Save shows what one serving comes to, as you type.\n\nMetric: 1 cup = 250 ml, 1 tbsp = 15 ml, 1 tsp = 5 ml. kcal and protein only.' },
    { id: 'taps', page: 'page-1', x: 1500, y: -300, w: 880, text: 'TAPS\n\nA new food from search is still 3 fixed taps (bar, Create, Save). Inside the form: 100 g is pre-selected, so a typical pack is kcal + protein and Save. Another preset adds one chip tap. Custom adds the chip plus its amount; volume one more.' },
    { id: 'steps', page: 'page-1', x: 0, y: ROW - 200, w: 1240, text: 'The spec below is the contract for ui-engineer (#89) and holds the serving-step table for #93 (section 5).' },
    { id: 'light-note', page: 'page-2', x: 0, y: -220, w: 1380, text: 'The light theme — same markup, same tokens. Every text pair on these boards is measured at 4.5 : 1 or better in both themes (spec section 7).' },
  ],
  launch: { view: 'canvas', page: 'page-1' },
};
writeFileSync(join(OUT, 'canvas.json'), JSON.stringify(canvas, null, 2) + '\n');
console.log('wrote', Object.keys(files).length, 'artboards to', OUT);
