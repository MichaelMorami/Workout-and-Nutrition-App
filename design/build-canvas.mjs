// Vitals — design canvas generator.
// Emits the .dc.html artboards + canvas.json under design/canvas/.
// Dark and light are generated from the same markup so they can never drift.
// Run: node design/build-canvas.mjs
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'canvas');
mkdirSync(OUT, { recursive: true });
const D = JSON.parse(readFileSync(join(HERE, 'chart-data.json'), 'utf8'));

/* ------------------------------------------------------------------ palette */
const DARK = {
  name: 'dark',
  canvas: '#0C0E13', surface: '#17191F', raised: '#21252B', tile: '#25282F', press: '#2C3038',
  hair: '#32353D', line: '#494D55',
  t1: '#F5F7FA', t2: '#B4B7BE', t3: '#9598A0',
  kcal: '#FAAB3F', kcalDim: '#8F6127', kcalWash: 'rgba(250,171,63,0.13)',
  prot: '#57E0C6', protDim: '#307769', protWash: 'rgba(87,224,198,0.13)',
  body: '#96C0FE', bodyDim: '#476A9C', bodyWash: 'rgba(150,192,254,0.13)',
  str: '#E19FFF', strDim: '#7C588D', strWash: 'rgba(225,159,255,0.13)',
  danger: '#F66D67', ok: '#7BD77F',
  glow: (c) => `drop-shadow(0 0 10px ${c}55)`,
  shadow: '0 1px 0 rgba(255,255,255,0.045) inset, 0 8px 24px rgba(0,0,0,0.34)',
  tileShadow: '0 1px 0 rgba(255,255,255,0.05) inset',
  ghost: 'rgba(255,255,255,0.09)',
};
const LIGHT = {
  name: 'light',
  canvas: '#F9FAFD', surface: '#FFFFFF', raised: '#F1F3F8', tile: '#ECEEF4', press: '#E5E8ED',
  hair: '#DBDEE3', line: '#C1C4CB',
  t1: '#1A1D24', t2: '#575B63', t3: '#63666F',
  kcal: '#A25302', kcalDim: '#D79553', kcalWash: 'rgba(162,83,2,0.09)',
  prot: '#037567', protDim: '#63B4A3', protWash: 'rgba(3,117,103,0.09)',
  body: '#2E62C9', bodyDim: '#7FA5E6', bodyWash: 'rgba(46,98,201,0.09)',
  str: '#8E3EAE', strDim: '#C094D6', strWash: 'rgba(142,62,174,0.09)',
  danger: '#BE222A', ok: '#007936',
  glow: () => 'none',
  shadow: '0 1px 2px rgba(20,24,34,0.05), 0 8px 24px rgba(20,24,34,0.06)',
  tileShadow: '0 1px 2px rgba(20,24,34,0.05)',
  ghost: 'rgba(20,24,34,0.07)',
};

/* ------------------------------------------------------------------ helpers */
const s = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':' + v).join(';');
const FONT = "Archivo,'Helvetica Neue',Helvetica,system-ui,sans-serif";

// type ramp — the single source of truth for the specimen and every screen
const TYPE = {
  displayXl: { fontSize: '33px', fontWeight: 700, fontStretch: '118%', letterSpacing: '-0.022em', lineHeight: '1' },
  displayLg: { fontSize: '25px', fontWeight: 700, fontStretch: '116%', letterSpacing: '-0.018em', lineHeight: '1.06' },
  title:     { fontSize: '19px', fontWeight: 700, fontStretch: '104%', letterSpacing: '-0.012em', lineHeight: '1.2' },
  strong:    { fontSize: '16.5px', fontWeight: 650, fontStretch: '100%', letterSpacing: '-0.006em', lineHeight: '1.16' },
  bodyT:     { fontSize: '15px', fontWeight: 450, fontStretch: '100%', letterSpacing: '0', lineHeight: '1.35' },
  numeric:   { fontSize: '15px', fontWeight: 700, fontStretch: '108%', letterSpacing: '-0.008em', lineHeight: '1' },
  label:     { fontSize: '12.5px', fontWeight: 500, fontStretch: '100%', letterSpacing: '0', lineHeight: '1.3' },
  micro:     { fontSize: '10.5px', fontWeight: 650, fontStretch: '100%', letterSpacing: '0.14em', lineHeight: '1', textTransform: 'uppercase' },
};
const t = (k, extra = {}) => s({ ...TYPE[k], ...extra });

/* icons — 24px grid, stroke-based, one style */
const ico = (d, o = {}) => {
  const { size = 22, w = 1.75, c = 'currentColor', fill = 'none', extra = '' } = o;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none">${d}${extra}</svg>`;
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
  chev: '<path d="M9.6 5.6L16 12l-6.4 6.4"/>',
  scale: '<rect x="3.2" y="4.6" width="17.6" height="14.8" rx="3.4"/><path d="M7.6 15.4a4.4 4.4 0 0 1 8.8 0"/><path d="M12 15.4l2.6-3.6"/>',
  play: '<path d="M8.4 5.6l10 6.4-10 6.4z" stroke-linejoin="round"/>',
  timer: '<circle cx="12" cy="13.2" r="7.4"/><path d="M12 9.6v3.6l2.4 1.6M9.6 3.4h4.8"/>',
  layers: '<path d="M12 3.6l8.2 4.1-8.2 4.1-8.2-4.1z"/><path d="M3.8 12.6l8.2 4.1 8.2-4.1"/>',
  cloud: '<path d="M7.4 18.4a4.2 4.2 0 0 1-.3-8.4 5.4 5.4 0 0 1 10.4 1.1 3.7 3.7 0 0 1-.5 7.3z"/>',
  down: '<path d="M12 4.4v11.2M7.4 11.4l4.6 4.6 4.6-4.6M4.6 19.6h14.8"/>',
  up: '<path d="M12 19.6V8.4M7.4 12.6L12 8l4.6 4.6M4.6 4.4h14.8"/>',
  flag: '<path d="M5.6 20.4V4.2M5.6 5.2h11.8l-2.2 3.8 2.2 3.8H5.6"/>',
  dots: '<circle cx="5.6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.4" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  user: '<circle cx="12" cy="8.4" r="3.8"/><path d="M4.8 19.8a7.6 7.6 0 0 1 14.4 0"/>',
  skip: '<path d="M6.4 6l7.2 6-7.2 6zM17.2 5.6v12.8"/>',
};

/* ------------------------------------------------------------------ chrome */
const W = 390;
const STATUS = 59;   // real OS status bar lives here — we paint nothing into it
const TABH = 58, HOMEH = 26;

function tabbar(T, active) {
  const tabs = [['Today', I.today], ['Workout', I.workout], ['Charts', I.charts], ['Settings', I.settings]];
  const accent = { Today: T.kcal, Workout: T.str, Charts: T.body, Settings: T.t1 }[active];
  return `<nav style="${s({ position: 'absolute', left: 0, right: 0, bottom: 0, height: TABH + HOMEH + 'px', paddingBottom: HOMEH + 'px', display: 'flex', background: T.name === 'dark' ? 'rgba(12,14,19,0.86)' : 'rgba(249,250,253,0.88)', backdropFilter: 'blur(18px)', borderTop: `1px solid ${T.hair}` })}">
${tabs.map(([n, d]) => {
    const on = n === active;
    return `  <div style="${s({ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', height: TABH + 'px', color: on ? accent : T.t3 })}">${ico(d, { size: 23, w: on ? 2 : 1.7 })}<span style="${s({ fontSize: '10px', fontWeight: on ? 650 : 500, letterSpacing: '0.01em' })}">${n}</span></div>`;
  }).join('\n')}
</nav>`;
}

function phone(T, { height = 844, body, active, scroll = false }) {
  return `<div style="${s({ position: 'relative', width: W + 'px', height: height + 'px', background: T.canvas, color: T.t1, overflow: 'hidden', fontFamily: FONT })}">
<div style="${s({ height: STATUS + 'px' })}"></div>
${body}
${tabbar(T, active)}
</div>`;
}

function card(T, inner, extra = {}) {
  return `<div style="${s({ background: T.surface, borderRadius: '24px', border: `1px solid ${T.hair}`, boxShadow: T.shadow, padding: '16px', ...extra })}">${inner}</div>`;
}

/* ------------------------------------------------------- the quick-add tile */
/* state: 'rest' | 'logged' | 'press' | 'ghost' */
function tile(T, f, state = 'rest', scale = 1) {
  const H = 80 * scale, R = 18 * scale;
  const logged = state === 'logged', press = state === 'press', ghost = state === 'ghost';
  const bg = logged ? T.kcalWash : press ? T.press : ghost ? 'transparent' : T.tile;
  const bd = logged ? T.kcal : ghost ? T.ghost : T.hair;
  const box = {
    position: 'relative', height: H + 'px', borderRadius: R + 'px', background: bg,
    border: `${logged ? 1.5 : 1}px ${ghost ? 'dashed' : 'solid'} ${bd}`,
    boxShadow: ghost || logged ? 'none' : T.tileShadow,
    padding: `${10 * scale}px ${12 * scale}px`, display: 'flex', flexDirection: 'column',
    justifyContent: 'space-between', overflow: 'hidden',
    transform: press ? 'scale(0.972)' : undefined,
  };
  if (ghost) return `<div style="${s(box)}"></div>`;
  const nameStyle = s({ ...TYPE.strong, fontSize: 16.5 * scale + 'px', color: T.t1, display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' });
  const num = (v, u, c) => `<span style="${s({ display: 'flex', alignItems: 'baseline', gap: 4 * scale + 'px' })}"><span style="${s({ ...TYPE.numeric, fontSize: 15 * scale + 'px', color: c })}">${v}</span><span style="${s({ fontSize: 10.5 * scale + 'px', fontWeight: 600, color: T.t3, letterSpacing: '0.02em' })}">${u}</span></span>`;
  const foot = logged
    ? `<span style="${s({ display: 'flex', alignItems: 'center', gap: 6 * scale + 'px', color: T.kcal })}">${ico(I.check, { size: 15 * scale, w: 2.6 })}<span style="${s({ ...TYPE.numeric, fontSize: 13.5 * scale + 'px', color: T.kcal })}">Logged</span></span>`
    : `<span style="${s({ display: 'flex', alignItems: 'baseline', gap: 8 * scale + 'px' })}">${num(f.k, 'kcal', T.kcal)}${num(f.p, 'P', T.prot)}</span>`;
  return `<div style="${s(box)}">
  <div style="${s({ display: 'flex', gap: 6 * scale + 'px', alignItems: 'flex-start' })}">${f.meal ? `<span style="${s({ color: T.t3, marginTop: 1 * scale + 'px', flex: 'none' })}">${ico(I.layers, { size: 14 * scale, w: 1.9 })}</span>` : ''}<span style="${nameStyle}">${f.n}</span></div>
  <div style="${s({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 * scale + 'px' })}">${foot}<span style="${s({ fontSize: 11 * scale + 'px', fontWeight: 500, color: T.t3, whiteSpace: 'nowrap' })}">${f.s}</span></div>
</div>`;
}

/* --------------------------------------------------------------- ring gauge */
function ring(T, { value, target, unit, label, color, dia = 122, sw = 10 }) {
  const r = (dia - sw) / 2, C = 2 * Math.PI * r, p = Math.min(1, value / target);
  const off = C * (1 - p);
  return `<div style="${s({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0' })}">
  <div style="${s({ position: 'relative', width: dia + 'px', height: dia + 'px' })}">
    <svg width="${dia}" height="${dia}" viewBox="0 0 ${dia} ${dia}" style="display:block;transform:rotate(-90deg);filter:${T.glow(color)}">
      <circle cx="${dia / 2}" cy="${dia / 2}" r="${r}" fill="none" stroke="${T.hair}" stroke-width="${sw}"/>
      <circle cx="${dia / 2}" cy="${dia / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
    </svg>
    <div style="${s({ position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' })}">
      <div style="${t('micro', { color: T.t3, fontSize: '9.5px' })}">${label}</div>
      <div style="${t('displayXl', { color: T.t1 })}">${value}</div>
      <div style="${s({ fontSize: '11.5px', fontWeight: 550, color: T.t2 })}">of ${target}${unit}</div>
    </div>
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

function sectionLabel(T, left, right) {
  return `<div style="${s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '16px' })}"><span style="${t('micro', { color: T.t2 })}">${left}</span><span style="${t('micro', { color: T.t3, letterSpacing: '0.1em' })}">${right}</span></div>`;
}

function chip(T, { icon, label, value, sub, accent, spark, cta }) {
  return `<div style="${s({ flex: '1', minWidth: '0', height: '54px', background: T.surface, border: `1px solid ${T.hair}`, borderRadius: '18px', boxShadow: T.tileShadow, padding: '0 12px', display: 'flex', alignItems: 'center', gap: '10px' })}">
  <span style="${s({ color: accent, flex: 'none' })}">${ico(icon, { size: 19, w: 1.8 })}</span>
  <span style="${s({ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '0', flex: '1' })}">
    <span style="${t('micro', { color: T.t3, fontSize: '9px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}">${label}</span>
    <span style="${s({ display: 'flex', alignItems: 'baseline', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden' })}"><span style="${s({ ...TYPE.numeric, fontSize: '16px', color: T.t1 })}">${value}</span>${sub ? `<span style="${s({ fontSize: '11px', fontWeight: 600, color: accent })}">${sub}</span>` : ''}</span>
  </span>
  ${spark ? `<svg width="38" height="18" viewBox="0 0 96 28" preserveAspectRatio="none" style="display:block;flex:none"><path d="${D.spark}" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
  ${cta ? `<span style="${s({ flex: 'none', width: '30px', height: '30px', borderRadius: '999px', background: accent, color: T.name === 'dark' ? T.canvas : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' })}">${ico(cta, { size: 15, w: 2, fill: 'currentColor' })}</span>` : ''}
</div>`;
}

function todayScreen(T, { empty = false } = {}) {
  const PAD = 20;
  const kcalNow = empty ? 0 : 1240, protNow = empty ? 0 : 96;
  const head = `<header style="${s({ height: '48px', padding: `0 ${PAD}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}">
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '4px' })}">
    <div style="${t('displayLg', { color: T.t1 })}">Today</div>
    <div style="${s({ fontSize: '12.5px', fontWeight: 500, color: T.t3 })}">Wed 10 Sep · 4:12 PM</div>
  </div>
  <div style="${s({ width: '44px', height: '44px', borderRadius: '999px', background: T.surface, border: `1px solid ${T.hair}`, color: T.t2, display: 'flex', alignItems: 'center', justifyContent: 'center' })}">${ico(I.search, { size: 21 })}</div>
</header>`;

  const rings = card(T, `<div style="${s({ display: 'flex', gap: '10px' })}">
  <div style="${s({ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' })}">${ring(T, { value: kcalNow.toLocaleString('en-GB'), target: '2,400', unit: '', label: 'Kcal', color: T.kcal, dia: 118 })}<div style="${s({ fontSize: '12.5px', fontWeight: 600, color: T.kcal })}">${empty ? '2,400' : '1,160'} left</div></div>
  <div style="${s({ width: '1px', background: T.hair, margin: '6px 0' })}"></div>
  <div style="${s({ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' })}">${ring(T, { value: protNow, target: '180', unit: ' g', label: 'Protein', color: T.prot, dia: 118 })}<div style="${s({ fontSize: '12.5px', fontWeight: 600, color: T.prot })}">${empty ? '180' : '84'} g left</div></div>
</div>`, { padding: '16px' });

  const grid = empty
    ? `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '10px' })}">
  <div style="${s({ height: '86px', borderRadius: '18px', background: T.kcal, color: T.name === 'dark' ? '#151006' : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: T.name === 'dark' ? '0 8px 26px rgba(250,171,63,0.22)' : '0 8px 22px rgba(162,83,2,0.22)' })}">${ico(I.plus, { size: 24, w: 2.4 })}<span style="${t('title', { fontSize: '20px' })}">Add your first food</span></div>
  <div style="${s({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' })}">
${[0, 1, 2, 3].map(() => '    ' + tile(T, {}, 'ghost')).join('\n')}
  </div>
  <div style="${s({ ...TYPE.label, color: T.t3, textAlign: 'center', textWrap: 'pretty', padding: '0 10px' })}">Your six most-eaten foods land here, ranked by the hour you normally eat them. One tap logs one.</div>
</div>`
    : `<div style="${s({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' })}">
${FOODS.map((f, i) => '  ' + tile(T, f, i === 0 ? 'logged' : 'rest')).join('\n')}
</div>`;

  const chips = `<div style="${s({ display: 'flex', gap: '10px' })}">
${chip(T, empty
    ? { icon: I.scale, label: 'Weight', value: 'Log it', sub: 'day one', accent: T.body }
    : { icon: I.scale, label: 'Weight', value: '83.4', sub: '↓ 0.4 kg', accent: T.body, spark: true })}
${chip(T, empty
    ? { icon: I.workout, label: 'Workout', value: 'Start', sub: 'first', accent: T.str, cta: I.play }
    : { icon: I.workout, label: 'Workout', value: 'Push A', sub: '4d', accent: T.str, cta: I.play })}
</div>`;

  const logRows = empty
    ? `<div style="${s({ marginTop: '8px', border: `1px dashed ${T.ghost}`, borderRadius: '18px', padding: '20px 16px', textAlign: 'center' })}"><div style="${s({ ...TYPE.strong, color: T.t2 })}">Nothing logged yet</div><div style="${s({ ...TYPE.label, color: T.t3, marginTop: '4px' })}">Today starts at zero. That is the point.</div></div>`
    : `<div style="${s({ marginTop: '4px' })}">
${LOG.map(([time, name, k, p], i) => `  <div style="${s({ height: '40px', display: 'flex', alignItems: 'center', gap: '10px', borderTop: i === 0 ? 'none' : `1px solid ${T.hair}` })}">
    <span style="${s({ ...TYPE.numeric, fontSize: '12px', fontWeight: 600, color: T.t3, width: '38px' })}">${time}</span>
    <span style="${s({ ...TYPE.bodyT, color: T.t1, flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}">${name}</span>
    <span style="${s({ ...TYPE.numeric, fontSize: '13.5px', color: T.kcal })}">${k}</span>
    <span style="${s({ ...TYPE.numeric, fontSize: '13.5px', color: T.prot, width: '34px', textAlign: 'right' })}">${p} P</span>
  </div>`).join('\n')}
</div>`;

  const body = `<div style="${s({ position: 'absolute', top: STATUS + 'px', left: 0, right: 0, bottom: (TABH + HOMEH) + 'px', display: 'flex', flexDirection: 'column' })}">
${head}
<div style="${s({ padding: `10px ${PAD}px 0`, display: 'flex', flexDirection: 'column', gap: '12px', flex: '1', minHeight: '0' })}">
${rings}
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '8px' })}">${sectionLabel(T, 'Quick add', empty ? 'Day one' : 'Ranked for 4 PM')}${grid}</div>
${chips}
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1', minHeight: '0', overflow: 'hidden', WebkitMaskImage: empty ? undefined : 'linear-gradient(180deg,#000 78%,transparent)' })}">${sectionLabel(T, "Today's log", empty ? '0 items' : '5 items · 1,240 kcal')}${logRows}</div>
</div>
</div>`;
  return phone(T, { body, active: 'Today' });
}

/* ================================================================= WORKOUT */
function stepperRow(T, { unit, value, hint }) {
  const btn = (icon) => `<span style="${s({ width: '56px', height: '48px', flex: 'none', borderRadius: '14px', background: T.tile, border: `1px solid ${T.hair}`, color: T.t1, display: 'flex', alignItems: 'center', justifyContent: 'center' })}">${ico(icon, { size: 20, w: 2.2 })}</span>`;
  return `<div style="${s({ display: 'flex', gap: '6px', alignItems: 'center' })}">
  ${btn(I.minus)}
  <span style="${s({ flex: '1', height: '48px', borderRadius: '14px', background: T.raised, border: `1px solid ${T.hair}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' })}"><span style="${t('displayLg', { fontSize: '23px', color: T.t1 })}">${value}</span><span style="${s({ fontSize: '11.5px', fontWeight: 650, color: T.t3, letterSpacing: '0.08em', textTransform: 'uppercase' })}">${unit}</span>${hint ? `<span style="${s({ fontSize: '11px', fontWeight: 500, color: T.t3, marginLeft: '4px' })}">${hint}</span>` : ''}</span>
  ${btn(I.plus)}
</div>`;
}

function workoutScreen(T, { empty = false } = {}) {
  const PAD = 16;
  if (empty) {
    const body = `<div style="${s({ position: 'absolute', top: STATUS + 'px', left: 0, right: 0, bottom: (TABH + HOMEH) + 'px', display: 'flex', flexDirection: 'column', padding: `0 ${PAD}px` })}">
  <header style="${s({ height: '48px', display: 'flex', alignItems: 'center', padding: '0 4px' })}"><div style="${t('displayLg', { color: T.t1 })}">Workout</div></header>
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' })}">
    <div style="${s({ height: '86px', borderRadius: '22px', background: T.str, color: T.name === 'dark' ? '#180B1F' : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: T.name === 'dark' ? '0 8px 26px rgba(225,159,255,0.2)' : '0 8px 22px rgba(142,62,174,0.22)' })}">${ico(I.play, { size: 22, w: 2, fill: 'currentColor' })}<span style="${t('title', { fontSize: '20px' })}">Start an empty session</span></div>
    <div style="${s({ height: '60px', borderRadius: '18px', border: `1px solid ${T.line}`, color: T.t1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' })}">${ico(I.plus, { size: 19 })}<span style="${t('strong')}">Build a routine</span></div>
  </div>
  ${card(T, `<div style="${t('micro', { color: T.str })}">After session one</div><div style="${s({ ...TYPE.strong, color: T.t1, marginTop: '8px', textWrap: 'pretty' })}">Every set arrives pre-filled with last session's weight and reps.</div><div style="${s({ ...TYPE.label, color: T.t2, marginTop: '6px', textWrap: 'pretty' })}">Repeating a workout becomes one tap. Beating it becomes two.</div>`, { marginTop: '12px' })}
  <div style="${s({ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' })}">${sectionLabel(T, 'Your routines', 'None yet')}
    ${[0, 1].map(() => `<div style="${s({ height: '62px', borderRadius: '18px', border: `1px dashed ${T.ghost}` })}"></div>`).join('\n    ')}
  </div>
</div>`;
    return phone(T, { body, active: 'Workout' });
  }

  const head = `<header style="${s({ height: '52px', padding: `0 ${PAD}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}">
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '4px' })}">
    <div style="${t('title', { fontSize: '21px', color: T.t1 })}">Push A</div>
    <div style="${s({ display: 'flex', alignItems: 'center', gap: '6px' })}"><span style="${s({ width: '6px', height: '6px', borderRadius: '999px', background: T.str })}"></span><span style="${s({ ...TYPE.numeric, fontSize: '13px', color: T.str })}">32:14</span><span style="${s({ fontSize: '12px', fontWeight: 500, color: T.t3 })}">· exercise 2 of 5</span></div>
  </div>
  <div style="${s({ height: '44px', padding: '0 16px', borderRadius: '999px', border: `1.5px solid ${T.str}`, color: T.str, display: 'flex', alignItems: 'center', gap: '6px' })}">${ico(I.flag, { size: 17, w: 2 })}<span style="${s({ fontSize: '14.5px', fontWeight: 650 })}">Finish</span></div>
</header>`;

  const progress = `<div style="${s({ display: 'flex', gap: '4px', padding: `0 ${PAD}px`, marginTop: '4px' })}">
${[1, 1, 0.45, 0, 0].map((f) => `  <span style="${s({ flex: '1', height: '4px', borderRadius: '999px', background: T.hair, overflow: 'hidden' })}"><span style="${s({ display: 'block', width: f * 100 + '%', height: '100%', background: T.str, borderRadius: '999px' })}"></span></span>`).join('\n')}
</div>`;

  const done = [['1', '80 kg', '8'], ['2', '80 kg', '8']].map(([i, w, r], idx) => `  <div style="${s({ height: '44px', display: 'flex', alignItems: 'center', gap: '12px', borderTop: idx === 0 ? `1px solid ${T.hair}` : `1px solid ${T.hair}` })}">
    <span style="${s({ width: '24px', height: '24px', borderRadius: '8px', background: T.strWash, color: T.str, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPE.numeric, fontSize: '12px' })}">${i}</span>
    <span style="${s({ ...TYPE.numeric, fontSize: '16px', color: T.t1, flex: '1' })}">${w} <span style="${s({ color: T.t3, fontWeight: 500 })}">×</span> ${r}</span>
    <span style="${s({ color: T.str })}">${ico(I.check, { size: 18, w: 2.4 })}</span>
  </div>`).join('\n');

  const active = `<div style="${s({ marginTop: '10px', padding: '12px', borderRadius: '18px', background: T.strWash, border: `1px solid ${T.str}` })}">
  <div style="${s({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' })}">
    <span style="${s({ display: 'flex', alignItems: 'center', gap: '10px' })}"><span style="${s({ height: '22px', padding: '0 10px', borderRadius: '8px', background: T.str, color: T.name === 'dark' ? '#180B1F' : '#FFFFFF', display: 'flex', alignItems: 'center', ...TYPE.micro, fontSize: '10px' })}">Set 3</span><span style="${s({ ...TYPE.label, color: T.t2 })}">pre-filled from last session</span></span>
  </div>
  <div style="${s({ display: 'flex', gap: '10px' })}">
    <div style="${s({ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '6px' })}">
${stepperRow(T, { unit: 'kg', value: '80' })}
${stepperRow(T, { unit: 'reps', value: '8' })}
    </div>
    <div style="${s({ width: '66px', flex: 'none', borderRadius: '14px', background: T.str, color: T.name === 'dark' ? '#180B1F' : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' })}">${ico(I.check, { size: 30, w: 2.6 })}</div>
  </div>
</div>`;

  const exCard = card(T, `<div style="${s({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' })}">
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '0' })}">
    <div style="${t('title', { color: T.t1 })}">Bench Press</div>
    <div style="${s({ ...TYPE.label, color: T.t3 })}">Last: 80 kg × 8, 8, 7 · 4 days ago</div>
  </div>
  <span style="${s({ color: T.t3, flex: 'none', marginTop: '4px' })}">${ico(I.dots, { size: 20 })}</span>
</div>
<div style="${s({ marginTop: '10px' })}">${done}</div>
${active}
<div style="${s({ height: '44px', marginTop: '8px', borderRadius: '14px', border: `1px dashed ${T.line}`, color: T.t2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' })}">${ico(I.plus, { size: 17 })}<span style="${s({ ...TYPE.label, fontSize: '13.5px', fontWeight: 600 })}">Add set</span></div>`);

  const upNext = `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1', minHeight: '0', overflow: 'hidden', WebkitMaskImage: 'linear-gradient(180deg,#000 86%,transparent)' })}">${sectionLabel(T, 'Up next', '3 exercises')}
${[['3', 'Incline DB Press', '3 × 10'], ['4', 'Cable Fly', '3 × 12'], ['5', 'Overhead Press', '4 × 6']].map(([i, n, x]) => `  <div style="${s({ height: '46px', display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', borderRadius: '14px', background: T.surface, border: `1px solid ${T.hair}` })}">
    <span style="${s({ ...TYPE.numeric, fontSize: '12px', color: T.t3, width: '10px' })}">${i}</span>
    <span style="${s({ ...TYPE.bodyT, color: T.t1, flex: '1' })}">${n}</span>
    <span style="${s({ ...TYPE.numeric, fontSize: '13px', color: T.t2 })}">${x}</span>
    <span style="${s({ color: T.t3 })}">${ico(I.chev, { size: 16 })}</span>
  </div>`).join('\n')}
</div>`;

  const rest = `<div style="${s({ position: 'absolute', left: PAD + 'px', right: PAD + 'px', bottom: (TABH + HOMEH + 12) + 'px', height: '66px', borderRadius: '22px', background: T.name === 'dark' ? 'rgba(33,37,43,0.94)' : 'rgba(255,255,255,0.96)', backdropFilter: 'blur(16px)', border: `1px solid ${T.str}`, boxShadow: T.shadow, padding: '0 12px', display: 'flex', alignItems: 'center', gap: '12px' })}">
  <span style="${s({ position: 'relative', width: '40px', height: '40px', flex: 'none' })}">
    <svg width="40" height="40" viewBox="0 0 40 40" style="display:block;transform:rotate(-90deg)"><circle cx="20" cy="20" r="17" fill="none" stroke="${T.hair}" stroke-width="4"/><circle cx="20" cy="20" r="17" fill="none" stroke="${T.str}" stroke-width="4" stroke-linecap="round" stroke-dasharray="106.8" stroke-dashoffset="66.2"/></svg>
  </span>
  <span style="${s({ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1' })}"><span style="${t('micro', { color: T.t3, fontSize: '9px' })}">Rest</span><span style="${s({ ...TYPE.numeric, fontSize: '20px', color: T.t1 })}">1:12</span></span>
  <span style="${s({ height: '40px', padding: '0 12px', borderRadius: '10px', background: T.tile, border: `1px solid ${T.hair}`, color: T.t1, display: 'flex', alignItems: 'center', ...TYPE.numeric, fontSize: '13.5px' })}">+30s</span>
  <span style="${s({ height: '40px', padding: '0 12px', borderRadius: '10px', background: T.tile, border: `1px solid ${T.hair}`, color: T.t2, display: 'flex', alignItems: 'center', gap: '6px' })}">${ico(I.skip, { size: 15, w: 2 })}<span style="${s({ fontSize: '13.5px', fontWeight: 650 })}">Skip</span></span>
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
  const n = (x) => x.toLocaleString('en-GB').replace('-', '\u2212');
  const f2 = (x) => x.toFixed(2).replace('-', '\u2212');
  const f1 = (x) => x.toFixed(1).replace('-', '\u2212');
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
  ticks.map(([, y]) => `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${T.hair}" stroke-width="1"/>`).join('');
const ticklabelsRight = (T, ticks, color, w = PW) => ticks.map(([v, y]) =>
  `<rect x="${w - String(v).length * 6 - 6}" y="${y - 14}" width="${String(v).length * 6 + 8}" height="12.5" rx="2" fill="${T.surface}"/>` +
  svgTxt(w - 1, y - 4.5, v, { fill: color, size: 9.5, anchor: 'end' })).join('');
const ticklabels = (T, ticks, color) => ticks.map(([v, y]) =>
  `<rect x="-2" y="${y - 14}" width="${String(v).length * 6 + 8}" height="12.5" rx="2" fill="${T.surface}"/>` +
  svgTxt(1, y - 4.5, v, { fill: color, size: 9.5 })).join('');

function chartCard(T, { eyeL, eyeR, headline, sub, big, bigUnit, delta, deltaColor, svg, foot, accent }) {
  return card(T, `<div style="${s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}"><span style="${t('micro', { color: accent })}">${eyeL}</span><span style="${t('micro', { color: T.t3, letterSpacing: '0.1em' })}">${eyeR}</span></div>
${headline ? `<div style="${s({ ...TYPE.strong, fontSize: '17px', color: T.t1, marginTop: '10px', textWrap: 'pretty' })}">${headline}</div>` : ''}
${big ? `<div style="${s({ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: '10px' })}">
  <span style="${s({ display: 'flex', alignItems: 'baseline', gap: '6px' })}"><span style="${t('displayLg', { fontSize: '30px', color: T.t1 })}">${big}</span><span style="${s({ fontSize: '13px', fontWeight: 600, color: T.t2 })}">${bigUnit}</span></span>
  ${delta ? `<span style="${s({ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' })}"><span style="${s({ ...TYPE.numeric, fontSize: '15px', color: deltaColor })}">${delta[0]}</span><span style="${s({ fontSize: '11px', fontWeight: 500, color: T.t3 })}">${delta[1]}</span></span>` : ''}
</div>` : ''}
${sub ? `<div style="${s({ ...TYPE.label, color: T.t3, marginTop: '6px' })}">${sub}</div>` : ''}
<div style="${s({ marginTop: '16px' })}">${svg}</div>
${foot || ''}`, { padding: '16px' });
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
  <line x1="${o.splitX}" y1="0" x2="${o.splitX}" y2="${o.h}" stroke="${T.t3}" stroke-width="1" stroke-dasharray="3 3"/>
  <path d="${o.wLine}" fill="none" stroke="${T.canvas}" stroke-width="5.4" stroke-linejoin="round" stroke-linecap="round" opacity="0.55"/>
  <path d="${o.wLine}" fill="none" stroke="${T.body}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  ${ticklabels(T, o.wTicks, T.body)}
  ${ticklabelsRight(T, o.kTicks.map(([v, y]) => [v.toLocaleString('en-GB'), y]), T.kcal)}
  ${svgTxt(o.splitX + 5, 11, 'CUT STARTS', { fill: T.t3, size: 8.5, ls: '0.12em' })}
  ${svgTxt(2, o.h + 13, 'kg', { fill: T.body, size: 8.5, ls: '0.1em' })}
  ${svgTxt(PW, o.h + 13, 'kcal', { fill: T.kcal, size: 8.5, ls: '0.1em', anchor: 'end' })}
  ${svgTxt(38, o.h + 13, 'Jun', { fill: T.t3, size: 9, weight: 550 })}
  ${svgTxt(o.splitX, o.h + 13, 'Jul', { fill: T.t3, size: 9, weight: 550, anchor: 'middle' })}
  ${svgTxt(PW - 30, o.h + 13, 'Sep', { fill: T.t3, size: 9, weight: 550, anchor: 'end' })}
</svg>`;
}

function weightChart(T) {
  const w = D.weight;
  return `<svg width="${PW}" height="${w.h + 16}" viewBox="0 0 ${PW} ${w.h + 16}" style="display:block;overflow:visible">
  ${gridlines(T, w.ticks)}
  ${w.dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7" fill="${T.bodyDim}"/>`).join('')}
  <path d="${w.trend}" fill="none" stroke="${T.surface}" stroke-width="5.6" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${w.trend}" fill="none" stroke="${T.body}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${w.dots[89][0]}" cy="${w.dots[89][1]}" r="4" fill="none" stroke="${T.t2}" stroke-width="1.6"/>
  <circle cx="${w.lastPt[0]}" cy="${w.lastPt[1]}" r="4.2" fill="${T.body}" stroke="${T.surface}" stroke-width="1.6"/>
  ${ticklabels(T, w.ticks, T.body)}
  ${svgTxt(2, w.h + 13, '90 days ago', { fill: T.t3, size: 9, weight: 550 })}
  ${svgTxt(PW, w.h + 13, 'today', { fill: T.t3, size: 9, weight: 550, anchor: 'end' })}
</svg>`;
}

function seriesChart(T, key, color, dim, targetLabel) {
  const b = D[key];
  return `<svg width="${PW}" height="${b.h + 16}" viewBox="0 0 ${PW} ${b.h + 16}" style="display:block;overflow:visible">
  ${gridlines(T, b.ticks)}
  <line x1="0" y1="${b.targetY}" x2="${PW}" y2="${b.targetY}" stroke="${T.t2}" stroke-width="1.2" stroke-dasharray="4 4"/>
  ${b.dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.9" fill="${dim}"/>`).join('')}
  <path d="${b.avg}" fill="none" stroke="${T.surface}" stroke-width="5.6" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${b.avg}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${b.avgLastPt[0]}" cy="${b.avgLastPt[1]}" r="4.2" fill="${color}" stroke="${T.surface}" stroke-width="1.8"/>
  ${ticklabels(T, b.ticks, T.t3)}
  <rect x="${PW - targetLabel.length * 5.4 - 8}" y="${b.targetY - 15}" width="${targetLabel.length * 5.4 + 9}" height="12.5" rx="2" fill="${T.surface}"/>
  ${svgTxt(PW, b.targetY - 5.5, targetLabel, { fill: T.t2, size: 9, anchor: 'end' })}
  ${svgTxt(2, b.h + 13, '30 days', { fill: T.t3, size: 9, weight: 550 })}
  ${svgTxt(PW, b.h + 13, 'today', { fill: T.t3, size: 9, weight: 550, anchor: 'end' })}
</svg>`;
}

function strengthChart(T) {
  const g = D.strength;
  return `<svg width="${PW}" height="${g.h + 16}" viewBox="0 0 ${PW} ${g.h + 16}" style="display:block;overflow:visible">
  ${gridlines(T, g.ticks)}
  ${ticklabels(T, g.ticks, T.str)}
  <path d="${g.line}" fill="none" stroke="${T.str}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
  ${g.dots.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === g.dots.length - 1 ? 4.2 : 2.2}" fill="${T.str}"/>`).join('')}
  ${svgTxt(2, g.h + 13, 'Mar', { fill: T.t3, size: 9, weight: 550 })}
  ${svgTxt(PW, g.h + 13, 'Sep', { fill: T.t3, size: 9, weight: 550, anchor: 'end' })}
</svg>`;
}

const legendDot = (c, txt, T, dash) => `<span style="${s({ display: 'flex', alignItems: 'center', gap: '6px' })}"><span style="${s({ width: '14px', height: '3px', borderRadius: '999px', background: dash ? 'none' : c, borderTop: dash ? `2px dashed ${c}` : 'none', flex: 'none' })}"></span><span style="${s({ fontSize: '11px', fontWeight: 600, color: T.t2 })}">${txt}</span></span>`;

function chartsScreen(T, { empty = false } = {}) {
  const PAD = 16;
  const head = `<header style="${s({ height: '48px', padding: `0 ${PAD + 4}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}">
  <div style="${t('displayLg', { color: T.t1 })}">Charts</div>
  <div style="${s({ ...TYPE.label, color: T.t3 })}">${empty ? 'day 1' : '13 Jun – 10 Sep'}</div>
</header>`;
  const ranges = ['1M', '3M', '6M', '1Y', 'All'];
  const switcher = `<div style="${s({ margin: `6px ${PAD}px 0`, padding: '4px', height: '44px', borderRadius: '14px', background: T.surface, border: `1px solid ${T.hair}`, display: 'flex', gap: '4px' })}">
${ranges.map((r) => `  <span style="${s({ flex: '1', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: r === '3M' ? T.raised : 'transparent', border: r === '3M' ? `1px solid ${T.hair}` : '1px solid transparent', color: r === '3M' ? T.t1 : T.t3, fontSize: '13.5px', fontWeight: r === '3M' ? 700 : 550 })}">${r}</span>`).join('\n')}
</div>`;

  if (empty) {
    const ghostChart = `<svg width="${PW}" height="120" viewBox="0 0 ${PW} 120" style="display:block"><line x1="0" y1="30" x2="${PW}" y2="30" stroke="${T.hair}"/><line x1="0" y1="70" x2="${PW}" y2="70" stroke="${T.hair}"/><line x1="0" y1="110" x2="${PW}" y2="110" stroke="${T.hair}"/><path d="M0 26 C70 34 120 48 175 60 C230 72 280 84 326 96" fill="none" stroke="${T.ghost}" stroke-width="2.6" stroke-dasharray="5 6" stroke-linecap="round"/></svg>`;
    const body = `<div style="${s({ position: 'absolute', top: STATUS + 'px', left: 0, right: 0, bottom: (TABH + HOMEH) + 'px', display: 'flex', flexDirection: 'column' })}">
${head}
${switcher}
<div style="${s({ padding: `12px ${PAD}px 0`, display: 'flex', flexDirection: 'column', gap: '12px' })}">
${card(T, `<div style="${t('micro', { color: T.body })}">Weight trend</div>
<div style="${s({ ...TYPE.strong, fontSize: '17px', color: T.t1, marginTop: '10px', textWrap: 'pretty' })}">Three weigh-ins and this line appears.</div>
<div style="${s({ ...TYPE.label, color: T.t3, marginTop: '6px', textWrap: 'pretty' })}">A single weigh-in is noise. The trend is the number worth watching, and it needs a few days to exist.</div>
<div style="${s({ marginTop: '16px' })}">${ghostChart}</div>
<div style="${s({ marginTop: '16px', height: '48px', borderRadius: '14px', background: T.body, color: T.name === 'dark' ? '#071120' : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' })}">${ico(I.scale, { size: 19, w: 2 })}<span style="${t('strong', { fontSize: '15.5px' })}">Log today's weight</span></div>
<div style="${s({ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px' })}"><span style="${s({ flex: '1', height: '5px', borderRadius: '999px', background: T.hair, overflow: 'hidden' })}"><span style="${s({ display: 'block', width: '33%', height: '100%', background: T.body })}"></span></span><span style="${s({ ...TYPE.numeric, fontSize: '11.5px', color: T.t2 })}">1 of 3 days</span></div>`)}
${card(T, `<div style="${t('micro', { color: T.kcal })}">Calories &amp; protein</div><div style="${s({ ...TYPE.strong, color: T.t1, marginTop: '10px', textWrap: 'pretty' })}">Log a full day and the rolling average starts.</div><div style="${s({ marginTop: '12px', height: '78px', borderRadius: '14px', border: `1px dashed ${T.ghost}` })}"></div>`)}
${card(T, `<div style="${t('micro', { color: T.str })}">Strength</div><div style="${s({ ...TYPE.strong, color: T.t1, marginTop: '10px', textWrap: 'pretty' })}">Two sessions of an exercise draws its first line.</div><div style="${s({ marginTop: '12px', height: '78px', borderRadius: '14px', border: `1px dashed ${T.ghost}` })}"></div>`)}
</div>
</div>`;
    return phone(T, { body, active: 'Charts' });
  }

  const statCell = (T2, label, kcalV, rate, col) => `<div style="${s({ flex: '1', padding: '10px 12px', borderRadius: '14px', background: T2.raised, display: 'flex', flexDirection: 'column', gap: '4px' })}">
  <span style="${t('micro', { color: T2.t3, fontSize: '9px' })}">${label}</span>
  <span style="${s({ ...TYPE.numeric, fontSize: '15px', color: T2.kcal })}">${kcalV}<span style="${s({ fontSize: '10px', fontWeight: 600, color: T2.t3 })}"> kcal/day</span></span>
  <span style="${s({ ...TYPE.numeric, fontSize: '13px', color: col })}">${rate}<span style="${s({ fontSize: '10px', fontWeight: 600, color: T2.t3 })}"> /week</span></span>
</div>`;

  const c1 = chartCard(T, {
    accent: T.t1, eyeL: 'Is it working?', eyeR: '90 days',
    headline: `Yes. At <span style="color:${T.kcal}">${F.bK} kcal</span> you are losing <span style="color:${T.body}">${F.bRAbs} kg</span> a week.`,
    svg: overlayChart(T),
    foot: `<div style="${s({ display: 'flex', gap: '16px', marginTop: '12px' })}">${legendDot(T.body, 'Weight trend', T)}${legendDot(T.kcal, 'Calories, 7-day avg', T)}</div>
<div style="${s({ display: 'flex', gap: '8px', marginTop: '12px' })}">${statCell(T, 'Before 15 Jul', F.aK, `${F.aR} kg`, T.t2)}${statCell(T, 'Since 15 Jul', `${F.bK}`, `${F.bR} kg`, T.ok)}</div>`,
  });

  const c2 = chartCard(T, {
    accent: T.body, eyeL: 'Weight', eyeR: 'trend + daily',
    big: F.wTrend, bigUnit: 'kg trend', delta: [`${F.wDelta} kg`, 'in 90 days'], deltaColor: T.ok,
    svg: weightChart(T),
    foot: `<div style="${s({ display: 'flex', gap: '16px', marginTop: '12px' })}">${legendDot(T.body, 'Trend', T)}<span style="${s({ display: 'flex', alignItems: 'center', gap: '6px' })}"><span style="${s({ width: '5px', height: '5px', borderRadius: '999px', background: T.bodyDim, flex: 'none' })}"></span><span style="${s({ fontSize: '11px', fontWeight: 600, color: T.t2 })}">What the scale said</span></span></div>
<div style="${s({ marginTop: '12px', padding: '12px', borderRadius: '14px', background: T.raised, ...TYPE.label, color: T.t2, textWrap: 'pretty' })}">This morning the scale said <span style="${s({ ...TYPE.numeric, fontSize: '12.5px', color: T.t1 })}">${F.wRaw}</span> — ${F.wGap} kg under trend. That is water, not fat. Watch the line.</div>`,
  });

  const c3 = chartCard(T, {
    accent: T.kcal, eyeL: 'Calories', eyeR: '30 days',
    big: F.kAvg, bigUnit: 'kcal 7-day avg', delta: [F.kDelta, 'vs target'], deltaColor: T.t2,
    svg: seriesChart(T, 'kcalDaily', T.kcal, T.kcalDim, 'target 2,400'),
    foot: `<div style="${s({ display: 'flex', gap: '16px', marginTop: '12px' })}">${legendDot(T.kcal, '7-day average', T)}<span style="${s({ display: 'flex', alignItems: 'center', gap: '6px' })}"><span style="${s({ width: '5px', height: '5px', borderRadius: '999px', background: T.kcalDim, flex: 'none' })}"></span><span style="${s({ fontSize: '11px', fontWeight: 600, color: T.t2 })}">Each day</span></span>${legendDot(T.t2, 'Target', T, true)}</div>`,
  });

  const c4 = chartCard(T, {
    accent: T.prot, eyeL: 'Protein', eyeR: '30 days',
    big: String(F.pAvg), bigUnit: 'g 7-day avg', delta: [`${F.pDelta} g`, 'vs target'], deltaColor: T.t2,
    svg: seriesChart(T, 'protDaily', T.prot, T.protDim, 'target 180 g'),
    foot: `<div style="${s({ display: 'flex', gap: '16px', marginTop: '12px' })}">${legendDot(T.prot, '7-day average', T)}<span style="${s({ display: 'flex', alignItems: 'center', gap: '6px' })}"><span style="${s({ width: '5px', height: '5px', borderRadius: '999px', background: T.protDim, flex: 'none' })}"></span><span style="${s({ fontSize: '11px', fontWeight: 600, color: T.t2 })}">Each day</span></span>${legendDot(T.t2, 'Target', T, true)}</div>`,
  });

  const exChips = ['Bench Press', 'Squat', 'Deadlift', 'Row'].map((n, i) => `<span style="${s({ height: '34px', padding: '0 12px', borderRadius: '999px', display: 'flex', alignItems: 'center', background: i === 0 ? T.str : T.raised, color: i === 0 ? (T.name === 'dark' ? '#180B1F' : '#FFFFFF') : T.t2, fontSize: '13px', fontWeight: 650, whiteSpace: 'nowrap' })}">${n}</span>`).join('');
  const c5 = chartCard(T, {
    accent: T.str, eyeL: 'Strength', eyeR: 'estimated 1RM',
    big: String(F.sLast), bigUnit: 'kg e1RM', delta: [`+${F.sDelta} kg`, 'in 6 months'], deltaColor: T.ok,
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
function settingsScreen(T, { empty = false } = {}) {
  const PAD = 16;
  const group = (title, rows, note) => `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '8px' })}">
  <div style="${t('micro', { color: T.t2, padding: '0 4px' })}">${title}</div>
  <div style="${s({ background: T.surface, border: `1px solid ${T.hair}`, borderRadius: '18px', overflow: 'hidden', boxShadow: T.tileShadow })}">${rows.join('')}</div>
  ${note ? `<div style="${s({ ...TYPE.label, color: T.t3, padding: '0 6px', textWrap: 'pretty' })}">${note}</div>` : ''}
</div>`;
  const row = (label, right, i, accent) => `<div style="${s({ height: '52px', display: 'flex', alignItems: 'center', gap: '12px', padding: `0 16px`, borderTop: i ? `1px solid ${T.hair}` : 'none' })}">
    <span style="${s({ ...TYPE.bodyT, color: T.t1, flex: '1' })}">${label}</span>
    <span style="${s({ ...TYPE.numeric, fontSize: '14.5px', color: accent || T.t2 })}">${right}</span>
    <span style="${s({ color: T.t3 })}">${ico(I.chev, { size: 15 })}</span>
  </div>`;
  const seg = (label, opts, sel, i) => `<div style="${s({ height: '56px', display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', borderTop: i ? `1px solid ${T.hair}` : 'none' })}">
    <span style="${s({ ...TYPE.bodyT, color: T.t1, flex: '1' })}">${label}</span>
    <span style="${s({ display: 'flex', gap: '4px', padding: '4px', borderRadius: '14px', background: T.raised })}">${opts.map((o) => `<span style="${s({ minWidth: '46px', height: '34px', padding: '0 12px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: o === sel ? T.tile : 'transparent', border: o === sel ? `1px solid ${T.line}` : '1px solid transparent', color: o === sel ? T.t1 : T.t3, fontSize: '13.5px', fontWeight: o === sel ? 700 : 550 })}">${o}</span>`).join('')}</span>
  </div>`;

  const account = `<div style="${s({ margin: `4px ${PAD}px 0`, padding: '16px', background: T.surface, border: `1px solid ${empty ? T.kcal : T.hair}`, borderRadius: '22px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: T.tileShadow })}">
  <span style="${s({ width: '46px', height: '46px', flex: 'none', borderRadius: '999px', background: empty ? T.kcalWash : T.bodyWash, color: empty ? T.kcal : T.body, display: 'flex', alignItems: 'center', justifyContent: 'center' })}">${ico(empty ? I.cloud : I.user, { size: 23 })}</span>
  <span style="${s({ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1', minWidth: '0' })}">
    <span style="${t('strong', { color: T.t1 })}">${empty ? 'Sync is off' : 'Michael'}</span>
    <span style="${s({ display: 'flex', alignItems: 'center', gap: '6px' })}">${empty ? '' : `<span style="${s({ width: '6px', height: '6px', borderRadius: '999px', background: T.ok, flex: 'none' })}"></span>`}<span style="${s({ ...TYPE.label, color: T.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}">${empty ? 'This phone only — no backup' : 'All caught up · 2 min ago'}</span></span>
  </span>
  <span style="${s({ flex: 'none', height: '40px', padding: '0 16px', borderRadius: '999px', background: empty ? T.kcal : T.raised, color: empty ? (T.name === 'dark' ? '#151006' : '#FFFFFF') : T.t1, display: 'flex', alignItems: 'center', fontSize: '13.5px', fontWeight: 650 })}">${empty ? 'Turn on' : 'Sync now'}</span>
</div>`;

  const body = `<div style="${s({ position: 'absolute', top: STATUS + 'px', left: 0, right: 0, display: 'flex', flexDirection: 'column' })}">
<header style="${s({ height: '48px', padding: `0 ${PAD + 4}px`, display: 'flex', alignItems: 'center' })}"><div style="${t('displayLg', { color: T.t1 })}">Settings</div></header>
${account}
<div style="${s({ padding: `16px ${PAD}px ${TABH + HOMEH + 16}px`, display: 'flex', flexDirection: 'column', gap: '20px' })}">
${group('Targets', [
    row('Daily calories', empty ? 'Set' : '2,400 kcal', 0, empty ? T.kcal : T.kcal),
    row('Daily protein', empty ? 'Set' : '180 g', 1, T.prot),
  ], 'Carbs and fat are deliberately not tracked. Two numbers you will actually hit beat four you will not.')}
${group('Units', [
    seg('Weight', ['kg', 'lb'], 'kg', 0),
    seg('Length', ['cm', 'in'], 'cm', 1),
    seg('Week starts', ['Mon', 'Sun'], 'Mon', 2),
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
  ], 'Reduced motion also follows the phone\u2019s own setting. This switch is here so you can turn it on for Vitals alone.')}
${group('Data', [
    row('Export everything', 'CSV', 0),
    row('Import', '', 1),
  ], empty ? '' : 'Devices: iPhone 15 Pro · Pixel 8')}
${group('About', [row('Version', '1.0.0 (24)', 0), row('Licence', 'GPL-3.0', 1)])}
</div>
</div>`;
  return phone(T, { body, active: 'Settings', height: empty ? 844 : 1560 });
}

/* ============================================================ doc artboards */
const BOARD = '#101218';           // board ground for the spec sheets (dark)
const BOARD_T1 = '#F5F7FA', BOARD_T2 = '#B4B7BE', BOARD_T3 = '#9598A0', BOARD_HAIR = '#2A2E36', BOARD_SURF = '#181B21';

function boardHead(title, sub) {
  return `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '9px', marginBottom: '28px' })}">
  <div style="${t('displayLg', { fontSize: '30px', color: BOARD_T1 })}">${title}</div>
  <div style="${s({ ...TYPE.bodyT, fontSize: '15.5px', color: BOARD_T2, maxWidth: '760px', textWrap: 'pretty' })}">${sub}</div>
</div>`;
}
function screenFrame(inner, caption, sub) {
  return `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '12px' })}">
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '2px' })}">
    <div style="${t('micro', { color: BOARD_T1, fontSize: '11px' })}">${caption}</div>
    <div style="${s({ ...TYPE.label, color: BOARD_T3 })}">${sub}</div>
  </div>
  <div style="${s({ borderRadius: '34px', overflow: 'hidden', border: `1px solid ${BOARD_HAIR}`, boxShadow: '0 20px 50px rgba(0,0,0,0.45)', width: W + 'px' })}">${inner}</div>
</div>`;
}

/* ---------------------------------------------------- the quick-add tile spec */
function quickAddBoard() {
  const T = DARK;
  const state = (label, note, node) => `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '10px', width: '169px' })}">
  <div style="${s({ height: '80px' })}">${node}</div>
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '3px' })}"><span style="${t('micro', { color: BOARD_T1, fontSize: '10px' })}">${label}</span><span style="${s({ fontSize: '11.5px', fontWeight: 500, color: BOARD_T3, lineHeight: '1.35', textWrap: 'pretty' })}">${note}</span></div>
</div>`;

  const callout = (txt) => `<div style="${s({ display: 'flex', gap: '9px', alignItems: 'flex-start' })}"><span style="${s({ width: '5px', height: '5px', borderRadius: '999px', background: T.kcal, marginTop: '7px', flex: 'none' })}"></span><span style="${s({ ...TYPE.label, fontSize: '13px', color: BOARD_T2, textWrap: 'pretty' })}">${txt}</span></div>`;

  const portions = ['½', '1', '1½', '2', '3'].map((p, i) => `<span style="${s({ width: '56px', height: '48px', borderRadius: '14px', background: i === 1 ? T.kcal : T.tile, color: i === 1 ? '#151006' : T.t1, border: `1px solid ${i === 1 ? T.kcal : T.hair}`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPE.numeric, fontSize: '17px' })}">${p}</span>`).join('');
  const sheet = `<div style="${s({ width: '326px', borderRadius: '22px', background: T.raised, border: `1px solid ${T.hair}`, boxShadow: '0 18px 40px rgba(0,0,0,0.5)', padding: '16px' })}">
  <div style="${s({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' })}"><span style="${t('title', { fontSize: '18px', color: T.t1 })}">Skyr Pot</span><span style="${s({ ...TYPE.label, color: T.t3 })}">1 pot · 120 kcal</span></div>
  <div style="${s({ display: 'flex', gap: '8px', marginTop: '14px' })}">${portions}</div>
  <div style="${s({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '16px' })}"><span style="${s({ ...TYPE.numeric, fontSize: '20px', color: T.kcal })}">120<span style="${s({ fontSize: '11px', color: T.t3 })}"> kcal</span></span><span style="${s({ ...TYPE.numeric, fontSize: '20px', color: T.prot })}">20<span style="${s({ fontSize: '11px', color: T.t3 })}"> g protein</span></span></div>
</div>`;

  const ruler = `<svg width="169" height="18" viewBox="0 0 169 18" style="display:block"><line x1="1" y1="9" x2="168" y2="9" stroke="${BOARD_T3}" stroke-width="1"/><line x1="1" y1="4" x2="1" y2="14" stroke="${BOARD_T3}" stroke-width="1"/><line x1="168" y1="4" x2="168" y2="14" stroke="${BOARD_T3}" stroke-width="1"/><rect x="62" y="0" width="45" height="18" fill="${BOARD}"/><text x="84.5" y="12.5" fill="${BOARD_T2}" font-family="${FONT}" font-size="10" font-weight="650" text-anchor="middle">169 pt</text></svg>`;

  return `<div style="${s({ width: '860px', minHeight: '700px', background: BOARD, padding: '36px 40px', fontFamily: FONT, color: BOARD_T1 })}">
${boardHead('The quick-add tile', 'Shown at real size. One tap logs the food — no dialog, no save button, no navigation, just a haptic tick and the ring moving. This one object is the reason the app gets opened.')}
<div style="${s({ display: 'flex', gap: '26px', flexWrap: 'wrap' })}">
${state('Rest', 'The default. 169 × 80 pt — nearly four times the 44 pt minimum.', tile(T, FOODS[2], 'rest'))}
${state('Finger down', 'Scales to 0.972 over 90 ms. The only thing that moves.', tile(T, FOODS[2], 'press'))}
${state('Logged', 'Amber wash + tick for 900 ms, then back to rest. Haptic fires here.', tile(T, FOODS[0], 'logged'))}
${state('Not yet learned', 'Day one. Dashed, empty, and it explains itself in the caption below the grid.', tile(T, {}, 'ghost'))}
</div>
<div style="${s({ marginTop: '14px', width: '169px' })}">${ruler}</div>
<div style="${s({ display: 'flex', gap: '40px', marginTop: '38px', alignItems: 'flex-start', flexWrap: 'wrap' })}">
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '16px', width: '356px' })}">
    <div style="${t('micro', { color: BOARD_T1, fontSize: '11px' })}">Anatomy · 2× </div>
    <div style="${s({ width: '338px' })}">${tile(T, FOODS[2], 'rest', 2)}</div>
    <div style="${s({ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '4px' })}">
${['Name — 16.5 pt / 650 weight / 2 lines max. Sized to be read at 70 cm on a gym floor, not at 30 cm on a sofa.',
      'Calories in amber, protein in teal, both 15 pt / 700 tabular. Colour carries the meaning, so the units can stay small.',
      'Serving label bottom-right, 11 pt. It answers \u201cone tap logs how much?\u201d before the tap, not after.',
      '<span style="color:#F5F7FA">radius.lg</span>, padding <span style="color:#F5F7FA">space.4</span> / <span style="color:#F5F7FA">space.5</span>, surface <span style="color:#F5F7FA">bg.tile</span> — one step lighter than the card behind it.',
    ].map(callout).join('\n')}
    </div>
  </div>
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: '16px', width: '356px' })}">
    <div style="${t('micro', { color: BOARD_T1, fontSize: '11px' })}">Long-press · 220 ms · adjust the portion</div>
    ${sheet}
    <div style="${s({ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '4px' })}">
${['Tap is the whole interaction. Long-press is the escape hatch, and it costs nothing to the people who never find it.',
      'Portion chips are 56 × 48. Picking one logs immediately and dismisses — still no save button.',
      'Haptic: <span style="color:#F5F7FA">impactMedium</span> on iOS, <span style="color:#F5F7FA">EFFECT_HEAVY_CLICK</span> on Android. Under \u201creduce motion\u201d the haptic stays; only the scale animation goes.',
      'Undo lives in a 4-second toast above the tab bar. Nothing else can undo a mis-tap that fast.',
    ].map(callout).join('\n')}
    </div>
  </div>
</div>
</div>`;
}

/* -------------------------------------------------------------- empty states */
function emptyBoard() {
  const panels = [
    [todayScreen(DARK, { empty: true }), 'Today · day one', 'The grid teaches its own rule before it has any data to show.'],
    [workoutScreen(DARK, { empty: true }), 'Workout · day one', 'No routine required. Start empty; the routine builds itself.'],
    [chartsScreen(DARK, { empty: true }), 'Charts · day one', 'Says exactly what unlocks each graph, and how far away it is.'],
    [settingsScreen(DARK, { empty: true }), 'Settings · day one', 'Sync off, library at zero, and the two targets asking to be set.'],
  ];
  return `<div style="${s({ width: '1742px', background: BOARD, padding: '40px', fontFamily: FONT, color: BOARD_T1 })}">
${boardHead('Empty states', 'Day one is the only day every user sees. Nothing here is a shrug — each empty screen says what will fill it, and what the first tap should be.')}
<div style="${s({ display: 'flex', gap: '34px' })}">
${panels.map(([p, c, sub]) => screenFrame(p, c, sub)).join('\n')}
</div>
</div>`;
}

/* ------------------------------------------------------------------ specimen */
function lum(h) {
  const n = h.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)]; return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100; };

const TOKENS = [
  ['Surfaces &amp; lines', [
    ['bg.canvas', 'canvas', 'The ground behind every screen. Never pure black — pure black kills the ring glow and bands on OLED.'],
    ['bg.surface', 'surface', 'Cards, the tab bar, the rings panel.'],
    ['bg.raised', 'raised', 'Insets inside a card: stat cells, stepper value, segmented track.'],
    ['bg.tile', 'tile', 'The quick-add tile. One step above the card so it reads as a button, not a row.'],
    ['bg.press', 'press', 'Pressed state for any tile or row. Lightened (dark) / darkened (light) just far enough to read as pressed while every label on top of it still clears 4.5:1.'],
    ['line.hairline', 'hair', 'Every 1 px divider and card border.'],
    ['line.strong', 'line', 'Dashed “add” affordances and unselected segment outlines.'],
  ]],
  ['Text', [
    ['text.primary', 't1', 'Numbers, food names, screen titles. Everything you actually read.', 'canvas'],
    ['text.secondary', 't2', 'Supporting text you are meant to read, just not first.', 'canvas'],
    ['text.tertiary', 't3', 'Units, timestamps, section eyebrows. The lowest rung — still ≥ 4.5:1 on every surface it lands on.', 'tile'],
  ]],
  ['Data &amp; semantic', [
    ['data.kcal', 'kcal', 'Calories, everywhere. The ring, the tile, the average line, the overlay area. Also the primary CTA on Today.', 'tile'],
    ['data.kcalMuted', 'kcalDim', 'The individual days scattered behind the calorie average. Texture, not information — the average line and the headline number carry the meaning.'],
    ['data.protein', 'prot', 'Protein, everywhere. Never used for anything that is not protein.', 'tile'],
    ['data.proteinMuted', 'protDim', 'The individual days behind the protein average. Same job, same rule.'],
    ['data.body', 'body', 'Body weight and its trend line. Owns the Charts tab.', 'tile'],
    ['data.bodyMuted', 'bodyDim', 'Raw daily scale readings — deliberately quieter than the trend that runs through them.'],
    ['data.strength', 'str', 'Sets, reps, e1RM. Owns the Workout tab and the rest timer.', 'tile'],
    ['data.strengthMuted', 'strDim', 'Set-number badges and strength gridline labels.'],
    ['state.success', 'ok', 'A target met, a trend going the right way, sync healthy.', 'surface'],
    ['state.danger', 'danger', 'Delete, discard a session, sync failure. Nothing else.', 'surface'],
  ]],
  ['Washes &amp; depth', [
    ['wash.kcal', 'kcalWash', 'The 900 ms confirmation fill across a tile that has just been logged.'],
    ['wash.protein', 'protWash', 'Protein-owned highlights — the protein half of a split row.'],
    ['wash.body', 'bodyWash', 'Weight-owned highlights.'],
    ['wash.strength', 'strWash', 'The active set block and the set-index badge on Workout.'],
    ['line.ghost', 'ghost', 'Dashed outlines for things that do not exist yet: an unlearned tile, an empty chart, a routine with no exercises. Shown here over bg.tile, as all five of these are.'],
  ]],
];
// Depth and glow are named too, but they are shadows rather than swatches:
//   elev.card       — the card lift (bg.surface over bg.canvas)
//   elev.tile       — the 1 px inner highlight that makes a tile read as pressable
//   elev.sheet      — the portion sheet over a dimmed screen
//   glow.ring       — the coloured bloom under a progress arc; light theme sets it to none

function tokenTable(T, title) {
  const swatchRow = ([name, key, use, against]) => {
    const c = T[key];
    const bg = against ? T[against] : null;
    const ratio = bg ? cr(c, bg) : null;
    const swatch = c.startsWith('rgba') ? `linear-gradient(0deg, ${c}, ${c}) ${T.tile}` : c;
    return `<div style="${s({ display: 'flex', gap: '13px', alignItems: 'flex-start', padding: '9px 0', borderTop: `1px solid ${BOARD_HAIR}` })}">
  <span style="${s({ width: '46px', height: '46px', flex: 'none', borderRadius: '11px', background: swatch, border: `1px solid ${BOARD_HAIR}` })}"></span>
  <span style="${s({ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '0', flex: '1' })}">
    <span style="${s({ display: 'flex', alignItems: 'baseline', gap: '9px', flexWrap: 'wrap' })}">
      <span style="${s({ fontSize: '13px', fontWeight: 700, color: BOARD_T1, letterSpacing: '-0.005em' })}">${name}</span>
      <span style="${s({ ...TYPE.numeric, fontSize: '11.5px', fontWeight: 600, color: BOARD_T3 })}">${c}</span>
      ${ratio ? `<span style="${s({ ...TYPE.numeric, fontSize: '10.5px', padding: '2px 6px', borderRadius: '5px', background: ratio >= 4.5 ? 'rgba(123,215,127,0.16)' : 'rgba(246,109,103,0.16)', color: ratio >= 4.5 ? '#7BD77F' : '#F66D67' })}">${ratio}:1 on ${against}</span>` : ''}
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
  ['type.displayXl', 'displayXl', '1,240', 'Archivo 33 / 700 / width 118 / −0.022em', 'The number inside each ring, and nothing else.'],
  ['type.displayLg', 'displayLg', 'Today', 'Archivo 25 / 700 / width 116 / −0.018em', 'Screen titles and the headline stat on every chart card.'],
  ['type.title', 'title', 'Bench Press', 'Archivo 19 / 700 / width 104', 'Card titles, exercise names, sheet headers.'],
  ['type.strong', 'strong', 'Chicken Breast', 'Archivo 16.5 / 650', 'The quick-add tile name. The one size tuned for arm’s length.'],
  ['type.body', 'bodyT', 'Chicken &amp; Rice', 'Archivo 15 / 450', 'Log rows, settings rows, running text.'],
  ['type.numeric', 'numeric', '80 kg × 8', 'Archivo 15 / 700 / width 108 / tabular', 'Every number outside a ring. Tabular so columns never jitter.'],
  ['type.label', 'label', 'Last: 80 kg × 8 · 4 days ago', 'Archivo 12.5 / 500', 'Captions, secondary lines, chart footnotes.'],
  ['type.micro', 'micro', 'Quick add', 'Archivo 10.5 / 650 / +0.14em / caps', 'Section eyebrows and chart labels. Never for anything you must read.'],
];

const SPACE = [
  ['space.1', 4, 'The tightest gap in the system: a micro label above the number it names.'],
  ['space.2', 6, 'Inside a control — icon to label, number to unit.'],
  ['space.3', 8, 'Between a section eyebrow and the thing it heads.'],
  ['space.4', 10, 'Between quick-add tiles, and between the two chips under them.'],
  ['space.5', 12, 'The default gap between two cards. If you are unsure, it is this one.'],
  ['space.6', 16, 'Card padding, and the gutter on Workout, Charts and Settings.'],
  ['space.7', 20, 'The Today gutter — Today gets more air than any other screen.'],
  ['space.8', 24, 'Between two settings groups.'],
  ['space.9', 32, 'Above a screen-level heading in a long scroll.'],
];
const RADIUS = [
  ['radius.xs', 8, 'Set-index badges and micro pills inside a row.'],
  ['radius.sm', 10, 'A segment inside a segmented track; small utility chips.'],
  ['radius.md', 14, 'Steppers, stat cells, portion chips, segmented tracks, primary buttons.'],
  ['radius.lg', 18, 'The quick-add tile, the weight and workout chips, settings groups.'],
  ['radius.xl', 22, 'Sheets, the rest-timer bar, the account card — the big floating objects.'],
  ['radius.card', 24, 'Cards. The largest thing on any screen, so the roundest.'],
  ['radius.pill', 999, 'Anything genuinely pill-shaped: avatars, dots, the search button, Sync now.'],
];

function specimenBoard() {
  return `<div style="${s({ width: '1240px', background: BOARD, padding: '40px', fontFamily: FONT, color: BOARD_T1 })}">
${boardHead('Colour &amp; type', 'Dark is the product; light is the courtesy. Both palettes are generated from the same OKLCH ramp, so every hue keeps its lightness relationship when the theme flips. Every token below is named, has one stated job, and clears 4.5:1 where it carries text.')}
<div style="${s({ display: 'flex', gap: '20px', alignItems: 'flex-start' })}">
${tokenTable(DARK, 'Dark — primary')}
${tokenTable(LIGHT, 'Light')}
</div>

<div style="${s({ marginTop: '34px', background: BOARD_SURF, border: `1px solid ${BOARD_HAIR}`, borderRadius: '20px', padding: '22px 24px' })}">
  <div style="${t('title', { fontSize: '17px', color: BOARD_T1 })}">Type — Archivo, one family, two widths</div>
  <div style="${s({ ...TYPE.label, color: BOARD_T2, marginTop: '7px', maxWidth: '900px', textWrap: 'pretty' })}">Archivo carries a variable width axis. Numbers are set in the expanded cut so they read as instrument readouts; words stay at normal width. Two voices, one file, no pairing risk. Tabular figures everywhere — a changing digit must never shift the ones beside it.</div>
${TYPE_ROWS.map(([name, key, sample, spec, use]) => `  <div style="${s({ display: 'flex', gap: '24px', alignItems: 'center', padding: '15px 0', borderTop: `1px solid ${BOARD_HAIR}` })}">
    <span style="${s({ width: '300px', flex: 'none', color: BOARD_T1, ...TYPE[key] })}">${sample}</span>
    <span style="${s({ width: '250px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '4px' })}"><span style="${s({ fontSize: '13px', fontWeight: 700, color: BOARD_T1 })}">${name}</span><span style="${s({ ...TYPE.numeric, fontSize: '11.5px', fontWeight: 550, color: BOARD_T3 })}">${spec}</span></span>
    <span style="${s({ flex: '1', fontSize: '12.5px', lineHeight: '1.45', color: BOARD_T2, textWrap: 'pretty' })}">${use}</span>
  </div>`).join('\n')}
</div>

<div style="${s({ display: 'flex', gap: '20px', marginTop: '20px', alignItems: 'flex-start' })}">
  <div style="${s({ flex: '1', minWidth: '0', background: BOARD_SURF, border: `1px solid ${BOARD_HAIR}`, borderRadius: '20px', padding: '22px 24px' })}">
    <div style="${t('title', { fontSize: '17px', color: BOARD_T1 })}">Space</div>
    <div style="${s({ ...TYPE.label, color: BOARD_T2, marginTop: '7px', textWrap: 'pretty' })}">Nine steps, no ad-hoc values. Every gap and every padding on every screen is one of these names.</div>
${SPACE.map(([name, v, use]) => `    <div style="${s({ display: 'flex', gap: '14px', alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${BOARD_HAIR}` })}">
      <span style="${s({ width: '34px', flex: 'none', display: 'flex', justifyContent: 'center' })}"><span style="${s({ width: v + 'px', height: '30px', background: DARK.kcal, borderRadius: '2px' })}"></span></span>
      <span style="${s({ width: '108px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '3px' })}"><span style="${s({ fontSize: '12.5px', fontWeight: 700, color: BOARD_T1 })}">${name}</span><span style="${s({ ...TYPE.numeric, fontSize: '11px', fontWeight: 600, color: BOARD_T3 })}">${v} pt</span></span>
      <span style="${s({ flex: '1', minWidth: '0', fontSize: '12px', lineHeight: '1.45', color: BOARD_T2, textWrap: 'pretty' })}">${use}</span>
    </div>`).join('\n')}
  </div>
  <div style="${s({ flex: '1', minWidth: '0', background: BOARD_SURF, border: `1px solid ${BOARD_HAIR}`, borderRadius: '20px', padding: '22px 24px' })}">
    <div style="${t('title', { fontSize: '17px', color: BOARD_T1 })}">Radius</div>
    <div style="${s({ ...TYPE.label, color: BOARD_T2, marginTop: '7px', textWrap: 'pretty' })}">Radius encodes size: the bigger the object, the rounder it is. Seven steps, and nothing in between them.</div>
${RADIUS.map(([name, v, use]) => `    <div style="${s({ display: 'flex', gap: '14px', alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${BOARD_HAIR}` })}">
      <span style="${s({ width: '46px', height: '38px', flex: 'none', background: DARK.raised, border: `1px solid ${DARK.line}`, borderRadius: v + 'px' })}"></span>
      <span style="${s({ width: '108px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '3px' })}"><span style="${s({ fontSize: '12.5px', fontWeight: 700, color: BOARD_T1 })}">${name}</span><span style="${s({ ...TYPE.numeric, fontSize: '11px', fontWeight: 600, color: BOARD_T3 })}">${v === 999 ? 'fully rounded' : v + ' pt'}</span></span>
      <span style="${s({ flex: '1', minWidth: '0', fontSize: '12px', lineHeight: '1.45', color: BOARD_T2, textWrap: 'pretty' })}">${use}</span>
    </div>`).join('\n')}
  </div>
</div>`;
}

/* -------------------------------------------------------- motion + a11y */
const MOTION = [
  ['Quick-add tap', 'The tile scales 1 → 0.972 → 1. Nothing else on the screen moves.', '90 ms down / 130 ms up · ease-out', 'No scale. The tick and the haptic still fire.'],
  ['Food logged', 'The calorie arc sweeps to its new length; an amber wash fades across the tile and back out.', 'arc 260 ms · cubic-bezier(.2,0,0,1)<br>wash 120 in / 900 hold / 200 out', 'Arc jumps straight to the new value. The wash becomes a 900 ms static state.'],
  ['Undo toast', 'Rises 16 px above the tab bar and fades in; auto-dismisses after 4 s.', '180 ms in / 140 ms out · ease-out', 'Fade only, no rise. Dismiss time unchanged.'],
  ['Long-press → portion', 'Sheet scales 0.94 → 1 from the tile’s centre; the screen behind it blurs and dims.', '200 ms · spring, damping .82', 'Cross-fade only, 120 ms.'],
  ['Set logged', 'The active set row collapses 102 → 44 pt and the next set expands into its place.', '220 ms · ease-in-out', 'Instant swap. The rest timer still starts.'],
  ['Rest timer', 'The ring depletes continuously; the last three seconds pulse.', '1 s per tick · linear · pulse 400 ms', 'Ring still depletes — it is information, not decoration. The pulse is dropped.'],
  ['Tab change', 'Screens cross-fade; the tab icon thickens from 1.7 to 2.0 stroke.', '140 ms · ease-out', 'Kept as-is: a cross-fade under 150 ms triggers nothing vestibular.'],
  ['Chart draw-in', 'Trend and average lines stroke on left-to-right; the daily points fade in behind them.', '420 ms · 12 ms stagger · ease-out<br>once per screen entry', 'Charts render complete. No draw-on.'],
  ['Range switch', 'Axis rescales and the path morphs between the two ranges.', '260 ms · ease-in-out', 'Instant redraw.'],
  ['Sync', 'A 2 pt progress hairline runs under the header while a push/pull is in flight.', 'continuous · indeterminate', 'Replaced by a static “Syncing…” label. Never blocks anything.'],
  ['Screen push', 'Platform default — iOS slide-from-right, Android fade-through.', 'platform', 'Platform’s own reduced-motion behaviour, untouched.'],
];
const HAPTICS = [
  ['Food logged', 'impactMedium', 'EFFECT_HEAVY_CLICK', 'The confirmation. This is what replaces a Save button.'],
  ['Set logged', 'impactLight', 'EFFECT_TICK', 'Lighter — it happens 20+ times a session.'],
  ['Rest finished', 'notificationSuccess', 'EFFECT_DOUBLE_CLICK', 'Fires even when the screen is off.'],
  ['Ring completed', 'notificationSuccess', 'EFFECT_DOUBLE_CLICK', 'Once per ring per day. Earned, so it stays special.'],
  ['Destructive confirm', 'notificationWarning', 'EFFECT_HEAVY_CLICK', 'Delete a food, discard a session.'],
];
const TARGETS = [
  ['Quick-add tile', '169 × 80', '—', 'The primary action. Deliberately enormous.'],
  ['Set-complete button', '66 × 102', '—', 'The primary action on Workout.'],
  ['Weight / workout chip', '170 × 54', '—', ''],
  ['Stepper − / +', '56 × 48', '—', 'Held repeat after 400 ms.'],
  ['Portion chip', '56 × 48', '—', ''],
  ['Tab bar item', '97 × 58', '—', 'Full-height strip, not just the icon.'],
  ['Header search', '44 × 44', '—', 'The floor. Nothing is smaller.'],
  ['Segmented option', '46 × 34 painted', '46 × 48', 'hitSlop extends it to the row height.'],
  ['Range switcher segment', '67 × 36 painted', '67 × 44', 'hitSlop extends it to the control height.'],
  ['Settings row', '358 × 52', '—', ''],
  ['Log row (swipe to delete)', '350 × 40 painted', '350 × 44', 'hitSlop 2 pt top and bottom.'],
];

function motionBoard() {
  const th = (txt, w) => `<span style="${s({ width: w, flex: w === '1' ? '1' : 'none', ...TYPE.micro, fontSize: '9.5px', color: BOARD_T3 })}">${txt}</span>`;
  const td = (txt, w, o = {}) => `<span style="${s({ width: w, flex: w === '1' ? '1' : 'none', fontSize: o.size || '12.5px', fontWeight: o.weight || 450, lineHeight: '1.45', color: o.color || BOARD_T2, textWrap: 'pretty' })}">${txt}</span>`;
  const panel = (title, sub, inner) => `<div style="${s({ background: BOARD_SURF, border: `1px solid ${BOARD_HAIR}`, borderRadius: '20px', padding: '22px 24px', marginTop: '20px' })}">
  <div style="${t('title', { fontSize: '17px', color: BOARD_T1 })}">${title}</div>
  ${sub ? `<div style="${s({ ...TYPE.label, color: BOARD_T2, marginTop: '7px', maxWidth: '900px', textWrap: 'pretty' })}">${sub}</div>` : ''}
  <div style="${s({ marginTop: '16px' })}">${inner}</div>
</div>`;

  const motionTable = `<div style="${s({ display: 'flex', gap: '20px', padding: '0 0 9px' })}">${th('Event', '190px')}${th('What moves', '1')}${th('Duration &amp; curve', '250px')}${th('Reduce motion', '300px')}</div>
${MOTION.map(([a, b, c, d]) => `<div style="${s({ display: 'flex', gap: '20px', padding: '13px 0', borderTop: `1px solid ${BOARD_HAIR}`, alignItems: 'flex-start' })}">${td(a, '190px', { color: BOARD_T1, weight: 700, size: '13px' })}${td(b, '1')}${td(c, '250px', { color: BOARD_T3, size: '11.5px', weight: 550 })}${td(d, '300px')}</div>`).join('\n')}`;

  const hapticTable = `<div style="${s({ display: 'flex', gap: '20px', padding: '0 0 9px' })}">${th('Moment', '190px')}${th('iOS', '250px')}${th('Android', '270px')}${th('Why', '1')}</div>
${HAPTICS.map(([a, b, c, d]) => `<div style="${s({ display: 'flex', gap: '20px', padding: '12px 0', borderTop: `1px solid ${BOARD_HAIR}`, alignItems: 'flex-start' })}">${td(a, '190px', { color: BOARD_T1, weight: 700, size: '13px' })}${td(b, '250px', { color: DARK.kcal, size: '12px', weight: 600 })}${td(c, '270px', { color: DARK.prot, size: '12px', weight: 600 })}${td(d, '1')}</div>`).join('\n')}`;

  const targetTable = `<div style="${s({ display: 'flex', gap: '20px', padding: '0 0 9px' })}">${th('Element', '250px')}${th('Painted size (pt)', '190px')}${th('Hit area (pt)', '160px')}${th('Note', '1')}</div>
${TARGETS.map(([a, b, c, d]) => `<div style="${s({ display: 'flex', gap: '20px', padding: '11px 0', borderTop: `1px solid ${BOARD_HAIR}`, alignItems: 'flex-start' })}">${td(a, '250px', { color: BOARD_T1, weight: 650, size: '13px' })}${td(b, '190px', { color: DARK.ok, size: '12.5px', weight: 650 })}${td(c, '160px', { color: c === '—' ? BOARD_T3 : DARK.ok, size: '12.5px', weight: 650 })}${td(d, '1')}</div>`).join('\n')}`;

  const pairs = [
    ['text.primary on bg.canvas', DARK.t1, DARK.canvas, LIGHT.t1, LIGHT.canvas],
    ['text.secondary on bg.canvas', DARK.t2, DARK.canvas, LIGHT.t2, LIGHT.canvas],
    ['text.tertiary on bg.tile', DARK.t3, DARK.tile, LIGHT.t3, LIGHT.tile],
    ['text.tertiary on bg.surface', DARK.t3, DARK.surface, LIGHT.t3, LIGHT.surface],
    ['text.tertiary on bg.press — worst text pair', DARK.t3, DARK.press, LIGHT.t3, LIGHT.press],
    ['data.kcal on bg.press — tile mid-tap', DARK.kcal, DARK.press, LIGHT.kcal, LIGHT.press],
    ['data.kcal on bg.tile', DARK.kcal, DARK.tile, LIGHT.kcal, LIGHT.tile],
    ['data.protein on bg.tile', DARK.prot, DARK.tile, LIGHT.prot, LIGHT.tile],
    ['data.body on bg.surface', DARK.body, DARK.surface, LIGHT.body, LIGHT.surface],
    ['data.strength on bg.surface', DARK.str, DARK.surface, LIGHT.str, LIGHT.surface],
    ['state.success on bg.surface', DARK.ok, DARK.surface, LIGHT.ok, LIGHT.surface],
    ['state.danger on bg.surface', DARK.danger, DARK.surface, LIGHT.danger, LIGHT.surface],
    ['button label on data.kcal', '#151006', DARK.kcal, '#FFFFFF', LIGHT.kcal],
    ['button label on data.strength', '#180B1F', DARK.str, '#FFFFFF', LIGHT.str],
    ['button label on data.body', '#071120', DARK.body, '#FFFFFF', LIGHT.body],
    ['tab label, inactive', DARK.t3, DARK.canvas, LIGHT.t3, LIGHT.canvas],
  ];
  const badge = (r) => `<span style="${s({ ...TYPE.numeric, fontSize: '12px', padding: '3px 8px', borderRadius: '6px', background: r >= 4.5 ? 'rgba(123,215,127,0.16)' : 'rgba(246,109,103,0.18)', color: r >= 4.5 ? DARK.ok : DARK.danger })}">${r.toFixed(2)}:1</span>`;
  const allD = pairs.map(([, a, b]) => cr(a, b)), allL = pairs.map(([, , , a, b]) => cr(a, b));
  const contrastTable = `<div style="${s({ display: 'flex', gap: '20px', padding: '0 0 9px' })}">${th('Pair', '1')}${th('Dark', '150px')}${th('Light', '150px')}</div>
${pairs.map(([n, a, b, c, d]) => `<div style="${s({ display: 'flex', gap: '20px', padding: '10px 0', borderTop: `1px solid ${BOARD_HAIR}`, alignItems: 'center' })}">${td(n, '1', { color: BOARD_T1, weight: 550, size: '13px' })}<span style="${s({ width: '150px', flex: 'none' })}">${badge(cr(a, b))}</span><span style="${s({ width: '150px', flex: 'none' })}">${badge(cr(c, d))}</span></div>`).join('\n')}
<div style="${s({ display: 'flex', gap: '20px', padding: '13px 0 0', borderTop: `1px solid ${BOARD_HAIR}`, alignItems: 'center' })}">${td('Worst case in the whole system', '1', { color: BOARD_T1, weight: 700, size: '13px' })}<span style="${s({ width: '150px', flex: 'none' })}">${badge(Math.min(...allD))}</span><span style="${s({ width: '150px', flex: 'none' })}">${badge(Math.min(...allL))}</span></div>`;

  const rules = `<div style="${s({ display: 'flex', flexDirection: 'column', gap: '11px' })}">
${['Nothing runs longer than 260 ms except the chart draw-in, which happens once per screen entry.',
    'Every animation is interruptible. A second tap during a ring sweep retargets it; it never queues, and it never blocks the log.',
    'Motion is never the only signal. Every animated confirmation also has a static one — a colour, a tick, a number that changed — and a haptic.',
    '<span style="color:#F5F7FA">reduce motion</span> is read from the OS and is also an app setting, so it can be turned on without turning it on system-wide.',
    'Haptics survive reduce-motion. They are feedback, not animation, and on a gym floor they are often the only confirmation you get.',
  ].map((x) => `  <div style="${s({ display: 'flex', gap: '10px', alignItems: 'flex-start' })}"><span style="${s({ width: '5px', height: '5px', borderRadius: '999px', background: DARK.kcal, marginTop: '7px', flex: 'none' })}"></span><span style="${s({ fontSize: '13px', lineHeight: '1.5', color: BOARD_T2, textWrap: 'pretty' })}">${x}</span></div>`).join('\n')}
</div>`;

  return `<div style="${s({ width: '1240px', background: BOARD, padding: '40px', fontFamily: FONT, color: BOARD_T1 })}">
${boardHead('Motion, haptics &amp; access', 'Motion here is feedback for an action you just took — it is never decoration, and it is never the only way you learn something happened. Sizes and contrast are measured, not estimated: the figures below are computed from the token values themselves.')}
${panel('What animates', '', motionTable)}
${panel('Rules', '', rules)}
${panel('Haptics', 'The haptic is what replaces the Save button. If it does not fire, the user does not know the food was logged.', hapticTable)}
${panel('Tap targets', 'Minimum 44 × 44 pt. Where the painted control is smaller than that, the touch area is extended with hitSlop and both figures are listed.', targetTable)}
${panel('Text contrast', 'WCAG AA needs 4.5:1 for body text. Every pair below is computed from the hex values in the specimen, in both themes — including the pressed state, which is the hardest surface in the system because it moves toward the text. The four <span style="color:#F5F7FA">data.*Muted</span> colours are deliberately not in this table: they paint the scattered daily points behind a trend line, they are texture rather than information, and every number they suggest is also stated in words on the same card. They still sit at 3.0–3.3:1 in dark and 2.4–2.5:1 in light, which is enough to see them in a badly lit gym and quiet enough that the trend line stays the loudest thing on the chart.', contrastTable)}
</div>`;
}

/* ------------------------------------------------------------------- output */
function dc(inner, bg, link = DARK.kcal, linkHover = '#FFC97A') {
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
    a { color: ${link}; text-decoration: none; }
    a:hover { color: ${linkHover}; }
    text { font-variant-numeric: tabular-nums; }
  </style>
</helmet>
${inner}
</x-dc>
</body>
</html>`;
}

const files = {
  'Main.dc.html':       dc(todayScreen(DARK), DARK.canvas),
  'Workout.dc.html':    dc(workoutScreen(DARK), DARK.canvas),
  'Charts.dc.html':     dc(chartsScreen(DARK), DARK.canvas),
  'Settings.dc.html':   dc(settingsScreen(DARK), DARK.canvas),
  'QuickAdd.dc.html':   dc(quickAddBoard(), BOARD),
  'Empty.dc.html':      dc(emptyBoard(), BOARD),
  'TodayLight.dc.html':    dc(todayScreen(LIGHT), LIGHT.canvas, LIGHT.kcal, '#7A3E01'),
  'WorkoutLight.dc.html':  dc(workoutScreen(LIGHT), LIGHT.canvas, LIGHT.kcal, '#7A3E01'),
  'ChartsLight.dc.html':   dc(chartsScreen(LIGHT), LIGHT.canvas, LIGHT.kcal, '#7A3E01'),
  'SettingsLight.dc.html': dc(settingsScreen(LIGHT), LIGHT.canvas, LIGHT.kcal, '#7A3E01'),
  'Specimen.dc.html':   dc(specimenBoard(), BOARD),
  'Motion.dc.html':     dc(motionBoard(), BOARD),
};

const canvas = {
  pages: [
    { id: 'page-1', name: 'Screens — dark' },
    { id: 'page-2', name: 'Light theme & system' },
  ],
  artboards: [
    { file: 'Main.dc.html',     title: 'Today',              x: 0,    y: 0,    w: 390,  h: 844,  page: 'page-1' },
    { file: 'Workout.dc.html',  title: 'Workout — active',   x: 500,  y: 0,    w: 390,  h: 844,  page: 'page-1' },
    { file: 'Charts.dc.html',   title: 'Charts — full scroll', x: 1000, y: 0,  w: 390,  h: 1760, page: 'page-1' },
    { file: 'Settings.dc.html', title: 'Settings — full scroll', x: 1500, y: 0, w: 390, h: 1560, page: 'page-1' },
    { file: 'QuickAdd.dc.html', title: 'Quick-add tile — real size', x: 0, y: 1990, w: 860, h: 800, page: 'page-1' },
    { file: 'Empty.dc.html',    title: 'Empty states',       x: 990,  y: 1990, w: 1742, h: 1100, page: 'page-1' },

    { file: 'TodayLight.dc.html',    title: 'Today — light',    x: 0,    y: 0, w: 390,  h: 844,  page: 'page-2' },
    { file: 'WorkoutLight.dc.html',  title: 'Workout — light',  x: 500,  y: 0, w: 390,  h: 844,  page: 'page-2' },
    { file: 'ChartsLight.dc.html',   title: 'Charts — light',   x: 1000, y: 0, w: 390,  h: 1760, page: 'page-2' },
    { file: 'SettingsLight.dc.html', title: 'Settings — light', x: 1500, y: 0, w: 390,  h: 1560, page: 'page-2' },
    { file: 'Specimen.dc.html',      title: 'Colour & type specimen', x: 2000, y: 0, w: 1240, h: 3330, page: 'page-2' },
    { file: 'Motion.dc.html',        title: 'Motion, haptics & access', x: 3360, y: 0, w: 1240, h: 3160, page: 'page-2' },
  ],
  annotations: [
    { id: 'start-here', page: 'page-1', x: 0, y: -300, w: 880, text: 'CHECKPOINT 1 — your sign-off gate\n\nFour screens in the dark theme (dark is the product), the quick-add tile drawn at real size, and every day-one empty state. The light theme and the full colour / type / motion specs are on page 2 — use the pages menu in the top bar.\n\nNothing gets coded until you say yes to this. Changing a decision here costs minutes; changing it after three sprints of screens costs days.' },
    { id: 'charts-note', page: 'page-1', x: 940, y: -300, w: 440, text: 'Charts is one long scroll — the artboard shows the whole thing at once; on the phone the tab bar floats over it.\n\nThe top card is the one that matters. It answers the only question worth asking: is what I am eating actually working?' },
    { id: 'questions', page: 'page-1', x: 1450, y: -300, w: 440, text: 'THREE THINGS I NEED FROM YOU\n\n1. Six quick-add tiles, or nine? Six keeps the name at 16.5pt and readable across a gym. Nine covers more of your day but the names shrink.\n\n2. Should a long-press be needed at all, or should tapping a tile a second time within 5s bump it to 2 portions?\n\n3. Weight in kg and bar weight in kg — is lb ever needed, or can I drop the unit switch entirely?' },
    { id: 'tile-note', page: 'page-1', x: 0, y: 1830, w: 440, text: 'Everything on Today is secondary to this object. Judge it at arm’s length: hold the phone where you would hold it mid-set.' },
    { id: 'empty-note', page: 'page-1', x: 990, y: 1830, w: 440, text: 'Day one is the only day every user sees. No screen here shrugs — each one says what will fill it and what the first tap is.' },
    { id: 'light-note', page: 'page-2', x: 0, y: -260, w: 880, text: 'The light theme. Same layout, same tokens, same code path — both palettes are generated from one OKLCH ramp, so light can never drift away from dark as the app grows.' },
    { id: 'system-note', page: 'page-2', x: 2000, y: -260, w: 880, text: 'Every named token with the one job it is allowed to do, and its measured contrast ratio. These become src/theme/tokens.ts the moment you sign off — not before.' },
  ],
  launch: { view: 'canvas', page: 'page-1' },
};

for (const [name, src] of Object.entries(files)) writeFileSync(join(OUT, name), src);
writeFileSync(join(OUT, 'canvas.json'), JSON.stringify(canvas, null, 2));
console.log(Object.entries(files).map(([n, v]) => `${n.padEnd(24)} ${(v.length / 1024).toFixed(1)} KiB`).join('\n'));
console.log('canvas.json          ', canvas.artboards.length, 'artboards,', canvas.pages.length, 'pages');
