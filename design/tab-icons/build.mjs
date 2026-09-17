// Vitals — tab-bar icons canvas (issue #80).
// Emits .dc.html artboards + canvas.json under design/tab-icons/canvas/.
// Colours, type, sizes and glyph names are read from src/theme/tokens.ts; glyph shapes are the
// Ionicons 7.4 SVG sources in ./ionicons (MIT), the same outlines @expo/vector-icons ships as a font.
// Run: node design/tab-icons/build.mjs   (Node >= 23.6)
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tokens from '../../src/theme/tokens.ts';

const { themes, fontInstances, space, size, layout, glyph } = tokens;
const TT = tokens.type;
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'canvas');
mkdirSync(OUT, { recursive: true });

const s = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':' + v).join(';');
const FONT = "Archivo,'Helvetica Neue',Helvetica,system-ui,sans-serif";
const r4 = (x) => Math.round(x * 10000) / 10000;
const t = (role, extra = {}) => {
  const st = TT[role], f = fontInstances[st.fontFamily];
  return s({ fontSize: st.fontSize + 'px', fontWeight: f.wght, fontStretch: f.wdth + '%',
    letterSpacing: r4(st.letterSpacing / st.fontSize) + 'em', lineHeight: String(r4(st.lineHeight / st.fontSize)),
    textTransform: st.textTransform, ...extra });
};

// An Ionicons glyph at a font size: the SVG's 512-unit box maps onto the font's em square.
const svgBody = (name) => readFileSync(join(HERE, 'ionicons', name + '.svg'), 'utf8')
  .replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const ion = (name, px, color) =>
  `<svg width="${px}" height="${px}" viewBox="0 0 512 512" fill="${color}" style="display:block;flex:none;color:${color}">${svgBody(name)}</svg>`;

const TABH = size.tabBar.height, HOMEH = 26, W = 390;
const TABS = [['today', 'Today'], ['workout', 'Workout'], ['charts', 'Charts'], ['settings', 'Settings']];

/* The tab bar exactly as the Checkpoint 1 canvas draws it; only the glyphs are new. */
function tabbar(th, active, { filled = true } = {}) {
  const C = th.color.tabBar;
  return `<nav style="${s({ position: 'relative', height: TABH + HOMEH + 'px', paddingBottom: HOMEH + 'px', display: 'flex', background: C.bg, borderTop: `1px solid ${C.border}` })}">
${TABS.map(([key, label]) => {
    const on = key === active;
    const color = on ? C[`${key}ActiveText`] : C.inactiveText;
    const g = glyph.tab[key];
    return `  <div style="${s({ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', height: TABH + 'px' })}">${ion(on && filled ? g.active : g.inactive, size.icon.tab, color)}<span style="${t(on ? 'tabLabelActive' : 'tabLabel', { color })}">${label}</span></div>`;
  }).join('\n')}
</nav>`;
}

const PAD = space[8];
const CAP = TT.microSm.lineHeight + space[3];
const BLOCK = CAP + TABH + HOMEH + 1;
const barsHeight = PAD * 2 + BLOCK * 4 + PAD * 3;

function barsBoard(th, opts) {
  const c = th.color;
  return `<div style="${s({ width: W + 'px', height: barsHeight + 'px', background: c.bg.canvas, padding: `${PAD}px 0`, display: 'flex', flexDirection: 'column', gap: PAD + 'px' })}">
${TABS.map(([key, label]) => `<div style="${s({ display: 'flex', flexDirection: 'column', gap: space[3] + 'px' })}">
  <span style="${t('microSm', { color: c.text.tertiary, paddingLeft: layout.gutter + 'px' })}">${label} selected</span>
  ${tabbar(th, key, opts)}
</div>`).join('\n')}
</div>`;
}

/* A Today's-log row swiped fully open: the row slides left by the pane width, the pane shows the trash. */
const PANE = size.tapTargetMin + space[5];
const ROWH = size.row.log;
function deleteBoard(th, label) {
  const c = th.color, L = c.logRow;
  const row = (open) => `<div style="${s({ padding: `0 ${layout.gutterToday}px` })}"><div style="${s({ position: 'relative', height: ROWH + 'px', overflow: 'hidden' })}">
  <div style="${s({ position: 'absolute', top: 0, bottom: 0, right: 0, width: PANE + 'px', background: c.state.danger, display: 'flex', alignItems: 'center', justifyContent: 'center' })}">${ion(glyph.delete, size.icon.deleteAction, c.text.onDanger)}</div>
  <div style="${s({ position: 'absolute', top: 0, bottom: 0, left: (open ? -PANE : 0) + 'px', width: '100%', background: c.bg.canvas, display: 'flex', alignItems: 'center', gap: space[4] + 'px' })}">
    <span style="${t('numericXs', { color: L.timeText, width: '38px', flex: 'none' })}">12:40</span>
    <span style="${t('body', { color: L.nameText, flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}">Chicken wrap</span>
    <span style="${t('numericSm', { color: L.kcalText })}">460</span>
    <span style="${t('numericSm', { color: L.proteinText, width: '34px', textAlign: 'right' })}">32 P</span>
  </div>
</div></div>`;
  return `<div style="${s({ width: W + 'px', background: c.bg.canvas, padding: `${PAD}px 0`, display: 'flex', flexDirection: 'column', gap: space[3] + 'px' })}">
  <span style="${t('microSm', { color: c.text.tertiary, paddingLeft: layout.gutterToday + 'px' })}">${label} · at rest</span>
  ${row(false)}
  <span style="${t('microSm', { color: c.text.tertiary, paddingLeft: layout.gutterToday + 'px', marginTop: space[5] + 'px' })}">${label} · swiped open</span>
  ${row(true)}
</div>`;
}
const deleteHeight = PAD * 2 + (TT.microSm.lineHeight + space[3] + ROWH) * 2 + space[5] + space[3];

/* Glyph sheet: every name, both cuts, at twice its real size. */
function glyphBoard(th) {
  const c = th.color;
  const rows = [
    ...TABS.map(([key, label]) => [label + ' tab', glyph.tab[key].inactive, glyph.tab[key].active, `size.icon.tab · ${size.icon.tab}`, c.tabBar[`${key}ActiveText`]]),
    ['Delete pane', null, glyph.delete, `size.icon.deleteAction · ${size.icon.deleteAction}`, c.text.primary],
  ];
  const cell = (name, color, px) => name
    ? `<div style="${s({ display: 'flex', alignItems: 'center', gap: space[4] + 'px', width: '190px' })}">${ion(name, px * 2, color)}<span style="${t('numericXs', { color: c.text.secondary })}">${name}</span></div>`
    : `<div style="${s({ width: '190px' })}"><span style="${t('numericXs', { color: c.text.tertiary })}">—</span></div>`;
  return `<div style="${s({ width: '640px', background: c.bg.canvas, padding: PAD + 'px', display: 'flex', flexDirection: 'column', gap: space[6] + 'px' })}">
  <div style="${s({ display: 'flex', flexDirection: 'column', gap: space[2] + 'px' })}">
    <span style="${t('title', { color: c.text.primary })}">Ionicons, from @expo/vector-icons</span>
    <span style="${t('label', { color: c.text.secondary })}">Ships with Expo and runs in Expo Go. One family: every glyph has a matched outline and filled cut, so a selected tab changes shape as well as colour.</span>
  </div>
  <div style="${s({ display: 'flex', gap: space[4] + 'px', borderBottom: `1px solid ${c.line.hairline}`, paddingBottom: space[3] + 'px' })}">
    <span style="${t('microSm', { color: c.text.tertiary, width: '110px' })}">Where</span>
    <span style="${t('microSm', { color: c.text.tertiary, width: '190px' })}">At rest</span>
    <span style="${t('microSm', { color: c.text.tertiary, width: '190px' })}">Selected / shown</span>
    <span style="${t('microSm', { color: c.text.tertiary })}">Size token</span>
  </div>
${rows.map(([where, off, on, tok, accent]) => `  <div style="${s({ display: 'flex', gap: space[4] + 'px', alignItems: 'center', minHeight: '64px' })}">
    <span style="${t('label', { color: c.text.primary, width: '110px' })}">${where}</span>
    ${cell(off, c.tabBar.inactiveText, size.icon.tab)}
    ${cell(on, accent, size.icon.tab)}
    <span style="${t('numericXs', { color: c.text.secondary })}">${tok}</span>
  </div>`).join('\n')}
</div>`;
}
const glyphHeight = 700; // flowing content; generous frame, surplus paints the canvas colour

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
    a { color: ${themes.dark.color.data.kcal}; text-decoration: none; }
    a:hover { color: ${themes.dark.color.fill.kcalPress}; }
  </style>
</helmet>
${inner}
</x-dc>
</body>
</html>`;

const D = themes.dark, Lt = themes.light;
const files = {
  'Main.dc.html': dc(barsBoard(D), D.color.bg.canvas),
  'TabBarLight.dc.html': dc(barsBoard(Lt), Lt.color.bg.canvas),
  'DeletePane.dc.html': dc(deleteBoard(D, 'Dark'), D.color.bg.canvas),
  'DeletePaneLight.dc.html': dc(deleteBoard(Lt, 'Light'), Lt.color.bg.canvas),
  'Glyphs.dc.html': dc(glyphBoard(D), D.color.bg.canvas),
  'OutlineOnly.dc.html': dc(barsBoard(D, { filled: false }), D.color.bg.canvas),
};
for (const [name, html] of Object.entries(files)) writeFileSync(join(OUT, name), html);

const GAP = 110, ROW2 = barsHeight + 150;
const canvas = {
  artboards: [
    { file: 'Main.dc.html', title: 'Tab bar — dark (recommended)', x: 0, y: 0, w: W, h: barsHeight },
    { file: 'TabBarLight.dc.html', title: 'Tab bar — light', x: W + GAP, y: 0, w: W, h: barsHeight },
    { file: 'Glyphs.dc.html', title: 'Glyph names and sizes', x: (W + GAP) * 2, y: 0, w: 640, h: glyphHeight },
    { file: 'DeletePane.dc.html', title: 'Swipe-to-delete pane — dark', x: 0, y: ROW2, w: W, h: deleteHeight },
    { file: 'DeletePaneLight.dc.html', title: 'Swipe-to-delete pane — light', x: W + GAP, y: ROW2, w: W, h: deleteHeight },
    { file: 'OutlineOnly.dc.html', title: 'Alternative: outline only, colour marks the tab', x: (W + GAP) * 2, y: glyphHeight + 150, w: W, h: barsHeight },
  ],
  annotations: [
    { id: 'brief', x: 0, y: -210, w: 880, text: 'Issue #80 — bottom tab icons + trash can. Nothing else in the tab bar changes: same height, labels, colours and hairline as the approved canvas.\n\nRecommended: Ionicons. At rest a tab shows the outline glyph in grey; the selected tab switches to the filled glyph in its own colour (Today amber, Workout violet, Charts blue, Settings white/ink). Shape + colour, so it reads in bad light and for colour-blind users.\n\nAlternative (right, row 2): keep the outline and change colour only — lighter, but the selected tab is harder to spot at a glance.' },
    { id: 'trash-colour', x: 0, y: ROW2 + deleteHeight + 40, w: 880, text: 'Trash can: filled "trash" glyph centred on the red pane. Light theme is white on red (6.1:1). Dark theme uses the red that already carries Delete buttons there, which is a light coral — white on it measures 2.9:1 and fails, so the can is near-black (6.7:1). If you want white in dark mode too, the pane needs a deeper red of its own; say so and I will add it.' },
  ],
  launch: { view: 'canvas' },
};
writeFileSync(join(OUT, 'canvas.json'), JSON.stringify(canvas, null, 2) + '\n');
console.log('wrote', Object.keys(files).length, 'artboards to', OUT);
