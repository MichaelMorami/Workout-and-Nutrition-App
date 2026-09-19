/**
 * Visual evidence for `<PortionSheet>`'s subtitle (issue #90) — both themes, one PNG each.
 *
 * WHY THIS EXISTS. There is no simulator in this environment. This draws the same header markup
 * `PortionSheet.tsx` itself draws — the grabber, the food/meal name, and the subtitle line — using
 * the same `tokens.ts` values, so the picture is evidence about the component, not a second
 * implementation of it. Same discipline as `src/components/day-log/__evidence__/build-evidence.mjs`.
 *
 * `servingUnitLabel()` below is copied verbatim from `PortionSheet.tsx` — that file carries JSX,
 * which Node's native type-stripping cannot parse on its own (the same reason
 * `day-log/__evidence__/build-evidence.mjs` copies `timeLabel()` rather than importing it). It must
 * stay byte-for-byte identical to `PortionSheet.tsx`'s own copy.
 *
 * Three sheet headers, per theme: a food ("per 1 pot serving"), a meal ("per meal" — no item
 * count), and a food whose own serving label already ends in "serving" (the `entry-candidate.ts`
 * `'1 serving'` fallback for a pre-#86 log row with no stored label) — proof the wording never
 * doubles to "per 1 serving serving".
 *
 * Run: node src/components/quick-add/__evidence__/build-evidence.mjs
 * (Node >= 23.6 — imports the .ts sources directly via native type stripping.)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { radius, space, themes, type as typeTokens } from '../../../theme/tokens.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LOCALE = 'en-GB';

// Verbatim copy of `servingUnitLabel()` in `PortionSheet.tsx` — see the file header note above.
function servingUnitLabel(candidate) {
  if (candidate.kind === 'meal') return 'meal';
  const label = candidate.servingLabel;
  return /\bserving$/i.test(label.trim()) ? label : `${label} serving`;
}

const font = (t) =>
  `font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:${t.fontSize}px;` +
  `line-height:${t.lineHeight}px;letter-spacing:${t.letterSpacing}px;` +
  (t.textTransform ? `text-transform:${t.textTransform};` : '');

const CANDIDATES = [
  {
    caption: 'A food — "per 1 pot serving"',
    candidate: { kind: 'food', name: 'Greek yoghurt', servingLabel: '1 pot', kcal: 120, protein: 20 },
  },
  {
    caption: 'A meal — "per meal", not an item count',
    candidate: { kind: 'meal', name: 'Post-workout shake', itemCount: 3, kcal: 410, protein: 38 },
  },
  {
    caption: 'Guard: a label already ending in "serving" is not doubled',
    candidate: { kind: 'food', name: 'Protein shake mix', servingLabel: '1 serving', kcal: 140, protein: 25 },
  },
];

function sheetHeader(theme, name, kcal, protein, unit) {
  const { portionSheet, line } = theme.color;
  const kcalText = Math.round(kcal).toLocaleString(LOCALE);
  const proteinText = Math.round(protein).toLocaleString(LOCALE);
  return `
  <div class="sheet" style="background:${portionSheet.bg};border-radius:${radius.xl}px">
    <div class="grabber" style="background:${portionSheet.grabber};border-radius:999px"></div>
    <span style="${font(typeTokens.title)}color:${portionSheet.titleText}">${name}</span>
    <span style="${font(typeTokens.label)}color:${portionSheet.metaText}">${kcalText} kcal &middot; ${proteinText} g protein per ${unit}</span>
    <div class="rule" style="background:${line.hairline}"></div>
  </div>`;
}

function card(theme, caption, candidate) {
  const unit = servingUnitLabel(candidate);
  return `
  <figure class="card">
    <figcaption class="title">${caption}</figcaption>
    ${sheetHeader(theme, candidate.name, candidate.kcal, candidate.protein, unit)}
  </figure>`;
}

function page(theme) {
  const cards = CANDIDATES.map(({ caption, candidate }) => card(theme, caption, candidate)).join('');
  return `<!doctype html><meta charset="utf-8"><title>Portion sheet subtitle — ${theme.name}</title>
  <style>
    :root { color-scheme: ${theme.name}; }
    body { margin:0; padding:${space[7]}px; background:${theme.color.bg.canvas};
           font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; }
    h1 { font-size:15px; font-weight:600; margin:0 0 20px; color:${theme.color.text.secondary}; letter-spacing:.02em; }
    .grid { display:flex; flex-wrap:wrap; gap:22px 18px; align-items:flex-start; }
    .card { margin:0; display:flex; flex-direction:column; align-items:flex-start; gap:${space[3]}px; width:320px; }
    .title { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${theme.color.text.tertiary}; max-width:320px; }
    .sheet { width:100%; box-sizing:border-box; padding:${space[3]}px ${space[6]}px ${space[5]}px;
             display:flex; flex-direction:column; gap:${space[2]}px; }
    .grabber { align-self:center; width:36px; height:4px; }
    .rule { height:1px; margin-top:${space[2]}px; }
  </style>
  <h1>Portion sheet — subtitle wording (issue #90) — ${theme.name} — real tokens</h1>
  <div class="grid">${cards}</div>`;
}

mkdirSync(HERE, { recursive: true });
const stage = mkdtempSync(join(tmpdir(), 'vitals-portion-subtitle-evidence-'));
for (const name of ['dark', 'light']) {
  const html = join(stage, `portion-subtitle-${name}.html`);
  writeFileSync(html, page(themes[name]));
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=1080,220',
    `--screenshot=${join(HERE, `portion-subtitle-${name}.png`)}`,
    `file://${html}`,
  ]);
  console.log(`wrote portion-subtitle-${name}.png`);
}
