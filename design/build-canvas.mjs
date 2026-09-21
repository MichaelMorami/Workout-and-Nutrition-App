// Vitals — design canvas generator.
// Emits the .dc.html artboards + canvas.json under design/canvas/.
// Every colour, type size, radius, duration and contrast figure is read from src/theme/tokens.ts, so
// the canvas and the code cannot drift. Dark and light are generated from the same markup.
// Run: node design/build-canvas.mjs   (Node >= 23.6: imports the .ts tokens via native type stripping)
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tokens from '../src/theme/tokens.ts';

const { themes, fontInstances, space, radius, size, layout, motion, interaction, haptics, contrastPairs, MIN_TEXT_CONTRAST } = tokens;
const TT = tokens.type;
const EV = motion.events;

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'canvas');
mkdirSync(OUT, { recursive: true });
const D = JSON.parse(readFileSync(join(HERE, 'chart-data.json'), 'utf8'));

/* ------------------------------------------------------------------ palette */
const hexA = (o) => Math.round(o * 255).toString(16).padStart(2, '0').toUpperCase();
function adapt(th) {
  const c = th.color;
  return {
    name: th.name, c,
    canvas: c.bg.canvas, surface: c.bg.surface, raised: c.bg.raised, tile: c.bg.tile, press: c.bg.press,
    floating: c.bg.floating, scrim: c.bg.scrim,
    hair: c.line.hairline, line: c.line.strong, ghost: c.line.ghost,
    t1: c.text.primary, t2: c.text.secondary, t3: c.text.tertiary,
    onKcal: c.text.onKcal, onStr: c.text.onStrength, onBody: c.text.onBody,
    kcal: c.data.kcal, kcalDim: c.data.kcalMuted, kcalWash: c.wash.kcal,
    prot: c.data.protein, protDim: c.data.proteinMuted,
    body: c.data.body, bodyDim: c.data.bodyMuted, bodyWash: c.wash.body,
    str: c.data.strength, strWash: c.wash.strength,
    danger: c.state.danger, ok: c.state.success,
    glow: (col) => (th.glow.ringOpacity > 0 ? `drop-shadow(0 0 ${th.glow.ringRadius}px ${col}${hexA(th.glow.ringOpacity)})` : 'none'),
    shadow: th.shadow.card, tileShadow: th.shadow.tile, sheetShadow: th.shadow.sheet, floatShadow: th.shadow.floating,
    ctaStr: th.shadow.ctaStrength, thumbShadow: th.shadow.sliderThumb,
  };
}
const DARK = adapt(themes.dark);
const LIGHT = adapt(themes.light);
const get = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);

/* ------------------------------------------------------------------ helpers */
const s = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':' + v).join(';');
const FONT = "Archivo,'Helvetica Neue',Helvetica,system-ui,sans-serif";
const r4 = (x) => Math.round(x * 10000) / 10000;

// type ramp: each tokens.ts role rendered with the variable font at its instance's exact axes.
// Line height and tracking are emitted as ratios so a size override scales them, as in the app.
const TYPE = Object.fromEntries(Object.entries(TT).map(([role, st]) => {
  const f = fontInstances[st.fontFamily];
  return [role, {
    fontSize: st.fontSize + 'px', fontWeight: f.wght, fontStretch: f.wdth + '%',
    letterSpacing: r4(st.letterSpacing / st.fontSize) + 'em', lineHeight: String(r4(st.lineHeight / st.fontSize)),
    textTransform: st.textTransform,
  }];
}));
const t = (k, extra = {}) => s({ ...TYPE[k], ...extra });

/* icons — 24px grid, stroke-based, one style */
const ico = (d, o = {}) => {
  const { size: sz = 22, w = size.icon.stroke, c = 'currentColor', fill = 'none' } = o;
  return `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${fill}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none">${d}</svg>`;
};
const I = {
  today: '<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6a8.4 8.4 0 0 1 8.4 8.4" stroke-width="2.9"/>',
  workout: '<path d="M4.2 9.2v5.6M7.4 6.9v10.2M16.6 6.9v10.2M19.8 9.2v5.6M7.4 12h9.2"/>',
  charts: '<path d="M4 4.4v15.2h15.6"/><path d="M7.4 15.4l3.6-4.6 3 2.9 4.4-6.1"/>',
  settings: '<path d="M4 7.5h5M13 7.5h7M4 16.5h7M15 16.5h5"/><circle cx="11" cy="7.5" r="2.1"/><circle cx="13" cy="16.5" r="2.1"/>',
  plus: '<path d="M12 5.6v12.8M5.6 12h12.8"/>',
  search: '<circle cx="11" cy="11" r="6.6"/><path d="M15.9 15.9L20 20"/>',
  check: '<path d="M5.2 12.6l4.6 4.6L18.9 7"/>',
  minus: '<path d="M5.6 12h12.8"/>',
  x: '<path d="M7.4 7.4l9.2 9.2M16.6 7.4l-9.2 9.2"/>',
  chev: '<path d="M9.6 5.6L16 12l-6.4 6.4"/>',
  scale: '<rect x="3.2" y="4.6" width="17.6" height="14.8" rx="3.4"/><path d="M7.6 15.4a4.4 4.4 0 0 1 8.8 0"/><path d="M12 15.4l2.6-3.6"/>',
  play: '<path d="M8.4 5.6l10 6.4-10 6.4z" stroke-linejoin="round"/>',
  layers: '<path d="M12 3.6l8.2 4.1-8.2 4.1-8.2-4.1z"/><path d="M3.8 12.6l8.2 4.1 8.2-4.1"/>',
  cloud: '<path d="M7.4 18.4a4.2 4.2 0 0 1-.3-8.4 5.4 5.4 0 0 1 10.4 1.1 3.7 3.7 0 0 1-.5 7.3z"/>',
  flag: '<path d="M5.6 20.4V4.2M5.6 5.2h11.8l-2.2 3.8 2.2 3.8H5.6"/>',
  dots: '<circle cx="5.6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.4" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  user: '<circle cx="12" cy="8.4" r="3.8"/><path d="M4.8 19.8a7.6 7.6 0 0 1 14.4 0"/>',
  skip: '<path d="M6.4 6l7.2 6-7.2 6zM17.2 5.6v12.8"/>',
};

/* ------------------------------------------------------------------ chrome */
const W = 390;
const STATUS = 59;   // real OS status bar lives here — we paint nothing into it
const TABH = size.tabBar.height, HOMEH = 26;
const KEYBOARD = 336; // the phone's own keyboard; reserved, never drawn

function tabbar(T, active) {
  const C = T.c.tabBar;
  const tabs = [['Today', I.today], ['Workout', I.workout], ['Charts', I.charts], ['Settings', I.settings]];
  const accent = { Today: C.todayActiveText, Workout: C.workoutActiveText, Charts: C.chartsActiveText, Settings: C.settingsActiveText }[active];
  return `<nav style="${s({ position: 'absolute', left: 0, right: 0, bottom: 0, height: TABH + HOMEH + 'px', paddingBottom: HOMEH + 'px', display: 'flex', background: C.bg, borderTop: `1px solid ${C.border}` })}">
${tabs.map(([n, d]) => {
    const on = n === active;
    return `  <div style="${s({ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', height: TABH + 'px', color: on ? accent : C.inactiveText })}">${ico(d, { size: size.icon.tab, w: on ? size.icon.strokeActive : 1.7 })}<span style="${t(on ? 'tabLabelActive' : 'tabLabel')}">${n}</span></div>`;
  }).join('\n')}
</nav>`;
}

function phone(T, { height = 844, body, active, over = '' }) {
  return `<div style="${s({ position: 'relative', width: W + 'px', height: height + 'px', background: T.canvas, color: T.t1, overflow: 'hidden', fontFamily: FONT })}">
<div style="${s({ height: STATUS + 'px' })}"></div>
${body}
${tabbar(T, active)}
${over}
</div>`;
}

function card(T, inner, extra = {}) {
  return `<div style="${s({ background: T.c.card.bg, borderRadius: radius.card + 'px', border: `1px solid ${T.c.card.border}`, boxShadow: T.shadow, padding: layout.cardPadding + 'px', ...extra })}">${inner}</div>`;
}

function sectionLabel(T, left, right, ground = 'canvas') {
  const C = T.c.sectionLabel;
  return `<div style="${s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '16px' })}" data-ground="${ground}"><span style="${t('micro', { color: C.labelText })}">${left}</span><span style="${t('micro', { color: C.metaText, letterSpacing: '0.1em' })}">${right}</span></div>`;
}

/* ------------------------------------------------------- the quick-add tile */
/* state: 'rest' | 'press' | 'logged' | 'repeat' | 'ghost' */
function tile(T, f, state = 'rest', scale = 1) {
  const C = T.c.tile;
  const H = size.tile.height * scale, R = radius.lg * scale;
  const repeat = state === 'repeat';
  const logged = state === 'logged' || repeat, press = state === 'press', ghost = state === 'ghost';
  const bg = logged ? C.bgLogged : press ? C.bgPress : ghost ? 'transparent' : C.bg;
  const bd = logged ? C.borderLogged : ghost ? C.ghostBorder : C.border;
  const box = {
    position: 'relative', height: H + 'px', borderRadius: R + 'px', background: bg,
    border: `${logged ? size.tile.borderLogged : 1}px ${ghost ? 'dashed' : 'solid'} ${bd}`,
    boxShadow: ghost || logged ? 'none' : T.tileShadow,
    padding: `${space[4] * scale}px ${space[5] * scale}px`, display: 'flex', flexDirection: 'column',
    justifyContent: 'space-between', overflow: 'hidden',
    transform: press ? `scale(${size.tile.pressScale})` : undefined,
  };
  if (ghost) return `<div style="${s(box)}"></div>`;
  const px = (role) => TT[role].fontSize * scale + 'px';
  const nameStyle = s({ ...TYPE.tileName, fontSize: px('tileName'), color: C.nameText, display: '-webkit-box', WebkitLineClamp: String(size.tile.nameLines), WebkitBoxOrient: 'vertical', overflow: 'hidden', paddingRight: repeat ? 24 * scale + 'px' : undefined });
  const num = (v, u, c) => `<span style="${s({ display: 'flex', alignItems: 'baseline', gap: 4 * scale + 'px' })}"><span style="${s({ ...TYPE.numeric, fontSize: px('numeric'), color: c })}">${v}</span><span style="${s({ ...TYPE.unit, fontSize: px('unit'), color: C.unitText })}">${u}</span></span>`;
  const foot = logged
    ? `<span style="${s({ display: 'flex', alignItems: 'center', gap: 6 * scale + 'px', color: C.loggedText })}">${ico(I.check, { size: 15 * scale, w: 2.6 })}<span style="${s({ ...TYPE.numericSm, fontSize: px('numericSm'), color: C.loggedText })}">Logged</span></span>`
    : `<span style="${s({ display: 'flex', alignItems: 'baseline', gap: 8 * scale + 'px' })}">${num(f.k, 'kcal', C.kcalText)}${num(f.p, 'P', C.proteinText)}</span>`;
  const badge = repeat
    ? `<span style="${s({ position: 'absolute', top: 8 * scale + 'px', right: 8 * scale + 'px', width: size.tile.repeatBadge * scale + 'px', height: size.tile.repeatBadge * scale + 'px', borderRadius: '999px', background: C.repeatBadgeBg, color: C.repeatBadgeText, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPE.numericXs, fontSize: 11 * scale + 'px' })}">×2</span>`
    : '';
  return `<div style="${s(box)}">${badge}
  <div style="${s({ display: 'flex', gap: 6 * scale + 'px', alignItems: 'flex-start' })}">${f.meal ? `<span style="${s({ color: logged ? C.loggedMealIcon : C.mealIcon, marginTop: 1 * scale + 'px', flex: 'none' })}">${ico(I.layers, { size: 14 * scale, w: 1.9 })}</span>` : ''}<span style="${nameStyle}">${f.n}</span></div>
  <div style="${s({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 * scale + 'px' })}">${foot}<span style="${s({ ...TYPE.caption, fontSize: px('caption'), color: logged ? C.loggedServingText : C.servingText, whiteSpace: 'nowrap' })}">${f.s}</span></div>
</div>`;
}

/* ------------------------------------------------------ the search foods bar */
/* state: 'rest' | 'press' | 'emphasis' (day one) */
function searchBar(T, state = 'rest') {
  const C = T.c.searchBar, em = state === 'emphasis';
  return `<div style="${s({ height: size.searchBar.height + 'px', borderRadius: radius.lg + 'px', background: state === 'press' ? C.bgPress : C.bg, border: em ? `1.5px solid ${C.borderEmphasis}` : `1px solid ${C.border}`, boxShadow: T.tileShadow, padding: `0 ${space[6]}px`, display: 'flex', alignItems: 'center', gap: space[4] + 'px' })}"><span style="${s({ color: em ? C.emphasisIcon : C.searchIcon, flex: 'none' })}">${ico(I.search, { size: size.icon.md, w: 2 })}</span><span style="${t(em ? 'button' : 'body', { color: em ? C.emphasisLabelText : C.labelText })}">${em ? 'Add your first food' : 'Search foods'}</span></div>`;
}

/* --------------------------------------------------------------- undo toast */
function toast(T, { title, meta }, { inline = false } = {}) {
  const C = T.c.toast;
  const place = inline
    ? { position: 'relative' }
    : { position: 'absolute', left: layout.gutter + 'px', right: layout.gutter + 'px', bottom: TABH + HOMEH + layout.floatAboveTabBar + 'px' };
  return `<div style="${s({ ...place, height: size.toast.height + 'px', borderRadius: radius.xl + 'px', background: C.bg, border: `1px solid ${C.border}`, boxShadow: T.floatShadow, padding: `0 10px 0 ${space[6]}px`, display: 'flex', alignItems: 'center', gap: space[5] + 'px' })}">
  <span style="${s({ color: C.checkIcon, flex: 'none' })}">${ico(I.check, { size: 20, w: 2.4 })}</span>
  <span style="${s({ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1', minWidth: '0' })}"><span style="${t('tileName', { color: C.titleText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}">${title}</span><span style="${t('label', { color: C.metaText, whiteSpace: 'nowrap' })}">${meta}</span></span>
  <span style="${s({ flex: 'none', minWidth: size.toast.undoMinWidth + 'px', height: size.toast.undoHit + 'px', padding: '0 16px', borderRadius: radius.md + 'px', background: C.undoBg, color: C.undoText, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPE.button })}">Undo</span>
</div>`;
}

/* --------------------------------------------------------------- ring gauge */
/* Past target the first lap drops to muted, the overage is drawn as a knocked-out second lap, and a
   target tick crosses the ring at 12 o'clock — shape and words carry "over", not hue alone. */
function ring(T, { value, target, label, color, dim, shown, of, dia = size.arc.diameter, sw = size.arc.stroke }) {
  const A = T.c.arc;
  const r = (dia - sw) / 2, C = 2 * Math.PI * r, cx = dia / 2;
  const circle = (stroke, width, extra = '') => `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${width}"${extra}/>`;
  let strokes;
  if (value <= target) {
    const off = C * (1 - value / target);
    strokes = circle(A.track, sw) + circle(color, sw, ` stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"`);
  } else {
    const lap = C * Math.min(1, (value - target) / target), k = size.arc.overKnockout, L = size.arc.targetTickLength;
    const dash = ` stroke-linecap="round" stroke-dasharray="${lap.toFixed(1)} ${C.toFixed(1)}"`;
    strokes = circle(dim, sw) + circle(A.overKnockout, sw + 2 * k, dash) + circle(color, sw, dash)
      + `<line x1="${cx + r - L / 2}" y1="${cx}" x2="${cx + r + L / 2}" y2="${cx}" stroke="${A.targetTickIcon}" stroke-width="${size.arc.targetTickWidth}" stroke-linecap="round"/>`;
  }
  return `<div style="${s({ position: 'relative', width: dia + 'px', height: dia + 'px', flex: 'none' })}">
    <svg width="${dia}" height="${dia}" viewBox="0 0 ${dia} ${dia}" style="display:block;transform:rotate(-90deg);filter:${T.glow(color)}">${strokes}</svg>
    <div style="${s({ position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' })}">
      <div style="${t('microSm', { color: A.labelText })}">${label}</div>
      <div style="${t('displayXl', { color: A.valueText })}">${shown}</div>
      <div style="${t('ringCaption', { color: A.captionText })}">of ${of}</div>
    </div>
  </div>`;
}

/* =================================================================== TODAY */
const FOODS = [
  { n: 'Whey + Milk', k: 285, p: 42, s: '1 shake', meal: true },
  { n: 'Skyr Pot', k: 120, p: 20, s: '1 pot' },
  { n: 'Chicken Breast', k: 165, p: 31, s: '100 g' },
  { n: 'Banana', k: 105, p: 1, s: '1 medium' },
  { n: 'Rice, cooked', k: 195, p: 4, s: '150 g' },
  { n: 'Peanut Butter', k: 190, p: 7, s: '2 tbsp' },
];
const LOG = [
  ['16:04', 'Whey + Milk', 285, 42],
  ['13:20', 'Chicken & Rice', 520, 44],
  ['09:15', 'Skyr + Banana', 225, 21],
];

function chip(T, { icon, label, value, sub, accent, spark, cta }) {
  const C = T.c.chip;
  return `<div style="${s({ flex: '1', minWidth: '0', height: size.chip.height + 'px', background: C.bg, border: `1px solid ${T.hair}`, borderRadius: radius.lg + 'px', boxShadow: T.tileShadow, padding: `0 ${space[5]}px`, display: 'flex', alignItems: 'center', gap: space[4] + 'px' })}">
  <span style="${s({ color: accent, flex: 'none' })}">${ico(icon, { size: size.icon.md, w: 1.8 })}</span>
  <span style="${s({ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '0', flex: '1' })}">
    <span style="${t('microSm', { color: C.labelText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}">${label}</span>
    <span style="${s({ display: 'flex', alignItems: 'baseline', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden' })}"><span style="${t('numericMd', { color: C.valueText })}">${value}</span>${sub ? `<span style="${t('caption', { fontWeight: 650, color: accent })}">${sub}</span>` : ''}</span>
  </span>
  ${spark ? `<svg width="38" height="18" viewBox="0 0 96 28" preserveAspectRatio="none" style="display:block;flex:none"><path d="${D.spark}" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
  ${cta ? `<span style="${s({ flex: 'none', width: size.chip.cta + 'px', height: size.chip.cta + 'px', borderRadius: '999px', background: C.workoutCtaBg, color: C.workoutCtaIcon, display: 'flex', alignItems: 'center', justifyContent: 'center' })}">${ico(cta, { size: 15, w: 2, fill: 'currentColor' })}</span>` : ''}
</div>`;
}

function todayScreen(T, { empty = false, tiles = ['logged', 'rest', 'rest', 'rest', 'rest', 'rest'], toastData = null } = {}) {
  const PAD = layout.gutterToday;
  const A = T.c.arc, L = T.c.logRow;
  const head = `<header style="${s({ height: '48px', padding: `0 ${PAD}px`, display: 'flex', alignItems: 'center' })}">
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '4px' })}">
    <div style="${t('displayLg', { color: T.t1 })}">Today</div>
    <div style="${t('label', { color: T.t3 })}">Wed 10 Sep · 4:12 PM</div>
  </div>
</header>`;

  const kcalNow = empty ? 0 : 1240, protNow = empty ? 0 : 96;
  const ringCol = (inner, caption, col) => `<div style="${s({ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' })}">${inner}<div style="${t('label', { fontWeight: 650, color: col })}">${caption}</div></div>`;
  const rings = card(T, `<div style="${s({ display: 'flex', gap: space[4] + 'px' })}">
  ${ringCol(ring(T, { value: kcalNow, target: 2400, shown: kcalNow.toLocaleString('en-GB'), of: '2,400', label: 'Kcal', color: A.kcal, dim: A.kcalOverBase }), `${empty ? '2,400' : '1,160'} left`, A.kcalText)}
  <div style="${s({ width: '1px', background: T.hair, margin: '6px 0' })}"></div>
  ${ringCol(ring(T, { value: protNow, target: 180, shown: protNow, of: '180 g', label: 'Protein', color: A.protein, dim: A.proteinOverBase }), `${empty ? '180' : '84'} g left`, A.proteinText)}
</div>`);

  const grid = (inner) => `<div style="${s({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: layout.tileGap + 'px' })}">${inner}</div>`;
  const quick = empty
    ? `<div style="${s({ display: 'flex', flexDirection: 'column', gap: layout.tileGap + 'px' })}">
  ${grid([0, 1, 2, 3, 4, 5].map(() => tile(T, {}, 'ghost')).join(''))}
  ${searchBar(T, 'emphasis')}
  <div style="${t('label', { color: T.t3, textAlign: 'center', textWrap: 'pretty', padding: '0 10px' })}">Your six most-eaten foods land here, ranked by the hour you normally eat them. One tap logs one.</div>
</div>`
    : `<div style="${s({ display: 'flex', flexDirection: 'column', gap: layout.tileGap + 'px' })}">
  ${grid(FOODS.map((f, i) => tile(T, f, tiles[i])).join('\n'))}
  ${searchBar(T)}
</div>`;

  const chips = `<div style="${s({ display: 'flex', gap: space[4] + 'px' })}">
${chip(T, empty
    ? { icon: I.scale, label: 'Weight', value: 'Log it', sub: 'day one', accent: T.c.chip.weightAccentText }
    : { icon: I.scale, label: 'Weight', value: '83.4', sub: '−0.4 kg', accent: T.c.chip.weightAccentText, spark: true })}
${chip(T, empty
    ? { icon: I.workout, label: 'Workout', value: 'Start', sub: 'first', accent: T.c.chip.workoutAccentText, cta: I.play }
    : { icon: I.workout, label: 'Workout', value: 'Push A', sub: '4d', accent: T.c.chip.workoutAccentText, cta: I.play })}
</div>`;

  const logRows = empty
    ? `<div style="${s({ marginTop: '8px', border: `1px dashed ${T.ghost}`, borderRadius: radius.lg + 'px', padding: '20px 16px', textAlign: 'center' })}"><div style="${t('tileName', { color: T.t2 })}">Nothing logged yet</div><div style="${t('label', { color: T.t3, marginTop: '4px' })}">Today starts at zero. That is the point.</div></div>`
    : `<div style="${s({ marginTop: '4px' })}">
${LOG.map(([time, name, k, p], i) => `  <div style="${s({ height: size.row.log + 'px', display: 'flex', alignItems: 'center', gap: space[4] + 'px', borderTop: i === 0 ? 'none' : `1px solid ${L.divider}` })}">
    <span style="${t('numericXs', { color: L.timeText, width: '38px' })}">${time}</span>
    <span style="${t('body', { color: L.nameText, flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}">${name}</span>
    <span style="${t('numericSm', { color: L.kcalText })}">${k}</span>
    <span style="${t('numericSm', { color: L.proteinText, width: '34px', textAlign: 'right' })}">${p} P</span>
  </div>`).join('\n')}
</div>`;

  const body = `<div style="${s({ position: 'absolute', top: STATUS + 'px', left: 0, right: 0, bottom: (TABH + HOMEH) + 'px', display: 'flex', flexDirection: 'column' })}">
${head}
<div style="${s({ padding: `10px ${PAD}px 0`, display: 'flex', flexDirection: 'column', gap: layout.cardGap + 'px', flex: '1', minHeight: '0' })}">
${rings}
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: space[3] + 'px' })}">${sectionLabel(T, 'Quick add', empty ? 'Day one' : 'Ranked for 4 PM')}${quick}</div>
${chips}
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1', minHeight: '0', overflow: 'hidden', WebkitMaskImage: 'linear-gradient(180deg,#000 55%,transparent)' })}">${sectionLabel(T, "Today's log", empty ? '0 items' : '5 items · 1,240 kcal')}${logRows}</div>
</div>
</div>`;
  return phone(T, { body, active: 'Today', over: toastData ? toast(T, toastData) : '' });
}

/* ================================================================= WORKOUT */
function stepperRow(T, { unit, value }) {
  const C = T.c.stepper;
  const btn = (icon) => `<span style="${s({ width: size.stepper.buttonWidth + 'px', height: size.stepper.buttonHit + 'px', flex: 'none', borderRadius: radius.md + 'px', background: C.buttonBg, border: `1px solid ${T.hair}`, color: C.buttonIcon, display: 'flex', alignItems: 'center', justifyContent: 'center' })}">${ico(icon, { size: 20, w: 2.2 })}</span>`;
  return `<div style="${s({ display: 'flex', gap: '6px', alignItems: 'center' })}">
  ${btn(I.minus)}
  <span style="${s({ flex: '1', height: size.stepper.buttonHit + 'px', borderRadius: radius.md + 'px', background: C.valueBg, border: `1px solid ${T.hair}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' })}"><span style="${t('stepperValue', { color: C.valueText })}">${value}</span><span style="${t('unit', { fontSize: '11.5px', color: C.unitText, letterSpacing: '0.08em', textTransform: 'uppercase' })}">${unit}</span></span>
  ${btn(I.plus)}
</div>`;
}

function workoutScreen(T, { empty = false } = {}) {
  const PAD = layout.gutter, S = T.c.set, R = T.c.restBar;
  if (empty) {
    const body = `<div style="${s({ position: 'absolute', top: STATUS + 'px', left: 0, right: 0, bottom: (TABH + HOMEH) + 'px', display: 'flex', flexDirection: 'column', padding: `0 ${PAD}px` })}">
  <header style="${s({ height: '48px', display: 'flex', alignItems: 'center', padding: '0 4px' })}"><div style="${t('displayLg', { color: T.t1 })}">Workout</div></header>
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: space[5] + 'px', marginTop: '10px' })}">
    <div style="${s({ height: size.button.ctaHit + 'px', borderRadius: radius.xl + 'px', background: T.c.button.strengthBg, color: T.c.button.strengthText, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: T.ctaStr })}">${ico(I.play, { size: 22, w: 2, fill: 'currentColor' })}<span style="${t('ctaLarge')}">Start an empty session</span></div>
    <div style="${s({ height: '60px', borderRadius: radius.lg + 'px', border: `1px solid ${T.c.button.secondaryBorder}`, color: T.c.button.secondaryText, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' })}">${ico(I.plus, { size: 19 })}<span style="${t('tileName')}">Build a routine</span></div>
  </div>
  ${card(T, `<div style="${t('micro', { color: T.str })}">After session one</div><div style="${t('tileName', { color: T.t1, marginTop: '8px', textWrap: 'pretty' })}">Every set arrives pre-filled with last session's weight and reps.</div><div style="${t('label', { color: T.t2, marginTop: '6px', textWrap: 'pretty' })}">Repeating a workout becomes one tap. Beating it becomes two.</div>`, { marginTop: '12px' })}
  <div style="${s({ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' })}">${sectionLabel(T, 'Your routines', 'None yet')}
    ${[0, 1].map(() => `<div style="${s({ height: '62px', borderRadius: radius.lg + 'px', border: `1px dashed ${T.ghost}` })}"></div>`).join('\n    ')}
  </div>
</div>`;
    return phone(T, { body, active: 'Workout' });
  }

  const head = `<header style="${s({ height: '52px', padding: `0 ${PAD}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}">
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '4px' })}">
    <div style="${t('sessionTitle', { color: T.t1 })}">Push A</div>
    <div style="${s({ display: 'flex', alignItems: 'center', gap: '6px' })}"><span style="${s({ width: '6px', height: '6px', borderRadius: '999px', background: T.str })}"></span><span style="${t('numericSm', { fontSize: '13px', color: T.str })}">32:14</span><span style="${t('label', { fontSize: '12px', color: T.t3 })}">· exercise 2 of 5</span></div>
  </div>
  <div style="${s({ height: size.button.headerHit + 'px', padding: '0 16px', borderRadius: '999px', border: `1.5px solid ${T.str}`, color: T.str, display: 'flex', alignItems: 'center', gap: '6px' })}">${ico(I.flag, { size: 17, w: 2 })}<span style="${t('control', { fontSize: '14.5px' })}">Finish</span></div>
</header>`;

  const progress = `<div style="${s({ display: 'flex', gap: '4px', padding: `0 ${PAD}px`, marginTop: '4px' })}">
${[1, 1, 0.45, 0, 0].map((f) => `  <span style="${s({ flex: '1', height: '4px', borderRadius: '999px', background: T.hair, overflow: 'hidden' })}"><span style="${s({ display: 'block', width: f * 100 + '%', height: '100%', background: T.str, borderRadius: '999px' })}"></span></span>`).join('\n')}
</div>`;

  const done = [['1', '80 kg', '8'], ['2', '80 kg', '8']].map(([i, w, r]) => `  <div style="${s({ height: '44px', display: 'flex', alignItems: 'center', gap: '12px', borderTop: `1px solid ${T.hair}` })}">
    <span style="${s({ width: '24px', height: '24px', borderRadius: radius.xs + 'px', background: S.indexBg, color: S.indexText, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPE.numericXs })}">${i}</span>
    <span style="${t('numericMd', { color: S.valueText, flex: '1' })}">${w} <span style="${s({ color: T.t3, fontWeight: 500 })}">×</span> ${r}</span>
    <span style="${s({ color: S.doneIcon })}">${ico(I.check, { size: 18, w: 2.4 })}</span>
  </div>`).join('\n');

  const active = `<div style="${s({ marginTop: '10px', padding: '12px', borderRadius: radius.lg + 'px', background: S.activeBg, border: `1px solid ${S.activeBorder}` })}">
  <div style="${s({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' })}"><span style="${s({ height: '22px', padding: '0 10px', borderRadius: radius.xs + 'px', background: S.badgeBg, color: S.badgeText, display: 'flex', alignItems: 'center', ...TYPE.micro, fontSize: '10px' })}">Set 3</span><span style="${t('label', { color: S.hintText })}">pre-filled from last session</span></div>
  <div style="${s({ display: 'flex', gap: '10px' })}">
    <div style="${s({ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '6px' })}">
${stepperRow(T, { unit: 'kg', value: '80' })}
${stepperRow(T, { unit: 'reps', value: '8' })}
    </div>
    <div style="${s({ width: size.stepper.completeWidth + 'px', flex: 'none', borderRadius: radius.md + 'px', background: S.completeBg, color: S.completeIcon, display: 'flex', alignItems: 'center', justifyContent: 'center' })}">${ico(I.check, { size: 30, w: 2.6 })}</div>
  </div>
</div>`;

  const exCard = card(T, `<div style="${s({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' })}">
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '0' })}">
    <div style="${t('title', { color: T.t1 })}">Bench Press</div>
    <div style="${t('label', { color: T.t3 })}">Last: 80 kg × 8, 8, 7 · 4 days ago</div>
  </div>
  <span style="${s({ color: T.t3, flex: 'none', marginTop: '4px' })}">${ico(I.dots, { size: 20 })}</span>
</div>
<div style="${s({ marginTop: '10px' })}">${done}</div>
${active}
<div style="${s({ height: '44px', marginTop: '8px', borderRadius: radius.md + 'px', border: `1px dashed ${T.c.button.dashedBorder}`, color: T.c.button.dashedText, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' })}">${ico(I.plus, { size: 17 })}<span style="${t('control')}">Add set</span></div>`);

  const upNext = `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1', minHeight: '0', overflow: 'hidden', WebkitMaskImage: 'linear-gradient(180deg,#000 86%,transparent)' })}">${sectionLabel(T, 'Up next', '3 exercises')}
${[['3', 'Incline DB Press', '3 × 10'], ['4', 'Cable Fly', '3 × 12'], ['5', 'Overhead Press', '4 × 6']].map(([i, n, x]) => `  <div style="${s({ height: '46px', display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', borderRadius: radius.md + 'px', background: T.surface, border: `1px solid ${T.hair}` })}">
    <span style="${t('numericXs', { color: T.t3, width: '10px' })}">${i}</span>
    <span style="${t('body', { color: T.t1, flex: '1' })}">${n}</span>
    <span style="${t('numericSm', { fontSize: '13px', color: T.t2 })}">${x}</span>
    <span style="${s({ color: T.t3 })}">${ico(I.chev, { size: 16 })}</span>
  </div>`).join('\n')}
</div>`;

  const rest = `<div style="${s({ position: 'absolute', left: PAD + 'px', right: PAD + 'px', bottom: (TABH + HOMEH + layout.floatAboveTabBar) + 'px', height: size.restBar.height + 'px', borderRadius: radius.xl + 'px', background: R.bg, border: `1px solid ${R.border}`, boxShadow: T.floatShadow, padding: '0 12px', display: 'flex', alignItems: 'center', gap: '12px' })}">
  <span style="${s({ position: 'relative', width: '40px', height: '40px', flex: 'none' })}">
    <svg width="40" height="40" viewBox="0 0 40 40" style="display:block;transform:rotate(-90deg)"><circle cx="20" cy="20" r="17" fill="none" stroke="${R.ringTrack}" stroke-width="4"/><circle cx="20" cy="20" r="17" fill="none" stroke="${R.ring}" stroke-width="4" stroke-linecap="round" stroke-dasharray="106.8" stroke-dashoffset="66.2"/></svg>
  </span>
  <span style="${s({ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1' })}"><span style="${t('microSm', { color: R.labelText })}">Rest</span><span style="${t('numericLg', { color: R.timeText })}">1:12</span></span>
  <span style="${s({ height: '40px', padding: '0 12px', borderRadius: radius.sm + 'px', background: R.buttonBg, border: `1px solid ${T.hair}`, color: R.buttonText, display: 'flex', alignItems: 'center', ...TYPE.numericSm })}">+30s</span>
  <span style="${s({ height: '40px', padding: '0 12px', borderRadius: radius.sm + 'px', background: R.buttonBg, border: `1px solid ${T.hair}`, color: R.skipText, display: 'flex', alignItems: 'center', gap: '6px' })}">${ico(I.skip, { size: 15, w: 2 })}<span style="${t('control')}">Skip</span></span>
</div>`;

  const body = `<div style="${s({ position: 'absolute', top: STATUS + 'px', left: 0, right: 0, bottom: (TABH + HOMEH) + 'px', display: 'flex', flexDirection: 'column' })}">
${head}
${progress}
<div style="${s({ padding: `12px ${PAD}px 90px`, display: 'flex', flexDirection: 'column', gap: '12px', flex: '1', minHeight: '0' })}">
${exCard}
${upNext}
</div>
</div>
${rest}`;
  return phone(T, { body, active: 'Workout' });
}

/* =================================================================== CHARTS */
const PW = 326;
// every figure quoted in the Charts copy is derived from chart-data.json, never typed twice
const F = (() => {
  const w = D.weight, o = D.overlay, k = D.kcalDaily, pr = D.protDaily, st = D.strength;
  const n = (x) => x.toLocaleString('en-GB').replace('-', '−');
  const f2 = (x) => x.toFixed(2).replace('-', '−');
  const f1 = (x) => x.toFixed(1).replace('-', '−');
  return {
    wTrend: w.last.toFixed(1), wDelta: f1(w.last - w.first),
    wRaw: w.rawLast.toFixed(1), wGap: Math.abs(w.last - w.rawLast).toFixed(1),
    kAvg: n(k.avgLast), kDelta: n(k.avgLast - k.target), pAvg: pr.avgLast, pDelta: n(pr.avgLast - pr.target),
    aK: n(o.phaseA.kcal), aR: f2(o.phaseA.rate), bK: n(o.phaseB.kcal), bR: f2(o.phaseB.rate),
    bRAbs: Math.abs(o.phaseB.rate).toFixed(2),
    sLast: Math.round(st.last), sDelta: Math.round(st.last - st.first),
  };
})();
const svgTxt = (x, y, txt, o = {}) => `<text x="${x}" y="${y}" fill="${o.fill}" font-family="${FONT}" font-size="${o.size || 9.5}" font-weight="${o.weight || 650}" letter-spacing="${o.ls || '0.02em'}" text-anchor="${o.anchor || 'start'}" style="font-variant-numeric:tabular-nums">${txt}</text>`;
const gridlines = (T, ticks, w = PW) =>
  ticks.map(([, y]) => `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${T.c.chart.gridline}" stroke-width="1"/>`).join('');
const ticklabelsRight = (T, ticks, color, w = PW) => ticks.map(([v, y]) =>
  `<rect x="${w - String(v).length * 6 - 6}" y="${y - 14}" width="${String(v).length * 6 + 8}" height="12.5" rx="2" fill="${T.c.chart.halo}"/>` +
  svgTxt(w - 1, y - 4.5, v, { fill: color, size: TT.axis.fontSize, anchor: 'end' })).join('');
const ticklabels = (T, ticks, color) => ticks.map(([v, y]) =>
  `<rect x="-2" y="${y - 14}" width="${String(v).length * 6 + 8}" height="12.5" rx="2" fill="${T.c.chart.halo}"/>` +
  svgTxt(1, y - 4.5, v, { fill: color, size: TT.axis.fontSize })).join('');

function chartCard(T, { eyeL, eyeR, headline, sub, big, bigUnit, delta, deltaColor, svg, foot, accent }) {
  return card(T, `<div style="${s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}"><span style="${t('micro', { color: accent })}">${eyeL}</span><span style="${t('micro', { color: T.t3, letterSpacing: '0.1em' })}">${eyeR}</span></div>
${headline ? `<div style="${t('headline', { color: T.t1, marginTop: '10px', textWrap: 'pretty' })}">${headline}</div>` : ''}
${big ? `<div style="${s({ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: '10px' })}">
  <span style="${s({ display: 'flex', alignItems: 'baseline', gap: '6px' })}"><span style="${t('statHero', { color: T.t1 })}">${big}</span><span style="${t('control', { fontSize: '13px', color: T.t2 })}">${bigUnit}</span></span>
  ${delta ? `<span style="${s({ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' })}"><span style="${t('numeric', { color: deltaColor })}">${delta[0]}</span><span style="${t('caption', { color: T.t3 })}">${delta[1]}</span></span>` : ''}
</div>` : ''}
${sub ? `<div style="${t('label', { color: T.t3, marginTop: '6px' })}">${sub}</div>` : ''}
<div style="${s({ marginTop: '16px' })}">${svg}</div>
${foot || ''}`);
}

function overlayChart(T) {
  const o = D.overlay;
  return `<svg width="${PW}" height="${o.h + 16}" viewBox="0 0 ${PW} ${o.h + 16}" style="display:block;overflow:visible">
  <defs><linearGradient id="kg-${T.name}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${T.kcal}" stop-opacity="0.20"/><stop offset="1" stop-color="${T.kcal}" stop-opacity="0.012"/>
  </linearGradient></defs>
  ${gridlines(T, o.wTicks)}
  <path d="${o.kArea}" fill="url(#kg-${T.name})"/>
  <path d="${o.kLine}" fill="none" stroke="${T.kcal}" stroke-width="1.7" stroke-linejoin="round" opacity="0.95"/>
  <line x1="${o.splitX}" y1="0" x2="${o.splitX}" y2="${o.h}" stroke="${T.c.chart.splitLine}" stroke-width="1" stroke-dasharray="3 3"/>
  <path d="${o.wLine}" fill="none" stroke="${T.canvas}" stroke-width="5.4" stroke-linejoin="round" stroke-linecap="round" opacity="0.55"/>
  <path d="${o.wLine}" fill="none" stroke="${T.body}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  ${ticklabels(T, o.wTicks, T.body)}
  ${ticklabelsRight(T, o.kTicks.map(([v, y]) => [v.toLocaleString('en-GB'), y]), T.kcal)}
  ${svgTxt(o.splitX + 5, 11, 'CUT STARTS', { fill: T.t3, size: TT.axisMarker.fontSize, ls: '0.12em' })}
  ${svgTxt(2, o.h + 13, 'kg', { fill: T.body, size: TT.axisMarker.fontSize, ls: '0.1em' })}
  ${svgTxt(PW, o.h + 13, 'kcal', { fill: T.kcal, size: TT.axisMarker.fontSize, ls: '0.1em', anchor: 'end' })}
  ${svgTxt(38, o.h + 13, 'Jun', { fill: T.t3, size: TT.axisCaption.fontSize, weight: 550 })}
  ${svgTxt(o.splitX, o.h + 13, 'Jul', { fill: T.t3, size: TT.axisCaption.fontSize, weight: 550, anchor: 'middle' })}
  ${svgTxt(PW - 30, o.h + 13, 'Sep', { fill: T.t3, size: TT.axisCaption.fontSize, weight: 550, anchor: 'end' })}
</svg>`;
}

function weightChart(T) {
  const w = D.weight;
  return `<svg width="${PW}" height="${w.h + 16}" viewBox="0 0 ${PW} ${w.h + 16}" style="display:block;overflow:visible">
  ${gridlines(T, w.ticks)}
  ${w.dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7" fill="${T.bodyDim}"/>`).join('')}
  <path d="${w.trend}" fill="none" stroke="${T.c.chart.halo}" stroke-width="5.6" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${w.trend}" fill="none" stroke="${T.body}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${w.dots[89][0]}" cy="${w.dots[89][1]}" r="4" fill="none" stroke="${T.t2}" stroke-width="1.6"/>
  <circle cx="${w.lastPt[0]}" cy="${w.lastPt[1]}" r="4.2" fill="${T.body}" stroke="${T.surface}" stroke-width="1.6"/>
  ${ticklabels(T, w.ticks, T.body)}
  ${svgTxt(2, w.h + 13, '90 days ago', { fill: T.t3, size: TT.axisCaption.fontSize, weight: 550 })}
  ${svgTxt(PW, w.h + 13, 'today', { fill: T.t3, size: TT.axisCaption.fontSize, weight: 550, anchor: 'end' })}
</svg>`;
}

function seriesChart(T, key, color, dim, targetLabel) {
  const b = D[key];
  return `<svg width="${PW}" height="${b.h + 16}" viewBox="0 0 ${PW} ${b.h + 16}" style="display:block;overflow:visible">
  ${gridlines(T, b.ticks)}
  <line x1="0" y1="${b.targetY}" x2="${PW}" y2="${b.targetY}" stroke="${T.c.chart.targetLine}" stroke-width="1.2" stroke-dasharray="4 4"/>
  ${b.dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.9" fill="${dim}"/>`).join('')}
  <path d="${b.avg}" fill="none" stroke="${T.c.chart.halo}" stroke-width="5.6" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${b.avg}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${b.avgLastPt[0]}" cy="${b.avgLastPt[1]}" r="4.2" fill="${color}" stroke="${T.surface}" stroke-width="1.8"/>
  ${ticklabels(T, b.ticks, T.t3)}
  <rect x="${PW - targetLabel.length * 5.4 - 8}" y="${b.targetY - 15}" width="${targetLabel.length * 5.4 + 9}" height="12.5" rx="2" fill="${T.c.chart.halo}"/>
  ${svgTxt(PW, b.targetY - 5.5, targetLabel, { fill: T.c.chart.targetText, size: 9, anchor: 'end' })}
  ${svgTxt(2, b.h + 13, '30 days', { fill: T.t3, size: TT.axisCaption.fontSize, weight: 550 })}
  ${svgTxt(PW, b.h + 13, 'today', { fill: T.t3, size: TT.axisCaption.fontSize, weight: 550, anchor: 'end' })}
</svg>`;
}

function strengthChart(T) {
  const g = D.strength;
  return `<svg width="${PW}" height="${g.h + 16}" viewBox="0 0 ${PW} ${g.h + 16}" style="display:block;overflow:visible">
  ${gridlines(T, g.ticks)}
  ${ticklabels(T, g.ticks, T.str)}
  <path d="${g.line}" fill="none" stroke="${T.str}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
  ${g.dots.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === g.dots.length - 1 ? 4.2 : 2.2}" fill="${T.str}"/>`).join('')}
  ${svgTxt(2, g.h + 13, 'Mar', { fill: T.t3, size: TT.axisCaption.fontSize, weight: 550 })}
  ${svgTxt(PW, g.h + 13, 'Sep', { fill: T.t3, size: TT.axisCaption.fontSize, weight: 550, anchor: 'end' })}
</svg>`;
}

const legendDot = (c, txt, T, dash) => `<span style="${s({ display: 'flex', alignItems: 'center', gap: '6px' })}"><span style="${s({ width: '14px', height: '3px', borderRadius: '999px', background: dash ? 'none' : c, borderTop: dash ? `2px dashed ${c}` : 'none', flex: 'none' })}"></span><span style="${t('caption', { fontWeight: 650, color: T.c.chart.legendText })}">${txt}</span></span>`;

function chartsScreen(T, { empty = false } = {}) {
  const PAD = layout.gutter, CH = T.c.chart, SG = T.c.segmented;
  const head = `<header style="${s({ height: '48px', padding: `0 ${PAD + 4}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}">
  <div style="${t('displayLg', { color: T.t1 })}">Charts</div>
  <div style="${t('label', { color: T.t3 })}">${empty ? 'day 1' : '13 Jun – 10 Sep'}</div>
</header>`;
  const ranges = ['1M', '3M', '6M', '1Y', 'All'];
  const switcher = `<div style="${s({ margin: `6px ${PAD}px 0`, padding: '4px', height: size.segmented.rangeHit + 'px', borderRadius: radius.md + 'px', background: T.surface, border: `1px solid ${T.hair}`, display: 'flex', gap: '4px' })}">
${ranges.map((r) => `  <span style="${s({ flex: '1', borderRadius: radius.sm + 'px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: r === '3M' ? T.raised : 'transparent', border: r === '3M' ? `1px solid ${T.hair}` : '1px solid transparent', color: r === '3M' ? SG.selectedText : SG.optionText, ...TYPE[r === '3M' ? 'controlSelected' : 'control'] })}">${r}</span>`).join('\n')}
</div>`;

  if (empty) {
    const ghostChart = `<svg width="${PW}" height="120" viewBox="0 0 ${PW} 120" style="display:block"><line x1="0" y1="30" x2="${PW}" y2="30" stroke="${T.hair}"/><line x1="0" y1="70" x2="${PW}" y2="70" stroke="${T.hair}"/><line x1="0" y1="110" x2="${PW}" y2="110" stroke="${T.hair}"/><path d="M0 26 C70 34 120 48 175 60 C230 72 280 84 326 96" fill="none" stroke="${T.ghost}" stroke-width="2.6" stroke-dasharray="5 6" stroke-linecap="round"/></svg>`;
    const body = `<div style="${s({ position: 'absolute', top: STATUS + 'px', left: 0, right: 0, bottom: (TABH + HOMEH) + 'px', display: 'flex', flexDirection: 'column' })}">
${head}
${switcher}
<div style="${s({ padding: `12px ${PAD}px 0`, display: 'flex', flexDirection: 'column', gap: '12px' })}">
${card(T, `<div style="${t('micro', { color: T.body })}">Weight trend</div>
<div style="${t('headline', { color: T.t1, marginTop: '10px', textWrap: 'pretty' })}">Three weigh-ins and this line appears.</div>
<div style="${t('label', { color: T.t3, marginTop: '6px', textWrap: 'pretty' })}">A single weigh-in is noise. The trend is the number worth watching, and it needs a few days to exist.</div>
<div style="${s({ marginTop: '16px' })}">${ghostChart}</div>
<div style="${s({ marginTop: '16px', height: '48px', borderRadius: radius.md + 'px', background: T.c.button.bodyBg, color: T.c.button.bodyText, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' })}">${ico(I.scale, { size: 19, w: 2 })}<span style="${t('button')}">Log today's weight</span></div>
<div style="${s({ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px' })}"><span style="${s({ flex: '1', height: '5px', borderRadius: '999px', background: T.hair, overflow: 'hidden' })}"><span style="${s({ display: 'block', width: '33%', height: '100%', background: T.body })}"></span></span><span style="${t('numericSm', { fontSize: '11.5px', color: T.t2 })}">1 of 3 days</span></div>`)}
${card(T, `<div style="${t('micro', { color: T.kcal })}">Calories &amp; protein</div><div style="${t('tileName', { color: T.t1, marginTop: '10px', textWrap: 'pretty' })}">Log a full day and the rolling average starts.</div><div style="${s({ marginTop: '12px', height: '78px', borderRadius: radius.md + 'px', border: `1px dashed ${T.ghost}` })}"></div>`)}
${card(T, `<div style="${t('micro', { color: T.str })}">Strength</div><div style="${t('tileName', { color: T.t1, marginTop: '10px', textWrap: 'pretty' })}">Two sessions of an exercise draws its first line.</div><div style="${s({ marginTop: '12px', height: '78px', borderRadius: radius.md + 'px', border: `1px dashed ${T.ghost}` })}"></div>`)}
</div>
</div>`;
    return phone(T, { body, active: 'Charts' });
  }

  const statCell = (label, kcalV, rate, col) => `<div style="${s({ flex: '1', padding: '10px 12px', borderRadius: radius.md + 'px', background: CH.wellBg, display: 'flex', flexDirection: 'column', gap: '4px' })}">
  <span style="${t('microSm', { color: CH.wellLabelText })}">${label}</span>
  <span style="${t('numeric', { color: T.kcal })}">${kcalV}<span style="${t('unit', { fontSize: '10px', color: T.t3 })}"> kcal/day</span></span>
  <span style="${t('numericSm', { fontSize: '13px', color: col })}">${rate}<span style="${t('unit', { fontSize: '10px', color: T.t3 })}"> /week</span></span>
</div>`;

  const c1 = chartCard(T, {
    accent: T.t1, eyeL: 'Is it working?', eyeR: '90 days',
    headline: `Yes. At <span style="color:${T.kcal}">${F.bK} kcal</span> you are losing <span style="color:${T.body}">${F.bRAbs} kg</span> a week.`,
    svg: overlayChart(T),
    foot: `<div style="${s({ display: 'flex', gap: '16px', marginTop: '12px' })}">${legendDot(T.body, 'Weight trend', T)}${legendDot(T.kcal, 'Calories, 7-day avg', T)}</div>
<div style="${s({ display: 'flex', gap: '8px', marginTop: '12px' })}">${statCell('Before 15 Jul', F.aK, `${F.aR} kg`, T.t2)}${statCell('Since 15 Jul', `${F.bK}`, `${F.bR} kg`, CH.deltaGoodText)}</div>`,
  });

  const c2 = chartCard(T, {
    accent: T.body, eyeL: 'Weight', eyeR: 'trend + daily',
    big: F.wTrend, bigUnit: 'kg trend', delta: [`${F.wDelta} kg`, 'in 90 days'], deltaColor: CH.deltaGoodText,
    svg: weightChart(T),
    foot: `<div style="${s({ display: 'flex', gap: '16px', marginTop: '12px' })}">${legendDot(T.body, 'Trend', T)}<span style="${s({ display: 'flex', alignItems: 'center', gap: '6px' })}"><span style="${s({ width: '5px', height: '5px', borderRadius: '999px', background: T.bodyDim, flex: 'none' })}"></span><span style="${t('caption', { fontWeight: 650, color: CH.legendText })}">What the scale said</span></span></div>
<div style="${t('label', { marginTop: '12px', padding: '12px', borderRadius: radius.md + 'px', background: CH.wellBg, color: CH.wellText, textWrap: 'pretty' })}">This morning the scale said <span style="${t('numericSm', { fontSize: '12.5px', color: T.t1 })}">${F.wRaw}</span> — ${F.wGap} kg under trend. That is water, not fat. Watch the line.</div>`,
  });

  const c3 = chartCard(T, {
    accent: T.kcal, eyeL: 'Calories', eyeR: '30 days',
    big: F.kAvg, bigUnit: 'kcal 7-day avg', delta: [F.kDelta, 'vs target'], deltaColor: CH.deltaNeutralText,
    svg: seriesChart(T, 'kcalDaily', T.kcal, T.kcalDim, 'target 2,400'),
    foot: `<div style="${s({ display: 'flex', gap: '16px', marginTop: '12px' })}">${legendDot(T.kcal, '7-day average', T)}<span style="${s({ display: 'flex', alignItems: 'center', gap: '6px' })}"><span style="${s({ width: '5px', height: '5px', borderRadius: '999px', background: T.kcalDim, flex: 'none' })}"></span><span style="${t('caption', { fontWeight: 650, color: CH.legendText })}">Each day</span></span>${legendDot(T.t2, 'Target', T, true)}</div>`,
  });

  const c4 = chartCard(T, {
    accent: T.prot, eyeL: 'Protein', eyeR: '30 days',
    big: String(F.pAvg), bigUnit: 'g 7-day avg', delta: [`${F.pDelta} g`, 'vs target'], deltaColor: CH.deltaNeutralText,
    svg: seriesChart(T, 'protDaily', T.prot, T.protDim, 'target 180 g'),
    foot: `<div style="${s({ display: 'flex', gap: '16px', marginTop: '12px' })}">${legendDot(T.prot, '7-day average', T)}<span style="${s({ display: 'flex', alignItems: 'center', gap: '6px' })}"><span style="${s({ width: '5px', height: '5px', borderRadius: '999px', background: T.protDim, flex: 'none' })}"></span><span style="${t('caption', { fontWeight: 650, color: CH.legendText })}">Each day</span></span>${legendDot(T.t2, 'Target', T, true)}</div>`,
  });

  const exChips = ['Bench Press', 'Squat', 'Deadlift', 'Row'].map((n, i) => `<span style="${s({ height: '34px', padding: '0 12px', borderRadius: '999px', display: 'flex', alignItems: 'center', background: i === 0 ? T.str : T.raised, color: i === 0 ? T.onStr : T.t2, ...TYPE.control, fontSize: '13px', whiteSpace: 'nowrap' })}">${n}</span>`).join('');
  const c5 = chartCard(T, {
    accent: T.str, eyeL: 'Strength', eyeR: 'estimated 1RM',
    big: String(F.sLast), bigUnit: 'kg e1RM', delta: [`+${F.sDelta} kg`, 'in 6 months'], deltaColor: CH.deltaGoodText,
    svg: `<div style="${s({ display: 'flex', gap: '6px', marginBottom: '16px', overflow: 'hidden' })}">${exChips}</div>${strengthChart(T)}`,
  });

  const body = `<div style="${s({ position: 'absolute', top: STATUS + 'px', left: 0, right: 0, display: 'flex', flexDirection: 'column' })}">
${head}
${switcher}
<div style="${s({ padding: `12px ${PAD}px ${TABH + HOMEH + 16}px`, display: 'flex', flexDirection: 'column', gap: '12px' })}">
${c1}
${c2}
${c3}
${c4}
${c5}
</div>
</div>`;
  return phone(T, { body, active: 'Charts', height: 1760 });
}

/* ================================================================= SETTINGS */
/* kg and cm only (decision 3): there is no Units group. Week start is a calendar choice, not a unit. */
const SETTINGS_H = 1440;
function settingsScreen(T, { empty = false } = {}) {
  const PAD = layout.gutter, C = T.c.settings, SG = T.c.segmented;
  const group = (title, rows, note) => `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '8px' })}">
  <div style="${t('micro', { color: C.groupTitleText, padding: '0 4px' })}">${title}</div>
  <div style="${s({ background: C.groupBg, border: `1px solid ${T.hair}`, borderRadius: radius.lg + 'px', overflow: 'hidden', boxShadow: T.tileShadow })}">${rows.join('')}</div>
  ${note ? `<div style="${t('label', { color: C.noteText, padding: '0 6px', textWrap: 'pretty' })}">${note}</div>` : ''}
</div>`;
  const row = (label, right, i, accent) => `<div style="${s({ height: size.row.settings + 'px', display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', borderTop: i ? `1px solid ${T.hair}` : 'none' })}">
    <span style="${t('body', { color: C.labelText, flex: '1' })}">${label}</span>
    <span style="${t('numericRow', { color: accent || C.valueText })}">${right}</span>
    <span style="${s({ color: C.chevronIcon })}">${ico(I.chev, { size: 15 })}</span>
  </div>`;
  const seg = (label, opts, sel, i) => `<div style="${s({ height: '56px', display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', borderTop: i ? `1px solid ${T.hair}` : 'none' })}">
    <span style="${t('body', { color: C.labelText, flex: '1' })}">${label}</span>
    <span style="${s({ display: 'flex', gap: '4px', padding: '4px', borderRadius: radius.md + 'px', background: SG.trackBg })}">${opts.map((o) => `<span style="${s({ minWidth: '46px', height: size.segmented.painted + 'px', padding: '0 12px', borderRadius: radius.sm + 'px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: o === sel ? SG.selectedBg : 'transparent', border: o === sel ? `1px solid ${SG.selectedBorder}` : '1px solid transparent', color: o === sel ? SG.selectedText : SG.optionText, ...TYPE[o === sel ? 'controlSelected' : 'control'] })}">${o}</span>`).join('')}</span>
  </div>`;

  const account = `<div style="${s({ margin: `4px ${PAD}px 0`, padding: '16px', background: C.groupBg, border: `1px solid ${empty ? T.kcal : T.hair}`, borderRadius: radius.xl + 'px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: T.tileShadow })}">
  <span style="${s({ width: '46px', height: '46px', flex: 'none', borderRadius: '999px', background: empty ? C.syncOffBg : C.avatarBg, color: empty ? C.syncOffIcon : C.avatarIcon, display: 'flex', alignItems: 'center', justifyContent: 'center' })}">${ico(empty ? I.cloud : I.user, { size: 23 })}</span>
  <span style="${s({ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1', minWidth: '0' })}">
    <span style="${t('tileName', { color: C.labelText })}">${empty ? 'Sync is off' : 'Michael'}</span>
    <span style="${s({ display: 'flex', alignItems: 'center', gap: '6px' })}">${empty ? '' : `<span style="${s({ width: '6px', height: '6px', borderRadius: '999px', background: C.syncOkDot, flex: 'none' })}"></span>`}<span style="${t('label', { color: C.noteText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}">${empty ? 'This phone only — no backup' : 'All caught up · 2 min ago'}</span></span>
  </span>
  <span style="${s({ flex: 'none', height: '40px', padding: '0 16px', borderRadius: '999px', background: empty ? T.c.button.kcalBg : T.raised, color: empty ? T.c.button.kcalText : T.t1, display: 'flex', alignItems: 'center', ...TYPE.control })}">${empty ? 'Turn on' : 'Sync now'}</span>
</div>`;

  const body = `<div style="${s({ position: 'absolute', top: STATUS + 'px', left: 0, right: 0, display: 'flex', flexDirection: 'column' })}">
<header style="${s({ height: '48px', padding: `0 ${PAD + 4}px`, display: 'flex', alignItems: 'center' })}"><div style="${t('displayLg', { color: T.t1 })}">Settings</div></header>
${account}
<div style="${s({ padding: `16px ${PAD}px ${TABH + HOMEH + 16}px`, display: 'flex', flexDirection: 'column', gap: layout.groupGap + 'px' })}">
${group('Targets', [
    row('Daily calories', empty ? 'Set' : '2,400 kcal', 0, T.kcal),
    row('Daily protein', empty ? 'Set' : '180 g', 1, T.prot),
  ], 'Carbs and fat are deliberately not tracked. Two numbers you will actually hit beat four you will not.')}
${group('Calendar', [
    seg('Week starts', ['Mon', 'Sun'], 'Mon', 0),
  ])}
${group('Your library', [
    row('Foods', empty ? '0' : '48', 0),
    row('Meals', empty ? '0' : '7', 1),
    row('Exercises', empty ? '0' : '22', 2),
    row('Routines', empty ? '0' : '3', 3),
  ], empty ? 'Every food you log is saved here automatically. You never build a database up front.' : '')}
${group('Appearance', [
    seg('Theme', ['Dark', 'Light', 'Auto'], 'Dark', 0),
    seg('Motion', ['Full', 'Reduced'], 'Full', 1),
  ], 'Reduced motion also follows the phone’s own setting. This switch is here so you can turn it on for Vitals alone.')}
${group('Data', [
    row('Export everything', 'CSV', 0),
    row('Import', '', 1),
  ], empty ? '' : 'Devices: iPhone 15 Pro · Pixel 8')}
${group('About', [row('Version', '1.0.0 (24)', 0), row('Licence', 'GPL-3.0', 1)])}
</div>
</div>`;
  return phone(T, { body, active: 'Settings', height: empty ? 844 : SETTINGS_H });
}

/* ================================================================== SHEETS */
function grabber(color) {
  return `<div style="${s({ alignSelf: 'center', flex: 'none', width: size.searchSheet.grabberWidth + 'px', height: size.searchSheet.grabberHeight + 'px', borderRadius: '999px', background: color })}"></div>`;
}

/* a screen dimmed under a sheet */
function withSheet(T, base, sheet) {
  return `<div style="${s({ position: 'relative', width: W + 'px', height: '844px', overflow: 'hidden', fontFamily: FONT })}">${base}<div style="${s({ position: 'absolute', inset: '0', background: T.c.searchSheet.scrim })}"></div>${sheet}</div>`;
}

function keyboardZone(T, label) {
  return `<div style="${s({ height: KEYBOARD + 'px', flex: 'none', background: T.canvas, borderTop: `1px dashed ${T.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' })}"><span style="${t('micro', { color: T.t3 })}">${label}</span><span style="${t('label', { color: T.t3 })}">${KEYBOARD} pt · drawn by the phone, not by Vitals</span></div>`;
}

/* ------------------------------------------------------------ segmented */
function segmented(T, opts, sel, { grow = false } = {}) {
  const C = T.c.segmented, P = size.portionSheet;
  return `<div style="${s({ display: 'flex', gap: '4px', padding: '4px', height: P.segmentHit + 'px', borderRadius: radius.md + 'px', background: C.trackBg, flex: grow ? '1' : 'none', minWidth: '0' })}">${opts.map((o) => {
    const on = o === sel;
    return `<span style="${s({ flex: grow ? '1' : 'none', minWidth: '0', height: P.segmentPainted + 'px', padding: '0 12px', borderRadius: radius.sm + 'px', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', background: on ? C.selectedBg : 'transparent', border: `1px solid ${on ? C.selectedBorder : 'transparent'}`, color: on ? C.selectedText : C.optionText, ...TYPE[on ? 'controlSelected' : 'control'] })}">${o}</span>`;
  }).join('')}</div>`;
}

/* ------------------------------------------------------------ portion sheet */
function portionSteps(T) {
  const C = T.c.portionSheet;
  return `<div style="${s({ display: 'flex', gap: space[3] + 'px' })}">${[['½', 60], ['1', 120], ['1½', 180], ['2', 240], ['3', 360]].map(([l, k]) => {
    const on = l === '1';
    return `<span style="${s({ flex: '1', height: size.portionSheet.stepHeight + 'px', borderRadius: radius.md + 'px', background: on ? C.stepSelectedBg : C.stepBg, border: `1px solid ${on ? C.stepSelectedBg : C.stepBorder}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' })}"><span style="${t('numericLg', { fontSize: '18px', color: on ? C.stepSelectedText : C.stepText })}">${l}</span><span style="${t('caption', { color: on ? C.stepSelectedText : C.stepMetaText })}">${k} kcal</span></span>`;
  }).join('')}</div>`;
}

function sliderRow(T) {
  const C = T.c.slider, Z = size.slider, max = 600, at = (g) => (g / max) * 100 + '%';
  const nudge = (icon, label) => `<span style="${s({ width: Z.nudgeWidth + 'px', height: Z.nudgeHit + 'px', flex: 'none', borderRadius: radius.md + 'px', background: C.nudgeBg, border: `1px solid ${T.hair}`, color: C.nudgeIcon, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' })}">${ico(icon, { size: 16, w: 2.2 })}<span style="${t('caption', { color: C.nudgeIcon })}">${label}</span></span>`;
  const mid = 30;
  const tick = (g) => `<span style="${s({ position: 'absolute', left: at(g), top: mid - Z.detentHeight / 2 + 'px', width: Z.detentWidth + 'px', height: Z.detentHeight + 'px', marginLeft: -Z.detentWidth / 2 + 'px', borderRadius: '1px', background: C.detentIcon })}"></span>`;
  const lab = (g, txt, top, align = 'center') => `<span style="${s({ position: 'absolute', left: align === 'center' ? at(g) : undefined, right: align === 'end' ? '0' : undefined, top: top + 'px', transform: align === 'center' ? 'translateX(-50%)' : undefined, whiteSpace: 'nowrap', ...TYPE.caption, color: C.detentText })}">${txt}</span>`;
  return `<div style="${s({ display: 'flex', alignItems: 'center', gap: space[3] + 'px' })}">
  ${nudge(I.minus, '5 g')}
  <div style="${s({ position: 'relative', flex: '1', minWidth: '0', height: '62px' })}">
    <span style="${s({ position: 'absolute', left: '0', right: '0', top: mid - Z.track / 2 + 'px', height: Z.track + 'px', borderRadius: '999px', background: C.track })}"></span>
    <span style="${s({ position: 'absolute', left: '0', width: at(185), top: mid - Z.track / 2 + 'px', height: Z.track + 'px', borderRadius: '999px', background: C.fill })}"></span>
    ${[100, 150, 300, 450].map(tick).join('')}
    ${lab(100, '100 g', 0)}
    ${lab(150, '1 pot', 44)}${lab(300, '2 pots', 44)}
    <span style="${s({ position: 'absolute', left: '0', top: '44px', ...TYPE.caption, color: C.rangeText })}">0</span>
    <span style="${s({ position: 'absolute', right: '0', top: '44px', ...TYPE.caption, color: C.rangeText })}">600 g</span>
    <span style="${s({ position: 'absolute', left: at(185), top: mid - Z.thumb / 2 + 'px', width: Z.thumb + 'px', height: Z.thumb + 'px', marginLeft: -Z.thumb / 2 + 'px', borderRadius: '999px', background: C.thumb, boxShadow: `0 0 0 ${Z.thumbRing}px ${C.thumbRing}, ${T.thumbShadow}` })}"></span>
  </div>
  ${nudge(I.plus, '5 g')}
</div>`;
}

function portionSheet(T, mode) {
  const C = T.c.portionSheet;
  const header = `<div style="${s({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' })}">
    <div style="${s({ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '0' })}"><span style="${t('title', { color: C.titleText })}">Skyr Pot</span><span style="${t('label', { color: C.metaText })}">120 kcal · 20 g protein per pot</span></div>
    ${segmented(T, ['Presets', 'Exact'], mode)}
  </div>`;
  const inner = mode === 'Presets'
    ? `${segmented(T, ['1 pot · 150 g', '100 g', '1 tbsp · 15 g'], '1 pot · 150 g', { grow: true })}
  ${portionSteps(T)}`
    : `<div style="${s({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', paddingTop: '4px' })}">
    <span style="${s({ display: 'flex', alignItems: 'baseline', gap: '4px', paddingBottom: '3px', borderBottom: `1.5px dashed ${T.line}` })}"><span style="${t('portionReadout', { color: C.readoutText })}">185</span><span style="${t('tileName', { color: C.unitText })}">g</span></span>
    <span style="${s({ display: 'flex', gap: '14px' })}"><span style="${t('numericSm', { color: C.kcalText })}">148 <span style="${t('unit', { color: C.unitText })}">kcal</span></span><span style="${t('numericSm', { color: C.proteinText })}">25 <span style="${t('unit', { color: C.unitText })}">g protein</span></span></span>
  </div>
  ${sliderRow(T)}
  <div style="${s({ height: size.portionSheet.logButtonHit + 'px', borderRadius: radius.md + 'px', background: C.logButtonBg, color: C.logButtonText, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPE.button })}">Log 185 g</div>`;
  return `<div style="${s({ position: 'absolute', left: '0', right: '0', bottom: '0', background: C.bg, borderRadius: `${radius.xl}px ${radius.xl}px 0 0`, boxShadow: T.sheetShadow, padding: `8px ${layout.gutter}px ${HOMEH + 12}px`, display: 'flex', flexDirection: 'column', gap: space[6] + 'px', fontFamily: FONT })}">
  ${grabber(C.grabber)}
  ${header}
  ${inner}
</div>`;
}

const portionPhone = (T, mode) => withSheet(T, todayScreen(T, { tiles: ['rest', 'press', 'rest', 'rest', 'rest', 'rest'] }), portionSheet(T, mode));

/* ------------------------------------------------------------ search */
const RECENT = [
  { n: 'Boiled Eggs', s: '2 eggs · 100 g', k: 155, p: 13 },
  { n: 'Tuna Mayo Wrap', s: '1 wrap', k: 430, p: 32, meal: true },
  { n: 'Cottage Cheese', s: '100 g', k: 98, p: 11 },
  { n: 'Apple', s: '1 medium · 180 g', k: 95, p: 0 },
];
const RESULTS = [
  { n: 'Boiled Eggs', s: '2 eggs · 100 g', k: 155, p: 13 },
  { n: 'Egg Fried Rice', s: '1 box · 350 g', k: 520, p: 14, meal: true },
  { n: 'Scrambled Eggs on Toast', s: '1 plate', k: 380, p: 22, meal: true },
  { n: 'Egg White Omelette', s: '3 whites · 100 g', k: 52, p: 11 },
];

/* state: 'rest' | 'press' | 'logged' */
function resultRow(T, r, state = 'rest', first = false) {
  const C = T.c.resultRow;
  const bg = state === 'press' ? C.bgPress : state === 'logged' ? `linear-gradient(0deg, ${C.bgLogged}, ${C.bgLogged}), ${C.bg}` : C.bg;
  const right = state === 'logged'
    ? `<span style="${s({ display: 'flex', alignItems: 'center', gap: '6px', color: C.loggedIcon, flex: 'none' })}">${ico(I.check, { size: 16, w: 2.6 })}<span style="${t('numericSm', { color: C.loggedText })}">Logged</span></span>`
    : `<span style="${s({ display: 'flex', alignItems: 'baseline', gap: '10px', flex: 'none' })}"><span style="${t('numericSm', { color: C.kcalText })}">${r.k}<span style="${t('unit', { color: T.t3 })}"> kcal</span></span><span style="${t('numericSm', { color: C.proteinText, minWidth: '34px', textAlign: 'right' })}">${r.p} P</span></span>`;
  return `<div style="${s({ position: 'relative', height: size.resultRow.height + 'px', flex: 'none', display: 'flex', alignItems: 'center', gap: '12px', padding: `0 ${layout.gutter}px`, background: bg })}">
  ${first ? '' : `<span style="${s({ position: 'absolute', top: '0', left: layout.gutter + 'px', right: '0', height: '1px', background: C.divider })}"></span>`}
  <span style="${s({ display: 'flex', flexDirection: 'column', gap: '5px', flex: '1', minWidth: '0' })}">
    <span style="${s({ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '0' })}">${r.meal ? `<span style="${s({ color: C.mealIcon, flex: 'none' })}">${ico(I.layers, { size: 15, w: 1.9 })}</span>` : ''}<span style="${t('tileName', { color: C.nameText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}">${r.n}</span></span>
    <span style="${s({ display: 'flex', alignItems: 'center', gap: '6px' })}">${r.meal ? `<span style="${s({ height: '16px', padding: '0 5px', borderRadius: '4px', background: C.mealTagBg, color: C.mealTagText, display: 'flex', alignItems: 'center', ...TYPE.microSm, letterSpacing: '0.1em' })}">Meal</span>` : ''}<span style="${t('label', { color: C.servingText, whiteSpace: 'nowrap' })}">${r.s}</span></span>
  </span>
  ${right}
</div>`;
}

function createRow(T, query, { first = false, state = 'rest' } = {}) {
  const C = T.c.resultRow;
  return `<div style="${s({ position: 'relative', height: size.resultRow.height + 'px', flex: 'none', display: 'flex', alignItems: 'center', gap: '12px', padding: `0 ${layout.gutter}px`, background: state === 'press' ? C.bgPress : C.bg })}">
  ${first ? '' : `<span style="${s({ position: 'absolute', top: '0', left: layout.gutter + 'px', right: '0', height: '1px', background: C.divider })}"></span>`}
  <span style="${s({ width: size.resultRow.createDisc + 'px', height: size.resultRow.createDisc + 'px', flex: 'none', borderRadius: '999px', background: `linear-gradient(0deg, ${C.createIconBg}, ${C.createIconBg}), ${C.bg}`, color: C.createIcon, display: 'flex', alignItems: 'center', justifyContent: 'center' })}">${ico(I.plus, { size: 18, w: 2.4 })}</span>
  <span style="${s({ display: 'flex', flexDirection: 'column', gap: '5px', flex: '1', minWidth: '0' })}"><span style="${t('tileName', { color: C.createText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}">${query ? `Create “${query}”` : 'Create a new food'}</span><span style="${t('label', { color: C.createMetaText })}">New food · logs one serving</span></span>
  <span style="${s({ color: T.t3, flex: 'none' })}">${ico(I.chev, { size: 16 })}</span>
</div>`;
}

function searchField(T, query) {
  const C = T.c.searchSheet;
  const caret = `<span style="${s({ width: '2px', height: '22px', borderRadius: '1px', background: C.caret, flex: 'none' })}"></span>`;
  return `<div style="${s({ flex: 'none', padding: `8px ${layout.gutter}px`, display: 'flex', alignItems: 'center', gap: '12px', borderTop: `1px solid ${T.hair}` })}">
  <div style="${s({ flex: '1', minWidth: '0', height: size.searchSheet.fieldHeight + 'px', borderRadius: radius.md + 'px', background: C.fieldBg, border: `1.5px solid ${C.fieldBorderFocus}`, display: 'flex', alignItems: 'center', gap: '10px', padding: '0 4px 0 12px' })}">
    <span style="${s({ color: C.fieldIcon, flex: 'none' })}">${ico(I.search, { size: size.icon.md, w: 2 })}</span>
    <span style="${s({ flex: '1', minWidth: '0', display: 'flex', alignItems: 'center', gap: '1px' })}">${query ? `<span style="${t('input', { color: C.queryText, whiteSpace: 'nowrap' })}">${query}</span>${caret}` : `${caret}<span style="${t('input', { color: C.placeholderText, marginLeft: '2px' })}">Search foods</span>`}</span>
    ${query ? `<span style="${s({ width: size.searchSheet.clearHit + 'px', height: size.searchSheet.clearHit + 'px', flex: 'none', color: C.clearIcon, display: 'flex', alignItems: 'center', justifyContent: 'center' })}">${ico(I.x, { size: 18, w: 2 })}</span>` : ''}
  </div>
  <span style="${s({ height: size.searchSheet.cancelHit + 'px', display: 'flex', alignItems: 'center', color: C.cancelText, ...TYPE.control, fontSize: '15px' })}">Cancel</span>
</div>`;
}

function sheetFrame(T, inner) {
  return `<div style="${s({ position: 'absolute', left: '0', right: '0', top: STATUS + size.searchSheet.topInset + 'px', bottom: '0', background: T.c.searchSheet.bg, borderRadius: `${radius.xl}px ${radius.xl}px 0 0`, boxShadow: T.sheetShadow, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: '8px', fontFamily: FONT })}">
  ${grabber(T.c.searchSheet.grabber)}
  ${inner}
</div>`;
}

/* mode: 'recent' | 'results' | 'dayone' */
function searchScreen(T, { mode = 'recent', query = '', states = [] } = {}) {
  const C = T.c.searchSheet;
  const section = (l, r) => `<div style="${s({ height: '32px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${layout.gutter}px` })}"><span style="${t('micro', { color: C.sectionText })}">${l}</span><span style="${t('micro', { color: C.sectionMetaText, letterSpacing: '0.1em' })}">${r}</span></div>`;
  let list;
  if (mode === 'recent') {
    list = section('Recent', `${interaction.recentDays} days`) + RECENT.map((r, i) => resultRow(T, r, states[i] || 'rest', i === 0)).join('') + createRow(T, '');
  } else if (mode === 'results') {
    list = section('Results', `${RESULTS.length} matches`) + RESULTS.map((r, i) => resultRow(T, r, states[i] || 'rest', i === 0)).join('') + createRow(T, query);
  } else {
    list = `<div style="${s({ padding: `0 ${layout.gutter}px 18px`, display: 'flex', flexDirection: 'column', gap: '6px' })}"><span style="${t('tileName', { color: T.t1 })}">Nothing called “${query}” yet.</span><span style="${t('label', { color: C.sectionMetaText, textWrap: 'pretty' })}">Create it once and it is in search — and soon on your quick-add grid — for good.</span></div>` + createRow(T, query, { first: true, state: 'press' });
  }
  const sheet = sheetFrame(T, `<div style="${s({ flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden' })}">${list}</div>
  ${searchField(T, query)}
  ${keyboardZone(T, 'System keyboard')}`);
  return withSheet(T, todayScreen(T, { empty: mode === 'dayone' }), sheet);
}

function createFoodScreen(T) {
  const C = T.c.searchSheet;
  const field = (label, value, { unit, focused, color, flex = '1' } = {}) => `<div style="${s({ flex, minWidth: '0', display: 'flex', flexDirection: 'column', gap: '6px' })}">
    <span style="${t('label', { color: T.t2 })}">${label}</span>
    <span style="${s({ height: size.searchSheet.fieldHeight + 'px', borderRadius: radius.md + 'px', background: C.fieldBg, border: focused ? `1.5px solid ${C.fieldBorderFocus}` : `1px solid ${C.fieldBorder}`, display: 'flex', alignItems: 'center', gap: '2px', padding: '0 12px' })}"><span style="${t('input', { color: color || C.queryText, whiteSpace: 'nowrap' })}">${value}</span>${focused ? `<span style="${s({ width: '2px', height: '22px', borderRadius: '1px', background: C.caret })}"></span>` : ''}<span style="${s({ flex: '1' })}"></span>${unit ? `<span style="${t('label', { color: C.placeholderText })}">${unit}</span>` : ''}</span>
  </div>`;
  const sheet = sheetFrame(T, `<div style="${s({ flex: 'none', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${layout.gutter}px` })}"><span style="${t('title', { color: T.t1 })}">New food</span><span style="${s({ height: '44px', display: 'flex', alignItems: 'center', color: C.cancelText, ...TYPE.control, fontSize: '15px' })}">Cancel</span></div>
  <div style="${s({ flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column', gap: '14px', padding: `6px ${layout.gutter}px 0` })}">
    ${field('Name', 'Boiled eggs')}
    <div style="${s({ display: 'flex', gap: '10px' })}">${field('One serving', '2 eggs', { flex: '1.3' })}${field('Weighs', '100', { unit: 'g' })}</div>
    <div style="${s({ display: 'flex', gap: '10px' })}">${field('Calories', '155', { unit: 'kcal', color: T.kcal })}${field('Protein', '13', { unit: 'g', color: T.prot, focused: true })}</div>
    <span style="${t('label', { color: T.t3, textWrap: 'pretty' })}">Saved per gram, so any portion works later.</span>
  </div>
  <div style="${s({ flex: 'none', padding: `10px ${layout.gutter}px 12px` })}"><div style="${s({ height: size.button.primaryHit + 'px', borderRadius: radius.md + 'px', background: T.c.button.kcalBg, color: T.c.button.kcalText, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPE.button })}">Save &amp; log 1 serving</div></div>
  ${keyboardZone(T, 'System number pad')}`);
  return withSheet(T, todayScreen(T), sheet);
}

/* ============================================================ doc artboards */
const BOARD = '#101218';           // board ground for the spec sheets (canvas chrome, not a product token)
const BOARD_T1 = DARK.t1, BOARD_T2 = DARK.t2, BOARD_T3 = DARK.t3, BOARD_HAIR = '#2A2E36', BOARD_SURF = '#181B21';
const hl = (x) => `<span style="color:${BOARD_T1}">${x}</span>`;

function boardHead(title, sub) {
  return `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '9px', marginBottom: '28px' })}">
  <div style="${t('displayLg', { fontSize: '30px', color: BOARD_T1 })}">${title}</div>
  <div style="${t('body', { fontSize: '15.5px', color: BOARD_T2, maxWidth: '820px', textWrap: 'pretty' })}">${sub}</div>
</div>`;
}
function screenFrame(inner, caption, sub) {
  return `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '12px', width: W + 'px', flex: 'none' })}">
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '2px', minHeight: '52px' })}">
    <div style="${t('micro', { color: BOARD_T1, fontSize: '11px' })}">${caption}</div>
    <div style="${t('label', { color: BOARD_T3, textWrap: 'pretty' })}">${sub}</div>
  </div>
  <div style="${s({ borderRadius: '34px', overflow: 'hidden', border: `1px solid ${BOARD_HAIR}`, boxShadow: '0 20px 50px rgba(0,0,0,0.45)', width: W + 'px' })}">${inner}</div>
</div>`;
}
const callout = (txt, dot = DARK.kcal) => `<div style="${s({ display: 'flex', gap: '9px', alignItems: 'flex-start' })}"><span style="${s({ width: '5px', height: '5px', borderRadius: '999px', background: dot, marginTop: '7px', flex: 'none' })}"></span><span style="${t('label', { fontSize: '13px', lineHeight: '1.5', color: BOARD_T2, textWrap: 'pretty' })}">${txt}</span></div>`;
const colHead = (txt) => `<div style="${t('micro', { color: BOARD_T1, fontSize: '11px' })}">${txt}</div>`;
const stack = (items, gap = 9) => `<div style="${s({ display: 'flex', flexDirection: 'column', gap: gap + 'px' })}">${items.join('\n')}</div>`;
const panel = (title, sub, inner, extra = {}) => `<div style="${s({ background: BOARD_SURF, border: `1px solid ${BOARD_HAIR}`, borderRadius: '20px', padding: '22px 24px', marginTop: '20px', ...extra })}">
  <div style="${t('title', { fontSize: '17px', color: BOARD_T1 })}">${title}</div>
  ${sub ? `<div style="${t('label', { color: BOARD_T2, marginTop: '7px', maxWidth: '900px', textWrap: 'pretty' })}">${sub}</div>` : ''}
  <div style="${s({ marginTop: '16px' })}">${inner}</div>
</div>`;

/* ---------------------------------------------------- the quick-add tile spec */
function quickAddBoard() {
  const T = DARK;
  const state = (label, note, node) => `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '10px', width: '169px' })}">
  <div style="${s({ height: '80px' })}">${node}</div>
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '3px' })}"><span style="${t('micro', { color: BOARD_T1, fontSize: '10px' })}">${label}</span><span style="${t('caption', { fontSize: '11.5px', lineHeight: '1.35', color: BOARD_T3, textWrap: 'pretty' })}">${note}</span></div>
</div>`;
  const labelled = (label, node, w = 350) => `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '7px', width: w + 'px' })}"><span style="${t('micro', { color: BOARD_T3, fontSize: '9.5px' })}">${label}</span>${node}</div>`;
  const ruler = `<svg width="169" height="18" viewBox="0 0 169 18" style="display:block"><line x1="1" y1="9" x2="168" y2="9" stroke="${BOARD_T3}" stroke-width="1"/><line x1="1" y1="4" x2="1" y2="14" stroke="${BOARD_T3}" stroke-width="1"/><line x1="168" y1="4" x2="168" y2="14" stroke="${BOARD_T3}" stroke-width="1"/><rect x="62" y="0" width="45" height="18" fill="${BOARD}"/><text x="84.5" y="12.5" fill="${BOARD_T2}" font-family="${FONT}" font-size="10" font-weight="650" text-anchor="middle">169 pt</text></svg>`;
  const sheetGround = (inner) => `<div style="${s({ width: W + 'px', background: T.c.searchSheet.bg, borderRadius: '18px', overflow: 'hidden', border: `1px solid ${BOARD_HAIR}` })}">${inner}</div>`;

  return `<div style="${s({ width: '1060px', minHeight: '1300px', background: BOARD, padding: '36px 40px', fontFamily: FONT, color: BOARD_T1 })}">
${boardHead('Quick add — the tile, the search bar, the rows', 'Shown at real size. One tap logs the food — no dialog, no save button, just a haptic tick and the ring moving. The search bar is the seventh way to add, and every row it leads to obeys the tile’s gestures exactly.')}
<div style="${s({ display: 'flex', gap: '24px', flexWrap: 'wrap' })}">
${state('Rest', 'The default. 169 × 80 pt — nearly four times the 44 pt minimum.', tile(T, FOODS[2], 'rest'))}
${state('Finger down', `Scales to ${size.tile.pressScale} over ${EV.tilePressIn.duration} ms. The only thing that moves.`, tile(T, FOODS[2], 'press'))}
${state('Logged', `Amber wash + tick for ${interaction.tileLoggedHoldMs} ms. Haptic fires here. The serving line steps up a grey to keep 4.5:1.`, tile(T, FOODS[0], 'logged'))}
${state('Second tap', `Same food again within ${interaction.repeatWindowMs / 1000} s adds a portion to the same entry. The badge counts.`, tile(T, FOODS[1], 'repeat'))}
${state('Not yet learned', 'Day one. Dashed and empty; the caption under the grid explains it.', tile(T, {}, 'ghost'))}
</div>
<div style="${s({ marginTop: '14px', width: '169px' })}">${ruler}</div>
<div style="${s({ display: 'flex', gap: '48px', marginTop: '38px', alignItems: 'flex-start' })}">
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '16px', width: '356px', flex: 'none' })}">
    ${colHead('Anatomy · 2×')}
    <div style="${s({ width: '338px' })}">${tile(T, FOODS[2], 'rest', 2)}</div>
    ${stack([
    callout(`Name — ${TT.tileName.fontSize} pt / 650 / 2 lines max. Sized to be read at 70 cm on a gym floor, not at 30 cm on a sofa.`),
    callout('Calories in amber, protein in teal, both 15 pt / 700 tabular. Colour carries the meaning, so the units can stay small.'),
    callout('Serving label bottom-right, 11 pt. It answers “one tap logs how much?” before the tap, not after.'),
    callout(`${hl('radius.lg')}, padding ${hl('space.4')} / ${hl('space.5')}, fill ${hl('tile.bg')} — one step lighter than the card behind it.`),
  ])}
    ${colHead('Gestures — the tile and every search row')}
    ${stack([
    callout(`${hl('Tap')} logs one serving. Haptic, Logged state, undo toast naming the food.`),
    callout(`${hl('Second tap within ' + interaction.repeatWindowMs / 1000 + ' s')} on the same food — from the tile or from search — adds a portion to the same entry (×2) instead of a second row.`),
    callout(`${hl('Long-press ' + interaction.longPressMs + ' ms')} opens the portion sheet: presets, or Exact for any amount. See “Portions &amp; undo”.`),
  ])}
  </div>
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '16px', width: '576px', flex: 'none' })}">
    ${colHead('Search foods bar · under the grid')}
    <div style="${s({ display: 'flex', flexDirection: 'column', gap: '12px' })}">
      ${labelled('Rest', searchBar(T))}
      ${labelled('Finger down', searchBar(T, 'press'))}
      ${labelled('Day one', searchBar(T, 'emphasis'))}
    </div>
    ${stack([
    callout('Full width, directly under the grid, in the thumb zone. It replaces the header search button — search has exactly one door.'),
    callout(`Same ${hl('radius.lg')} and height family as the tiles above it, ${hl('space.4')} below them, so it reads as part of quick add rather than as navigation.`),
    callout('On day one it is outlined in amber and says “Add your first food” — the first tap anyone makes.'),
  ])}
    <div style="${s({ height: '10px' })}"></div>
    ${colHead('Result rows · rest, pressed, logged')}
    <div style="${s({ display: 'flex', flexDirection: 'column', gap: '12px' })}">
      ${labelled('Rest — food', sheetGround(resultRow(T, RESULTS[0], 'rest', true)), W)}
      ${labelled('Rest — saved meal', sheetGround(resultRow(T, RESULTS[1], 'rest', true)), W)}
      ${labelled('Finger down', sheetGround(resultRow(T, RESULTS[0], 'press', true)), W)}
      ${labelled(`Logged — ${interaction.rowLoggedHoldMs} ms, then the sheet closes`, sheetGround(resultRow(T, RESULTS[0], 'logged', true)), W)}
      ${labelled('Always the last row', sheetGround(createRow(T, 'egg', { first: true })), W)}
    </div>
    ${stack([
    callout('Tap logs one serving: haptic, a short Logged beat so you see which row took it, the sheet closes, the undo toast appears on Today.'),
    callout('Saved meals carry the layers glyph and a MEAL tag — never colour alone.'),
    callout('Create “‹query›” opens the add-food form with the name filled in. Saving stores the food and logs one serving.'),
  ])}
  </div>
</div>
</div>`;
}

/* ------------------------------------------------------------- portions & undo */
function portionBoard() {
  const T = DARK;
  const toastData = { title: 'Skyr Pot  ×2', meta: '240 kcal · 40 g protein' };
  const col = (frame, head, items) => `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '18px', width: W + 'px', flex: 'none' })}">${frame}${head ? `<div style="${t('title', { fontSize: '16px', color: BOARD_T1, marginTop: '4px' })}">${head}</div>` : ''}${stack(items, 10)}</div>`;
  return `<div style="${s({ width: '1330px', minHeight: '1620px', background: BOARD, padding: '40px', fontFamily: FONT, color: BOARD_T1 })}">
${boardHead('Portions &amp; undo', 'Tap is still the whole interaction for most foods. When the amount is not one serving, long-press gives normalised presets — and Exact, because real consumption is not normalised. Undo is the only safety net in an app with no save button, so it is designed for a phone lying on a bench.')}
<div style="${s({ display: 'flex', gap: '40px', alignItems: 'flex-start' })}">
${col(screenFrame(portionPhone(T, 'Presets'), `Long-press · presets`, `Hold ${interaction.longPressMs} ms on a tile or a search row. Tap a step and it logs.`), 'Presets', [
    callout('Presets are normalised — 1 pot, 100 g, 1 tbsp — whichever units this food has. Pick the unit, then a step.'),
    callout('Steps are ½, 1, 1½, 2, 3 of that unit, each with its calories printed on it, so you know before you tap. Tapping one logs immediately and closes the sheet. Still no save button.'),
    callout('The step matching the food’s usual serving is filled, so the likely answer is the loudest thing in the sheet.'),
  ])}
${col(screenFrame(portionPhone(T, 'Exact'), 'Exact · any amount', 'Swaps the steps for a slider in grams. For the scale, or for real life.'), 'Exact', [
    callout('Presets are normalised; real consumption is not. Exact swaps the preset steps for a slider in grams — the unit food is stored in — so 185 g is 185 g, not “about 1½”.'),
    callout(`The slider runs 0 → ${interaction.sliderMaxServings} servings in ${interaction.sliderStepG} g steps. Released within ${interaction.sliderDetentSnapG} g of a preset it snaps on with a selection tick. −${interaction.sliderNudgeG} / +${interaction.sliderNudgeG} g nudges sit either side for the last few grams.`),
    callout('The dashed underline says the number is editable: tap it for a number pad when you weighed the food.'),
    callout('Exact is the one place with a Log button — a drag too easily ends a few grams off to commit on release. It sits at the bottom, under the thumb.'),
    callout('The sheet remembers the last mode per food, so someone who weighs their rice never taps Exact twice.'),
  ])}
${col(screenFrame(todayScreen(T, { tiles: ['rest', 'repeat', 'rest', 'rest', 'rest', 'rest'], toastData }), 'Undo · after a second tap', 'The toast names what was logged, and stays until your next action.'), 'Decision: no 4-second timer', [
    callout(`A 4-second timer guesses when you will look back. On a bench you look back when the set ends — so the toast is dismissed by your next action first, and only falls back on a clock (${interaction.undoAutoDismissMs / 1000} s) if you do nothing at all.`),
    callout(`Gone when you: log again (it updates — “×2”), open a sheet, change tab, or swipe it away. ${hl('Not')} gone when you scroll, lock the phone or leave the app.`),
    callout(`${interaction.undoAutoDismissMs / 1000} s wall-clock from the log, restarted by a new log (client ruling, 2026-09-20) — long enough to read what was logged and reach Undo one-handed, gone before it is in the way of the next thing. The older minutes-long ceiling this said instead was retired in issue #201.`),
    callout('It says what was logged. The haptic tells you something logged; only words tell you it was the rice and not the chicken beside it.'),
    callout('It sits above the tab bar, clear of the grid and the search bar, so it is never in the way of the next log. Once it is gone, the log row still swipes to delete.'),
    callout(`${hl('Checkpoint 2:')} try it on a real bench. Is ${interaction.undoAutoDismissMs / 1000} seconds right? Should scrolling Today dismiss it?`, DARK.body),
  ])}
</div>
</div>`;
}

/* -------------------------------------------------------------- empty states */
function emptyBoard() {
  const panels = [
    [todayScreen(DARK, { empty: true }), 'Today · day one', 'Six ghost tiles teach the grid; the search bar sits where it always will, asking for the first food.'],
    [searchScreen(DARK, { mode: 'dayone', query: 'Boiled eggs' }), 'Search · day one', 'Nothing to match yet, so Create is the whole answer — name filled in, three taps to logged.'],
    [workoutScreen(DARK, { empty: true }), 'Workout · day one', 'No routine required. Start empty; the routine builds itself.'],
    [chartsScreen(DARK, { empty: true }), 'Charts · day one', 'Says exactly what unlocks each graph, and how far away it is.'],
    [settingsScreen(DARK, { empty: true }), 'Settings · day one', 'Sync off, library at zero, the two targets asking to be set. No unit switch: kg and cm.'],
  ];
  return `<div style="${s({ width: '2166px', background: BOARD, padding: '40px', fontFamily: FONT, color: BOARD_T1 })}">
${boardHead('Empty states', 'Day one is the only day every user sees. Nothing here is a shrug — each empty screen says what will fill it, and what the first tap should be.')}
<div style="${s({ display: 'flex', gap: '34px' })}">
${panels.map(([p, c, sub]) => screenFrame(p, c, sub)).join('\n')}
</div>
</div>`;
}

/* ------------------------------------------------------------------ contrast */
function parseCol(v) {
  const h = /^#([0-9a-f]{6})$/i.exec(v);
  if (h) { const n = parseInt(h[1], 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }; }
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(v.replace(/\s/g, ''));
  return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
}
const overCol = (top, bot) => ({ r: Math.round(top.r * top.a + bot.r * (1 - top.a)), g: Math.round(top.g * top.a + bot.g * (1 - top.a)), b: Math.round(top.b * top.a + bot.b * (1 - top.a)), a: 1 });
const lumCol = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratioCol = (a, b) => { const [x, y] = [lumCol(a), lumCol(b)]; return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100; };
function pairRatio(T, pair) {
  const [base, ...layers] = pair.on;
  const bg = layers.reduce((acc, p) => overCol(parseCol(get(T.c, p)), acc), parseCol(get(T.c, base)));
  return ratioCol(overCol(parseCol(get(T.c, pair.fg)), bg), bg);
}
const cr = (a, b) => ratioCol(parseCol(a), parseCol(b));

/* ------------------------------------------------------------------ specimen */
const TOKENS = [
  ['Surfaces &amp; lines', [
    ['bg.canvas', 'The ground behind every screen. Never pure black — pure black kills the ring glow and bands on OLED.'],
    ['bg.surface', 'Cards, sheets, settings groups, the rings panel.'],
    ['bg.raised', 'Insets inside a card: stat cells, stepper value, segmented tracks, the search field.'],
    ['bg.tile', 'The quick-add tile and tile-like buttons. One step above the card so it reads as a button, not a row.'],
    ['bg.press', 'Pressed state for any tile, row, chip or neutral button — far enough to read as pressed, never so far that a label drops under 4.5:1.', { under: 'text.tertiary' }],
    ['bg.tileLogged', 'A tile in its 900 ms Logged state: the calorie wash, flattened so text contrast is exact.', { under: 'data.kcal' }],
    ['bg.floating', 'The undo toast and the rest bar. Opaque, so their text contrast is guaranteed over anything.'],
    ['bg.scrim', 'The dim over a screen while a sheet is open.'],
    ['bg.tabBar', 'The tab bar, translucent — measured over the brightest content that can scroll under it.'],
    ['line.hairline', 'Every 1 pt divider and card border.'],
    ['line.strong', 'Dashed “add” affordances, selected-segment outlines, sheet grabbers.'],
    ['line.ghost', 'Dashed outlines for things that do not exist yet: an unlearned tile, an empty chart.'],
  ]],
  ['Text', [
    ['text.primary', 'Numbers, food names, screen titles. Everything you actually read.', { on: 'bg.canvas' }],
    ['text.secondary', 'Supporting text you are meant to read, just not first.', { on: 'bg.canvas' }],
    ['text.tertiary', 'Units, timestamps, eyebrows. The lowest rung — measured here on its worst ground, pressed.', { on: 'bg.press' }],
    ['text.onKcal', 'A label on an amber fill: Undo, Log 185 g, the selected portion step.', { on: 'data.kcal' }],
    ['text.onStrength', 'A label on a strength fill: set complete, Start session.', { on: 'data.strength' }],
    ['text.onBody', 'A label on a weight fill: Log today’s weight.', { on: 'data.body' }],
    ['text.onDanger', 'A label on a danger fill: Delete, Discard session.', { on: 'state.danger' }],
  ]],
  ['Data &amp; semantic', [
    ['data.kcal', 'Calories, everywhere: the ring, the tile, the average line. Also the primary action colour on Today.', { on: 'bg.press' }],
    ['data.kcalMuted', 'Daily calorie points behind the average, and the base lap of an over-target ring. Never text.'],
    ['data.protein', 'Protein, everywhere. Never used for anything that is not protein.', { on: 'bg.press' }],
    ['data.proteinMuted', 'Daily protein points, and the base lap of an over-target protein ring. Never text.'],
    ['data.body', 'Body weight and its trend line. Owns the Charts tab.', { on: 'bg.press' }],
    ['data.bodyMuted', 'Raw daily scale readings — deliberately quieter than the trend through them. Never text.'],
    ['data.strength', 'Sets, reps, e1RM. Owns the Workout tab and the rest timer.', { on: 'bg.press' }],
    ['data.strengthMuted', 'Quiet strength marks behind the e1RM line. Never text.'],
    ['state.success', 'A target met, a trend going the right way, sync healthy.', { on: 'bg.surface' }],
    ['state.danger', 'Delete, discard a session, sync failure. Nothing else.', { on: 'bg.surface' }],
  ]],
  ['Pressed fills &amp; washes', [
    ['fill.kcalPress', 'An amber button while the finger is down.', { under: 'text.onKcal' }],
    ['fill.strengthPress', 'A strength button while the finger is down.', { under: 'text.onStrength' }],
    ['fill.bodyPress', 'A weight button while the finger is down.', { under: 'text.onBody' }],
    ['fill.dangerPress', 'A danger button while the finger is down.', { under: 'text.onDanger' }],
    ['wash.kcal', 'A search row’s Logged beat; the Create row’s + disc.'],
    ['wash.protein', 'Protein-owned highlights.'],
    ['wash.body', 'The account avatar disc.'],
    ['wash.strength', 'The active set block and set-index badges on Workout.'],
  ]],
];

function tokenTable(T, title) {
  const swatchRow = ([path, use, m]) => {
    const c = get(T.c, path);
    let badge = '';
    if (m) {
      const [fg, bg, label] = m.on ? [c, get(T.c, m.on), `on ${m.on}`] : [get(T.c, m.under), c, `${m.under} on it`];
      const ratio = cr(fg, bg);
      badge = `<span style="${t('numericXs', { fontSize: '10.5px', padding: '2px 6px', borderRadius: '5px', background: ratio >= MIN_TEXT_CONTRAST ? 'rgba(123,215,127,0.16)' : 'rgba(246,109,103,0.16)', color: ratio >= MIN_TEXT_CONTRAST ? DARK.ok : DARK.danger })}">${ratio.toFixed(2)}:1 · ${label}</span>`;
    }
    const swatch = c.startsWith('rgba') ? `linear-gradient(0deg, ${c}, ${c}) ${T.tile}` : c;
    return `<div style="${s({ display: 'flex', gap: '13px', alignItems: 'flex-start', padding: '9px 0', borderTop: `1px solid ${BOARD_HAIR}` })}">
  <span style="${s({ width: '46px', height: '46px', flex: 'none', borderRadius: '11px', background: swatch, border: `1px solid ${BOARD_HAIR}` })}"></span>
  <span style="${s({ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '0', flex: '1' })}">
    <span style="${s({ display: 'flex', alignItems: 'baseline', gap: '9px', flexWrap: 'wrap' })}">
      <span style="${s({ fontSize: '13px', fontWeight: 700, color: BOARD_T1 })}">${path}</span>
      <span style="${t('numericXs', { fontSize: '11px', color: BOARD_T3 })}">${c}</span>
      ${badge}
    </span>
    <span style="${s({ fontSize: '12.5px', fontWeight: 450, lineHeight: '1.45', color: BOARD_T2, textWrap: 'pretty' })}">${use}</span>
  </span>
</div>`;
  };
  return `<div style="${s({ flex: '1', minWidth: '0', background: BOARD_SURF, border: `1px solid ${BOARD_HAIR}`, borderRadius: '20px', padding: '20px 22px' })}">
  <div style="${s({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' })}"><span style="${s({ width: '13px', height: '13px', borderRadius: '4px', background: T.canvas, border: `1px solid ${BOARD_HAIR}` })}"></span><span style="${t('title', { fontSize: '17px', color: BOARD_T1 })}">${title}</span></div>
${TOKENS.map(([g, rows]) => `  <div style="${s({ marginTop: '18px' })}"><div style="${t('micro', { color: BOARD_T3, fontSize: '10px' })}">${g}</div>${rows.map(swatchRow).join('')}</div>`).join('\n')}
</div>`;
}

const TYPE_ROWS = [
  ['displayXl', '1,240', 'The number inside each ring, and nothing else.'],
  ['displayLg', 'Today', 'Screen titles.'],
  ['title', 'Bench Press', 'Card titles, exercise names, sheet titles.'],
  ['tileName', 'Chicken Breast', 'The quick-add tile name and a search row’s name. The one size tuned for arm’s length.'],
  ['body', 'Chicken &amp; Rice', 'Log rows, settings rows, running text.'],
  ['numeric', '80 kg × 8', 'Every mid-size number outside a ring. Tabular so columns never jitter.'],
  ['label', 'Last: 80 kg × 8 · 4 days ago', 'Captions, secondary lines, the serving line under a search row.'],
  ['micro', 'Quick add', 'Section eyebrows and tags. Never for anything you must read.'],
];
const specOf = (role) => { const st = TT[role], f = fontInstances[st.fontFamily]; return `${st.fontFamily} · ${st.fontSize} / ${st.lineHeight} · ${f.wght} · width ${f.wdth}${st.letterSpacing ? ` · ${st.letterSpacing > 0 ? '+' : '−'}${Math.abs(st.letterSpacing)}` : ''}${st.textTransform ? ' · caps' : ''}`; };

const SPACE_USE = {
  1: 'The tightest gap: a micro label above the number it names.',
  2: 'Inside a control — icon to label, number to unit.',
  3: 'Between a section eyebrow and the thing it heads.',
  4: 'Between quick-add tiles, between the grid and the search bar, between the two chips.',
  5: 'The default gap between two cards. If you are unsure, it is this one.',
  6: 'Card padding; the gutter on Workout, Charts, Settings and inside sheets.',
  7: 'The Today gutter — Today gets more air than any other screen.',
  8: 'Between two settings groups.',
  9: 'Above a screen-level heading in a long scroll.',
};
const RADIUS_USE = {
  xs: 'Set-index badges, the MEAL tag, micro pills inside a row.',
  sm: 'A segment inside a segmented track; small utility buttons.',
  md: 'Steppers, stat cells, portion steps, the search field, primary buttons.',
  lg: 'The quick-add tile, the search bar, the chips, settings groups.',
  xl: 'Sheet top corners, the undo toast, the rest bar, the account card.',
  card: 'Cards. The largest thing on any screen, so the roundest.',
  pill: 'Genuinely pill-shaped things: avatars, dots, grabbers, the slider.',
};

function arcCard(T, title) {
  const A = T.c.arc;
  const cell = (ringHtml, caption, col, note) => `<div style="${s({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' })}">${ringHtml}<div style="${t('label', { fontWeight: 650, color: col })}">${caption}</div><div style="${t('caption', { color: T.t3 })}">${note}</div></div>`;
  return `<div style="${s({ flex: '1', minWidth: '0', background: T.c.card.bg, border: `1px solid ${BOARD_HAIR}`, borderRadius: '20px', padding: '20px' })}">
  <div style="${t('micro', { color: T.t2, marginBottom: '16px' })}">${title}</div>
  <div style="${s({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '22px 12px' })}">
    ${cell(ring(T, { value: 1240, target: 2400, shown: '1,240', of: '2,400', label: 'Kcal', color: A.kcal, dim: A.kcalOverBase }), '1,160 left', A.kcalText, 'Under target')}
    ${cell(ring(T, { value: 2400, target: 2400, shown: '2,400', of: '2,400', label: 'Kcal', color: A.kcal, dim: A.kcalOverBase }), 'Target hit', A.kcalText, 'Exactly on — the only full bright ring')}
    ${cell(ring(T, { value: 2580, target: 2400, shown: '2,580', of: '2,400', label: 'Kcal', color: A.kcal, dim: A.kcalOverBase }), '180 over', A.kcalText, 'Over: muted lap, knocked-out second lap, tick')}
    ${cell(ring(T, { value: 192, target: 180, shown: '192', of: '180 g', label: 'Protein', color: A.protein, dim: A.proteinOverBase }), '12 g past', A.proteinText, 'Same shape; protein past target is not a warning')}
  </div>
</div>`;
}

function componentColumn(T, title) {
  const ground = (bg, inner) => `<div style="${s({ background: bg, borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', border: `1px solid ${BOARD_HAIR}` })}">${inner}</div>`;
  const lab = (x) => `<span style="${t('micro', { color: T.t3, fontSize: '9.5px' })}">${x}</span>`;
  return `<div style="${s({ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '12px' })}">
  <div style="${t('micro', { color: BOARD_T2 })}">${title}</div>
  ${ground(T.canvas, `${lab('Search bar · rest, pressed, day one')}<div style="${s({ width: '350px', display: 'flex', flexDirection: 'column', gap: '10px' })}">${searchBar(T)}${searchBar(T, 'press')}${searchBar(T, 'emphasis')}</div>${lab('Undo toast')}<div style="${s({ width: '358px' })}">${toast(T, { title: 'Rice, cooked', meta: '195 kcal · 4 g protein' }, { inline: true })}</div>`)}
  ${ground(T.c.searchSheet.bg, `${lab('Rows · rest, meal, pressed, logged, create')}<div style="${s({ width: W + 'px', margin: '0 -16px' })}">${resultRow(T, RESULTS[0], 'rest', true)}${resultRow(T, RESULTS[1])}${resultRow(T, RESULTS[3], 'press')}${resultRow(T, RECENT[0], 'logged')}${createRow(T, 'egg')}</div>${lab('Search field · focused')}<div style="${s({ width: W + 'px', margin: '0 -16px' })}">${searchField(T, 'egg')}</div>${lab('Portion steps · unit segments')}<div style="${s({ width: '358px', display: 'flex', flexDirection: 'column', gap: '12px' })}">${segmented(T, ['1 pot · 150 g', '100 g', '1 tbsp · 15 g'], '1 pot · 150 g', { grow: true })}${portionSteps(T)}</div>${lab('Exact slider')}<div style="${s({ width: '358px' })}">${sliderRow(T)}</div>`)}
</div>`;
}

function specimenBoard() {
  const typeGrid = Object.keys(TT).filter((k) => !TYPE_ROWS.some(([r]) => r === k));
  return `<div style="${s({ width: '1240px', background: BOARD, padding: '40px', fontFamily: FONT, color: BOARD_T1 })}">
${boardHead('Colour, type &amp; components', `Dark is the product; light is the courtesy. This board is generated from ${hl('src/theme/tokens.ts')} — every swatch, ratio and size below is read from that file, so the spec and the code cannot disagree. Each token has one stated job.`)}
<div style="${s({ display: 'flex', gap: '20px', alignItems: 'flex-start' })}">
${tokenTable(DARK, 'Dark — primary')}
${tokenTable(LIGHT, 'Light')}
</div>

${panel('Arcs — under, on, and over target', `Past target a ring must never read as a triumphant full circle, and “over” must survive greyscale. The completed lap drops to ${hl('arc.kcalOverBase')}; the overage is a second bright lap with a ${size.arc.overKnockout} pt ${hl('arc.overKnockout')} cut either side; a ${size.arc.targetTickLength} pt ${hl('arc.targetTickIcon')} crosses the ring at 12 o’clock; and the caption changes from “left” to “over”.`, `<div style="${s({ display: 'flex', gap: '20px' })}">${arcCard(DARK, 'Dark')}${arcCard(LIGHT, 'Light')}</div>`, { marginTop: '34px' })}

${panel('New components, both themes', 'The search bar, rows, undo toast, portion steps and slider on the grounds they actually sit on. Light is not an afterthought: every state here is in the contrast suite.', `<div style="${s({ display: 'flex', gap: '20px', alignItems: 'flex-start' })}">${componentColumn(DARK, 'Dark')}${componentColumn(LIGHT, 'Light')}</div>`)}

${panel('Type — Archivo, one family, cut into static instances', 'React Native cannot drive a variable axis, so each weight × width the design uses ships as its own font file. Numbers are set in the expanded cuts so they read as instrument readouts; words stay at normal width. Tabular figures everywhere.', `${TYPE_ROWS.map(([role, sample, use]) => `  <div style="${s({ display: 'flex', gap: '24px', alignItems: 'center', padding: '15px 0', borderTop: `1px solid ${BOARD_HAIR}` })}">
    <span style="${s({ width: '300px', flex: 'none', color: BOARD_T1, ...TYPE[role] })}">${sample}</span>
    <span style="${s({ width: '290px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '4px' })}"><span style="${s({ fontSize: '13px', fontWeight: 700, color: BOARD_T1 })}">type.${role}</span><span style="${t('numericXs', { fontSize: '11px', color: BOARD_T3 })}">${specOf(role)}</span></span>
    <span style="${s({ flex: '1', fontSize: '12.5px', lineHeight: '1.45', color: BOARD_T2, textWrap: 'pretty' })}">${use}</span>
  </div>`).join('\n')}
  <div style="${t('micro', { color: BOARD_T3, fontSize: '10px', marginTop: '18px', marginBottom: '6px' })}">Every other role in tokens.ts</div>
  <div style="${s({ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0 24px' })}">${typeGrid.map((role) => `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '3px', padding: '9px 0', borderTop: `1px solid ${BOARD_HAIR}` })}"><span style="${s({ fontSize: '12.5px', fontWeight: 700, color: BOARD_T1 })}">type.${role}</span><span style="${t('numericXs', { fontSize: '10.5px', color: BOARD_T3 })}">${specOf(role)}</span></div>`).join('')}</div>`)}

<div style="${s({ display: 'flex', gap: '20px', alignItems: 'flex-start' })}">
${panel('Space', 'Nine steps, no ad-hoc values. Every gap and padding on every screen is one of these names.', Object.entries(space).map(([k, v]) => `    <div style="${s({ display: 'flex', gap: '14px', alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${BOARD_HAIR}` })}">
      <span style="${s({ width: '34px', flex: 'none', display: 'flex', justifyContent: 'center' })}"><span style="${s({ width: v + 'px', height: '30px', background: DARK.kcal, borderRadius: '2px' })}"></span></span>
      <span style="${s({ width: '108px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '3px' })}"><span style="${s({ fontSize: '12.5px', fontWeight: 700, color: BOARD_T1 })}">space.${k}</span><span style="${t('numericXs', { fontSize: '11px', color: BOARD_T3 })}">${v} pt</span></span>
      <span style="${s({ flex: '1', minWidth: '0', fontSize: '12px', lineHeight: '1.45', color: BOARD_T2, textWrap: 'pretty' })}">${SPACE_USE[k]}</span>
    </div>`).join('\n'), { flex: '1', minWidth: '0' })}
${panel('Radius', 'Radius encodes size: the bigger the object, the rounder it is. Seven steps, and nothing in between.', Object.entries(radius).map(([k, v]) => `    <div style="${s({ display: 'flex', gap: '14px', alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${BOARD_HAIR}` })}">
      <span style="${s({ width: '46px', height: '38px', flex: 'none', background: DARK.raised, border: `1px solid ${DARK.line}`, borderRadius: v + 'px' })}"></span>
      <span style="${s({ width: '108px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '3px' })}"><span style="${s({ fontSize: '12.5px', fontWeight: 700, color: BOARD_T1 })}">radius.${k}</span><span style="${t('numericXs', { fontSize: '11px', color: BOARD_T3 })}">${v === 999 ? 'fully rounded' : v + ' pt'}</span></span>
      <span style="${s({ flex: '1', minWidth: '0', fontSize: '12px', lineHeight: '1.45', color: BOARD_T2, textWrap: 'pretty' })}">${RADIUS_USE[k]}</span>
    </div>`).join('\n'), { flex: '1', minWidth: '0' })}
</div>
</div>`;
}

/* -------------------------------------------------------- motion + a11y */
const ms = (e) => `${EV[e].duration} ms`;
const MOTION = [
  ['Quick-add tap', 'The tile scales 1 → 0.972 → 1. Nothing else on the screen moves.', `${EV.tilePressIn.duration} ms down / ${EV.tilePressOut.duration} ms up · ease-out`, 'No scale. The tick and the haptic still fire.'],
  ['Food logged', 'The calorie arc sweeps to its new length; the amber wash arrives across the tile and leaves.', `arc ${ms('arcSweep')} · cubic-bezier(.2,0,0,1)<br>wash ${EV.loggedWashIn.duration} in / ${interaction.tileLoggedHoldMs} hold / ${EV.loggedWashOut.duration} out`, 'Arc jumps to the new value. The wash is a static state for its hold.'],
  [`Second tap within ${interaction.repeatWindowMs / 1000} s`, 'The same food again — from the tile or from search — adds a portion to the same entry. The ×2 badge pops on, the arc sweeps again, the toast updates.', `badge ${ms('repeatBadge')} · standard<br>window ${interaction.repeatWindowMs / 1000} s`, 'Badge fades in over 120 ms; arc jumps.'],
  ['Undo toast', `Rises 16 pt above the tab bar and fades in. Stays until your next action, or ${interaction.undoAutoDismissMs / 1000} s, whichever comes first.`, `${ms('toastIn')} in / ${ms('toastOut')} out · ease-out`, 'Fade only, no rise. Dismissal rules unchanged.'],
  ['Long-press → portion sheet', 'After the hold, the sheet rises from the bottom edge and the screen behind dims.', `hold ${interaction.longPressMs} ms · sheet ${ms('sheetIn')} · spring, damping ${motion.spring.sheet.dampingRatio}`, 'Cross-fade, 120 ms.'],
  ['Presets ↔ Exact', 'The preset steps cross-fade into the slider in place; the sheet grows to fit.', `${ms('portionModeSwap')} · standard`, 'Instant swap.'],
  ['Slider detent', `Released within ${interaction.sliderDetentSnapG} g of a preset, the thumb settles onto it with a selection tick.`, `${ms('sliderSnap')} · ease-out`, 'The thumb jumps; the haptic tick stays.'],
  ['Search bar → sheet', 'The sheet rises from the bottom edge with its own field already in it; the field takes focus once the sheet has arrived, and the keyboard comes up behind it. The bar itself does not travel — a lift would have to hand first responder over mid-transition (issue #79).', `sheet ${ms('sheetIn')} · spring, damping ${motion.spring.sheet.dampingRatio}<br>focus after the sheet lands`, 'Cross-fade, 120 ms. The keyboard is the phone’s own.'],
  ['Result row tap', 'Pressed colour on touch, a Logged beat, then the sheet closes and the undo toast appears on Today.', `press ${ms('rowPress')} · hold ${interaction.rowLoggedHoldMs} ms · sheet out ${ms('sheetOut')}`, 'Colour changes kept; the sheet fades out.'],
  ['Result row long-press', 'The portion sheet rises over the search sheet. Logging from it closes both.', `hold ${interaction.longPressMs} ms · sheet ${ms('sheetIn')}`, 'Cross-fade, 120 ms.'],
  ['Set logged', 'The active set row collapses 102 → 44 pt and the next set expands into its place.', `${ms('setCollapse')} · ease-in-out`, 'Instant swap. The rest timer still starts.'],
  ['Rest timer', 'The ring depletes continuously; the last three seconds pulse.', `1 s per tick · linear · pulse ${ms('restPulse')}`, 'Ring still depletes — it is information, not decoration. The pulse is dropped.'],
  ['Tab change', 'The screen swaps and the tab icon thickens from 1.7 to 2.0 stroke. No cross-fade: the swipe-between-tabs carousel (issue #82) moves screens with the finger, and a fade laid over a tracked gesture only blurs it. The carousel brings its own motion token when it lands.', 'icon stroke only · carousel motion pending #82', 'Icon state change only — nothing vestibular either way.'],
  ['Chart draw-in', 'Trend and average lines stroke on left-to-right; the daily points fade in behind them.', `${ms('chartDraw')} · ${EV.chartDraw.staggerMs} ms stagger · ease-out<br>once per screen entry`, 'Charts render complete. No draw-on.'],
  ['Range switch', 'Axis rescales and the path morphs between the two ranges.', `${ms('rangeMorph')} · ease-in-out`, 'Instant redraw.'],
  ['Sync', 'A 2 pt progress hairline runs under the header while a push/pull is in flight.', 'continuous · indeterminate', 'Replaced by a static “Syncing…” label. Never blocks anything.'],
  ['Screen push', 'Platform default — iOS slide-from-right, Android fade-through.', 'platform', 'Platform’s own reduced-motion behaviour, untouched.'],
];
const HAPTIC_WHY = {
  foodLogged: ['Food logged', 'The confirmation. This is what replaces a Save button — from a tile, a row, a step or Log.'],
  setLogged: ['Set logged', 'Lighter — it happens 20+ times a session.'],
  undo: ['Undo', 'Light, so an undo never feels like a second log.'],
  sliderDetent: ['Slider detent', 'A tick on arrival at a preset, so you can land on “1 pot” without looking.'],
  restFinished: ['Rest finished', 'Fires even when the screen is off.'],
  ringCompleted: ['Ring completed', 'Once per ring per day. Earned, so it stays special.'],
  servingPicked: ['Serving picked', 'Choosing a serving chip in the food form — a selection change, like a picker detent.'],
  destructiveConfirm: ['Destructive confirm', 'Delete a food, discard a session.'],
};
const TARGETS = [
  ['Quick-add tile', '169 × 80', '—', 'The primary action. Deliberately enormous.'],
  ['Search foods bar', `350 × ${size.searchBar.height}`, '—', 'The only way into search. Under the grid, in the thumb zone.'],
  ['Search row · Recent row · Create row', `390 × ${size.resultRow.height}`, '—', 'Full bleed; the whole row is the target.'],
  ['Set-complete button', `${size.stepper.completeWidth} × ${size.stepper.completeHit}`, '—', 'The primary action on Workout.'],
  ['Weight / workout chip', `170 × ${size.chip.height}`, '—', ''],
  ['Portion step', `65 × ${size.portionSheet.stepHeight}`, '—', 'Tapping one logs immediately.'],
  ['Presets / Exact · unit segment', `n × ${size.portionSheet.segmentPainted} painted`, `n × ${size.portionSheet.segmentHit}`, 'The track is the hit area.'],
  ['Slider thumb', `${size.slider.thumb} × ${size.slider.thumb} painted`, `${size.slider.thumbHit} × ${size.slider.thumbHit}`, 'The whole track is draggable too.'],
  ['Slider −5 / +5 g', `${size.slider.nudgeWidth} × ${size.slider.nudgeHit}`, '—', `Held repeat after ${interaction.stepperRepeatDelayMs} ms.`],
  ['Log 185 g · Save &amp; log', `358 × ${size.button.primaryHit}`, '—', 'Pinned at the bottom, in the thumb zone.'],
  ['Undo', `${size.toast.undoMinWidth} × ${size.toast.undoHit}`, '—', 'The floor. Nothing is smaller.'],
  ['Search Cancel · clear ×', `60 × ${size.searchSheet.cancelHit} · ${size.searchSheet.clearHit} × ${size.searchSheet.clearHit}`, '—', 'Beside the field, above the keyboard.'],
  ['Stepper − / +', `${size.stepper.buttonWidth} × ${size.stepper.buttonHit}`, '—', `Held repeat after ${interaction.stepperRepeatDelayMs} ms.`],
  ['Tab bar item', `97 × ${size.tabBar.itemHit}`, '—', 'Full-height strip, not just the icon.'],
  ['Segmented option (Settings)', `46 × ${size.segmented.painted} painted`, `46 × ${size.segmented.optionHit}`, 'hitSlop extends it to the row height.'],
  ['Range switcher segment', '67 × 36 painted', `67 × ${size.segmented.rangeHit}`, 'hitSlop extends it to the control height.'],
  ['Settings row', `358 × ${size.row.settings}`, '—', ''],
  ['Log row (swipe to delete)', `350 × ${size.row.log} painted`, `350 × ${size.row.logHit}`, 'hitSlop 2 pt top and bottom.'],
];

function motionBoard() {
  const th = (txt, w) => `<span style="${s({ width: w, flex: w === '1' ? '1' : 'none', ...TYPE.micro, fontSize: '9.5px', color: BOARD_T3 })}">${txt}</span>`;
  const td = (txt, w, o = {}) => `<span style="${s({ width: w, flex: w === '1' ? '1' : 'none', minWidth: '0', fontSize: o.size || '12.5px', fontWeight: o.weight || 450, lineHeight: '1.45', color: o.color || BOARD_T2, textWrap: 'pretty' })}">${txt}</span>`;
  const table = (heads, rows, fmt, pad = '12px 0') => `<div style="${s({ display: 'flex', gap: '20px', padding: '0 0 9px' })}">${heads.map(([h, w]) => th(h, w)).join('')}</div>
${rows.map((r) => `<div style="${s({ display: 'flex', gap: '20px', padding: pad, borderTop: `1px solid ${BOARD_HAIR}`, alignItems: 'flex-start' })}">${fmt(r)}</div>`).join('\n')}`;

  const motionTable = table([['Event', '200px'], ['What moves', '1'], ['Duration &amp; curve', '250px'], ['Reduce motion', '280px']], MOTION,
    ([a, b, c, d]) => `${td(a, '200px', { color: BOARD_T1, weight: 700, size: '13px' })}${td(b, '1')}${td(c, '250px', { color: BOARD_T3, size: '11.5px', weight: 550 })}${td(d, '280px')}`, '13px 0');

  const gestureTable = table([['Gesture', '190px'], ['On a quick-add tile', '1'], ['On a search row', '1'], ['What tells you it worked', '270px']], [
    ['Tap', 'Logs one serving.', 'Logs one serving. The row shows Logged, the sheet closes, you are back on Today.', 'Haptic · Logged state · undo toast naming the food'],
    [`Same food again within ${interaction.repeatWindowMs / 1000} s`, 'Adds a portion to the same entry — the tile shows ×2.', 'Searching and tapping it again merges the same way: one entry, ×2.', 'Haptic · ×2 badge · toast updates to “×2”'],
    [`Long-press ${interaction.longPressMs} ms`, 'Opens the portion sheet.', 'Opens the same portion sheet, over the search sheet.', 'The sheet rising'],
    ['Portion step', 'Logs that amount, closes the sheet.', 'Logs that amount, closes both sheets.', 'Haptic · undo toast'],
    ['Exact → slider → Log', 'Logs any amount in grams.', 'Logs any amount in grams.', 'Detent ticks on the way · haptic · undo toast'],
  ], ([a, b, c, d]) => `${td(a, '190px', { color: BOARD_T1, weight: 700, size: '13px' })}${td(b, '1')}${td(c, '1')}${td(d, '270px', { color: BOARD_T3, size: '12px', weight: 550 })}`);

  const step = (n) => `<span style="${s({ width: '22px', height: '22px', flex: 'none', borderRadius: '999px', background: DARK.kcal, color: DARK.onKcal, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPE.numericXs })}">${n}</span>`;
  const typed = (x) => `<span style="${s({ padding: '3px 8px', borderRadius: '6px', border: `1px dashed ${BOARD_HAIR}`, color: BOARD_T2, fontSize: '12.5px', whiteSpace: 'nowrap' })}">${x}</span>`;
  const act = (x) => `<span style="${s({ fontSize: '13px', fontWeight: 600, color: BOARD_T1, whiteSpace: 'nowrap' })}">${x}</span>`;
  const flow = (name, total, parts) => `<div style="${s({ display: 'flex', gap: '20px', alignItems: 'center', padding: '14px 0', borderTop: `1px solid ${BOARD_HAIR}` })}">
  <span style="${s({ width: '190px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '3px' })}"><span style="${s({ fontSize: '13px', fontWeight: 700, color: BOARD_T1 })}">${name}</span><span style="${t('numericSm', { color: DARK.kcal })}">${total}</span></span>
  <span style="${s({ flex: '1', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' })}">${parts.join(`<span style="color:${BOARD_T3}">→</span>`)}</span>
</div>`;
  const budget = `${flow('A quick-add tile', '1 tap', [`${step(1)}${act('the tile')}`])}
${flow('A recent food', '2 taps', [`${step(1)}${act('Search foods')}`, `${step(2)}${act('the row under Recent')}`])}
${flow('A known food', '2 taps + a few letters', [`${step(1)}${act('Search foods')}`, typed('egg'), `${step(2)}${act('Boiled Eggs')}`])}
${flow('A new food', '3 taps + name and numbers', [`${step(1)}${act('Search foods')}`, typed('boiled eggs'), `${step(2)}${act('Create “boiled eggs”')}`, typed('2 eggs · 100 g · 155 · 13'), `${step(3)}${act('Save &amp; log')}`])}`;

  const hapticTable = table([['Moment', '190px'], ['iOS', '220px'], ['Android', '220px'], ['Why', '1']], Object.entries(haptics),
    ([k, h]) => `${td(HAPTIC_WHY[k][0], '190px', { color: BOARD_T1, weight: 700, size: '13px' })}${td(h.ios, '220px', { color: DARK.kcal, size: '12px', weight: 600 })}${td(h.android, '220px', { color: DARK.prot, size: '12px', weight: 600 })}${td(HAPTIC_WHY[k][1], '1')}`);

  const targetTable = table([['Element', '260px'], ['Painted size (pt)', '210px'], ['Hit area (pt)', '130px'], ['Note', '1']], TARGETS,
    ([a, b, c, d]) => `${td(a, '260px', { color: BOARD_T1, weight: 650, size: '13px' })}${td(b, '210px', { color: DARK.ok, size: '12.5px', weight: 650 })}${td(c, '130px', { color: c === '—' ? BOARD_T3 : DARK.ok, size: '12.5px', weight: 650 })}${td(d, '1')}`, '11px 0');

  // contrast: computed from contrastPairs in tokens.ts — the same list the test suite enforces
  const scored = contrastPairs.map((p) => ({ p, d: pairRatio(DARK, p), l: pairRatio(LIGHT, p) }));
  const worst = [...scored].sort((a, b) => Math.min(a.d, a.l) - Math.min(b.d, b.l)).slice(0, 18);
  const badge = (r) => `<span style="${t('numericXs', { fontSize: '12px', padding: '3px 8px', borderRadius: '6px', background: r >= MIN_TEXT_CONTRAST ? 'rgba(123,215,127,0.16)' : 'rgba(246,109,103,0.18)', color: r >= MIN_TEXT_CONTRAST ? DARK.ok : DARK.danger })}">${r.toFixed(2)}:1</span>`;
  const minD = Math.min(...scored.map((x) => x.d)), minL = Math.min(...scored.map((x) => x.l));
  const contrastTable = `${table([['Pair — the 18 tightest of ' + scored.length, '1'], ['Dark', '150px'], ['Light', '150px']], worst,
    ({ p, d, l }) => `${td(`${p.fg} <span style="color:${BOARD_T3}">on</span> ${p.on.join(' + ')}`, '1', { color: BOARD_T1, weight: 550, size: '13px' })}<span style="${s({ width: '150px', flex: 'none' })}">${badge(d)}</span><span style="${s({ width: '150px', flex: 'none' })}">${badge(l)}</span>`, '10px 0')}
<div style="${s({ display: 'flex', gap: '20px', padding: '13px 0 0', borderTop: `1px solid ${BOARD_HAIR}`, alignItems: 'center' })}">${td(`Worst case across all ${scored.length} pairs`, '1', { color: BOARD_T1, weight: 700, size: '13px' })}<span style="${s({ width: '150px', flex: 'none' })}">${badge(minD)}</span><span style="${s({ width: '150px', flex: 'none' })}">${badge(minL)}</span></div>`;

  const rules = stack([
    `Nothing runs longer than ${motion.ceilingMs} ms except the chart draw-in, which happens once per screen entry.`,
    'Every animation is interruptible. A second tap during a ring sweep retargets it; it never queues, and it never blocks the log.',
    'Motion is never the only signal. Every animated confirmation also has a static one — a colour, a tick, a number that changed — and a haptic.',
    `${hl('reduce motion')} is read from the OS and is also an app setting, so it can be turned on for Vitals alone. Every event in tokens.ts carries its reduced form.`,
    'Haptics survive reduce motion. They are feedback, not animation, and on a gym floor they are often the only confirmation you get.',
  ].map((x) => callout(x)), 11);

  return `<div style="${s({ width: '1240px', background: BOARD, padding: '40px', fontFamily: FONT, color: BOARD_T1 })}">
${boardHead('Motion, gestures, haptics &amp; access', `Motion here is feedback for an action you just took — never decoration, never the only way you learn something happened. Every duration, size and ratio on this board is read from ${hl('src/theme/tokens.ts')}.`)}
${panel('What animates', '', motionTable)}
${panel('Gestures — the tile and every search row', 'A search row is a quick-add tile laid out as a list. Nothing new to learn: the same three gestures, the same confirmations.', gestureTable)}
${panel('Tap budget', 'What it costs to log, counted in taps. Search adds one tap to the tile’s one — and only for foods that are not in the six.', budget)}
${panel('Rules', '', rules)}
${panel('Haptics', 'The haptic is what replaces the Save button. If it does not fire, the user does not know the food was logged.', hapticTable)}
${panel('Tap targets', `Minimum ${size.tapTargetMin} × ${size.tapTargetMin} pt. Where the painted control is smaller, the touch area is extended and both figures are listed. The header search button is gone — search is the bar under the grid.`, targetTable)}
${panel('Text &amp; icon contrast', `WCAG AA needs ${MIN_TEXT_CONTRAST}:1. The ${scored.length} pairs in ${hl('contrastPairs')} are computed from the token values in both themes — translucent layers composited onto what sits beneath them, pressed states included — and ${hl('src/theme/tokens.test.tsx')} fails the build if any drops below. The four ${hl('data.*Muted')} colours are deliberately not text: they paint the scattered daily points and the base lap of an over-target ring, and every number they suggest is also stated in words.`, contrastTable)}
</div>`;
}

/* ------------------------------------------------------------------- output */
function dc(inner, bg, T = DARK) {
  return `<!doctype html>
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
    body { margin: 0; background: ${bg}; font-family: ${FONT}; -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }
    a { color: ${T.kcal}; text-decoration: none; }
    a:hover { color: ${T.c.fill.kcalPress}; }
    text { font-variant-numeric: tabular-nums; }
  </style>
</helmet>
${inner}
</x-dc>
</body>
</html>`;
}

const files = {
  'Main.dc.html':             dc(todayScreen(DARK), DARK.canvas),
  'Workout.dc.html':          dc(workoutScreen(DARK), DARK.canvas),
  'Charts.dc.html':           dc(chartsScreen(DARK), DARK.canvas),
  'Settings.dc.html':         dc(settingsScreen(DARK), DARK.canvas),
  'Search.dc.html':           dc(searchScreen(DARK, { mode: 'recent', states: ['logged'] }), DARK.canvas),
  'SearchTyped.dc.html':      dc(searchScreen(DARK, { mode: 'results', query: 'egg', states: ['press'] }), DARK.canvas),
  'CreateFood.dc.html':       dc(createFoodScreen(DARK), DARK.canvas),
  'QuickAdd.dc.html':         dc(quickAddBoard(), BOARD),
  'Portion.dc.html':          dc(portionBoard(), BOARD),
  'Empty.dc.html':            dc(emptyBoard(), BOARD),
  'TodayLight.dc.html':       dc(todayScreen(LIGHT), LIGHT.canvas, LIGHT),
  'WorkoutLight.dc.html':     dc(workoutScreen(LIGHT), LIGHT.canvas, LIGHT),
  'ChartsLight.dc.html':      dc(chartsScreen(LIGHT), LIGHT.canvas, LIGHT),
  'SettingsLight.dc.html':    dc(settingsScreen(LIGHT), LIGHT.canvas, LIGHT),
  'SearchLight.dc.html':      dc(searchScreen(LIGHT, { mode: 'recent', states: ['logged'] }), LIGHT.canvas, LIGHT),
  'SearchTypedLight.dc.html': dc(searchScreen(LIGHT, { mode: 'results', query: 'egg', states: ['press'] }), LIGHT.canvas, LIGHT),
  'Specimen.dc.html':         dc(specimenBoard(), BOARD),
  'Motion.dc.html':           dc(motionBoard(), BOARD),
};

const canvas = {
  pages: [
    { id: 'page-1', name: 'Screens — dark' },
    { id: 'page-2', name: 'Light theme & system' },
  ],
  artboards: [
    { file: 'Main.dc.html',        title: 'Today',                    x: 0,    y: 0, w: 390, h: 844,  page: 'page-1' },
    { file: 'Workout.dc.html',     title: 'Workout — active',         x: 500,  y: 0, w: 390, h: 844,  page: 'page-1' },
    { file: 'Charts.dc.html',      title: 'Charts — full scroll',     x: 1000, y: 0, w: 390, h: 1760, page: 'page-1' },
    { file: 'Settings.dc.html',    title: 'Settings — full scroll',   x: 1500, y: 0, w: 390, h: SETTINGS_H, page: 'page-1' },
    { file: 'Search.dc.html',      title: 'Search — recent (row just logged)', x: 2000, y: 0, w: 390, h: 844, page: 'page-1' },
    { file: 'SearchTyped.dc.html', title: 'Search — typed (row pressed)',      x: 2500, y: 0, w: 390, h: 844, page: 'page-1' },
    { file: 'CreateFood.dc.html',  title: 'Add food — from Create',   x: 3000, y: 0, w: 390, h: 844,  page: 'page-1' },
    { file: 'QuickAdd.dc.html',    title: 'Quick add — tile, bar & rows', x: 0, y: 1990, w: 1060, h: 1540, page: 'page-1' },
    { file: 'Portion.dc.html',     title: 'Portions & undo',          x: 1180, y: 1990, w: 1330, h: 1620, page: 'page-1' },
    { file: 'Empty.dc.html',       title: 'Empty states',             x: 2630, y: 1990, w: 2166, h: 1150, page: 'page-1' },

    { file: 'TodayLight.dc.html',       title: 'Today — light',            x: 0,    y: 0, w: 390, h: 844,  page: 'page-2' },
    { file: 'WorkoutLight.dc.html',     title: 'Workout — light',          x: 500,  y: 0, w: 390, h: 844,  page: 'page-2' },
    { file: 'ChartsLight.dc.html',      title: 'Charts — light',           x: 1000, y: 0, w: 390, h: 1760, page: 'page-2' },
    { file: 'SettingsLight.dc.html',    title: 'Settings — light',         x: 1500, y: 0, w: 390, h: SETTINGS_H, page: 'page-2' },
    { file: 'SearchLight.dc.html',      title: 'Search — recent, light',   x: 2000, y: 0, w: 390, h: 844,  page: 'page-2' },
    { file: 'SearchTypedLight.dc.html', title: 'Search — typed, light',    x: 2500, y: 0, w: 390, h: 844,  page: 'page-2' },
    { file: 'Specimen.dc.html',         title: 'Colour, type & components', x: 3000, y: 0, w: 1240, h: 6560, page: 'page-2' },
    { file: 'Motion.dc.html',           title: 'Motion, gestures, haptics & access', x: 4360, y: 0, w: 1240, h: 5000, page: 'page-2' },
  ],
  annotations: [
    { id: 'start-here', page: 'page-1', x: 0, y: -300, w: 880, text: 'CHECKPOINT 1 — SIGNED OFF, NOW REVISED (issue #16)\n\nWhat changed since you signed off:\n• Search: a full-width “Search foods” bar under the grid replaces the header button. Search sheets, Create, and the add-food form are on this page (right).\n• Portions: presets plus an Exact slider for any amount. Double-tap adds a portion. See “Portions & undo” below.\n• Undo no longer disappears after 4 seconds — it stays until your next action.\n• Settings: the unit switch is gone. kg and cm.\n\nThe light theme and the full colour / type / motion specs are on page 2. They are now generated from the code’s own token file.' },
    { id: 'charts-note', page: 'page-1', x: 940, y: -300, w: 440, text: 'Charts is one long scroll — the artboard shows the whole thing at once; on the phone the tab bar floats over it.\n\nThe top card is the one that matters. It answers the only question worth asking: is what I am eating actually working?' },
    { id: 'questions', page: 'page-1', x: 1450, y: -300, w: 440, text: 'YOUR THREE ANSWERS (Checkpoint 1)\n\n1. Six tiles, not nine — names stay at 16.5 pt.\n2. All three portion mechanisms: tap, long-press sheet with an Exact control, and a second tap to add a portion.\n3. kg and cm only — the unit switch is removed.' },
    { id: 'search-note', page: 'page-1', x: 2000, y: -300, w: 880, text: 'LOGGING ANY FOOD — e.g. boiled eggs\n\nTap “Search foods” under the grid. With nothing typed you see Recent: foods and meals from the last 14 days that are not already in your six. Type a few letters and results appear, saved meals labelled. The last row is always Create “what you typed”.\n\nRecent food: 2 taps. Known food: 2 taps + a few letters. New food: 3 taps + name and numbers.\n\nRows behave exactly like tiles: tap logs one serving, long-press opens the portion sheet.' },
    { id: 'checkpoint-2', page: 'page-1', x: 3000, y: -300, w: 440, text: 'FOR CHECKPOINT 2 — please try on a real bench\n\n• Undo stays until your next action, up to 3 minutes. Right length? Should scrolling dismiss it?\n• A second tap within 5 s merges into one “×2” entry. Does 5 s feel right?\n• Long-press at 220 ms: quick enough, or does it fire by accident?' },
    { id: 'tile-note', page: 'page-1', x: 0, y: 1830, w: 440, text: 'Everything on Today is secondary to this object. Judge it at arm’s length: hold the phone where you would hold it mid-set.' },
    { id: 'portion-note', page: 'page-1', x: 1180, y: 1830, w: 560, text: 'Presets are normalised; real consumption is not. Exact is the answer to “I had about 185 g” — and undo is designed for a phone lying on a bench.' },
    { id: 'empty-note', page: 'page-1', x: 2630, y: 1830, w: 560, text: 'Day one is the only day every user sees. No screen here shrugs — each one says what will fill it and what the first tap is. Today leads straight to search, and search to Create.' },
    { id: 'light-note', page: 'page-2', x: 0, y: -260, w: 880, text: 'The light theme. Same layout, same tokens, same code path — both palettes live side by side in src/theme/tokens.ts with identical keys, enforced by a test, so light can never drift away from dark as the app grows.' },
    { id: 'system-note', page: 'page-2', x: 3000, y: -260, w: 880, text: 'Every named token with the one job it is allowed to do, and its measured contrast. This board is generated from src/theme/tokens.ts — the spec and the code are the same file.' },
  ],
  launch: { view: 'canvas', page: 'page-1' },
};

for (const [name, src] of Object.entries(files)) writeFileSync(join(OUT, name), src);
writeFileSync(join(OUT, 'canvas.json'), JSON.stringify(canvas, null, 2));
console.log(Object.entries(files).map(([n, v]) => `${n.padEnd(26)} ${(v.length / 1024).toFixed(1)} KiB`).join('\n'));
console.log('canvas.json               ', canvas.artboards.length, 'artboards,', canvas.pages.length, 'pages');
