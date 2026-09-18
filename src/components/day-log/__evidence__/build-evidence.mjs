/**
 * Visual evidence for `<DayLogList>`/`<DayLogRow>` (issue #42) — both themes, one PNG each.
 *
 * WHY THIS EXISTS. There is no simulator in this environment. This draws the same markup the real
 * components draw — the same `timeLabel()`/`entryName()` and `tokens.ts` values `DayLogRow.tsx`
 * itself uses — so the picture is evidence about these components, not a second implementation of
 * them. Same discipline as `src/components/today/__evidence__/build-evidence.mjs`.
 *
 * Three states, per theme: a populated log, a row mid-swipe with the square trash button revealed,
 * and the empty state a day with nothing logged yet shows.
 *
 * THE DELETE ICON IS A STAND-IN. `SwipeToDelete.tsx` draws `glyph.delete` (`Ionicons` "trash") —
 * Chrome headless has no Ionicons font loaded, so the button below shows the same square, the same
 * `state.danger` fill and the same `size.deleteButton.side`/`radius.sm` geometry, with a plain
 * unicode glyph standing in for the icon. Same stand-in `src/components/food-list/__evidence__/
 * build-evidence.mjs` uses for the same button.
 *
 * Run: node src/components/day-log/__evidence__/build-evidence.mjs
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

// `DayLogRow.tsx` carries JSX, which Node's native type-stripping cannot parse on its own (unlike
// the plain-`.ts` sources the other evidence scripts import directly) — so this one pure helper is
// copied verbatim rather than imported. It must stay byte-for-byte identical to `DayLogRow.tsx`'s
// own `timeLabel`.
function timeLabel(localMinute) {
  const hh = Math.floor(localMinute / 60).toString().padStart(2, '0');
  const mm = (localMinute % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

const font = (t) =>
  `font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:${t.fontSize}px;` +
  `line-height:${t.lineHeight}px;letter-spacing:${t.letterSpacing}px;` +
  (t.textTransform ? `text-transform:${t.textTransform};` : '');

const ROWS = [
  { name: 'Greek yoghurt', kcal: 120, protein: 20, localMinute: 415 },
  { name: 'Post-workout shake', kcal: 410, protein: 38, localMinute: 600 },
  { name: 'Chicken & rice', kcal: 640, protein: 52, localMinute: 780 },
];

/** One row, matching `DayLogRow.tsx`'s own markup: time · name · kcal · protein, with the delete
 * layer always mounted underneath, just covered — `reveal` slides the front layer left by
 * `DELETE_SLIDE_WIDTH` (`SwipeToDelete.tsx`'s own `deleteButton.gap + deleteButton.side`) to show
 * it, the same effect the row's own `PanResponder`-driven `offset` produces on a real swipe. The
 * button drawn underneath is `SwipeToDelete.tsx`'s own square button — its size, corner, fill and
 * icon tint all come from that component's tokens, not a second implementation of it. */
function row(theme, entry, { reveal = false } = {}) {
  const { logRow, state, text: textColor } = theme.color;
  const { deleteButton: db } = size;
  const slideWidth = db.gap + db.side;
  const translateX = reveal ? -slideWidth : 0;
  const kcalText = Math.round(entry.kcal).toLocaleString(LOCALE);
  const proteinText = Math.round(entry.protein).toLocaleString(LOCALE);

  return `
  <div class="row-wrap" style="height:${size.row.logHit}px">
    <div class="back-layer" style="opacity:${reveal ? 1 : 0}">
      <div class="delete-btn" style="width:${db.side}px;height:${db.side}px;border-radius:${radius.sm}px;background:${state.danger}">
        <span style="color:${textColor.onDanger};font-size:${size.icon.deleteAction}px;line-height:1">🗑</span>
      </div>
    </div>
    <div class="front" style="transform:translateX(${translateX}px);min-height:${size.row.logHit}px;
                               border-bottom:1px solid ${logRow.divider}">
      <span style="${font(typeTokens.numericRow)}color:${logRow.timeText};width:44px">${timeLabel(entry.localMinute)}</span>
      <span class="name" style="${font(typeTokens.body)}color:${logRow.nameText}">${entry.name}</span>
      <span style="${font(typeTokens.numericRow)}color:${logRow.kcalText}">${kcalText} kcal</span>
      <span style="${font(typeTokens.numericRow)}color:${logRow.proteinText};text-align:right">${proteinText} g protein</span>
    </div>
  </div>`;
}

function emptyState(theme) {
  const { sectionLabel } = theme.color;
  return `
  <div class="empty">
    <span style="${font(typeTokens.body)}color:${sectionLabel.labelText}">Nothing logged yet today.</span>
    <span style="${font(typeTokens.label)}color:${sectionLabel.metaText};text-align:center">
      Tap a quick-add tile above to log your first food.
    </span>
  </div>`;
}

function listCard(theme, title, body) {
  const { sectionLabel } = theme.color;
  return `
  <figure class="card">
    <figcaption class="title">${title}</figcaption>
    <div class="list" style="background:${theme.color.bg.surface}">
      <span style="${font(typeTokens.micro)}color:${sectionLabel.labelText}">TODAY'S LOG</span>
      ${body}
    </div>
  </figure>`;
}

function page(theme) {
  const populated = listCard(
    theme,
    'A day in progress',
    ROWS.map((r) => row(theme, r)).join(''),
  );
  const swiping = listCard(
    theme,
    'Mid-swipe — Delete revealed, no confirmation',
    [row(theme, ROWS[0], { reveal: true }), row(theme, ROWS[1])].join(''),
  );
  const empty = listCard(theme, 'Nothing logged yet — the empty state', emptyState(theme));

  return `<!doctype html><meta charset="utf-8"><title>Day log — ${theme.name}</title>
  <style>
    :root { color-scheme: ${theme.name}; }
    body { margin:0; padding:${space[7]}px; background:${theme.color.bg.canvas};
           font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; }
    h1 { font-size:15px; font-weight:600; margin:0 0 20px; color:${theme.color.text.secondary}; letter-spacing:.02em; }
    .grid { display:flex; flex-wrap:wrap; gap:22px 18px; align-items:flex-start; }
    .card { margin:0; display:flex; flex-direction:column; align-items:flex-start; gap:${space[3]}px;
            width:360px; }
    .title { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${theme.color.text.tertiary}; }
    .list { width:100%; box-sizing:border-box; border-radius:18px; padding:${space[5]}px;
            display:flex; flex-direction:column; gap:${space[3]}px; overflow:hidden; }
    .row-wrap { position:relative; width:100%; overflow:hidden; }
    .back-layer { position:absolute; inset:0; display:flex; justify-content:flex-end; align-items:center; }
    .delete-btn { display:flex; align-items:center; justify-content:center; box-sizing:border-box; }
    .front { position:relative; display:flex; align-items:center; gap:${space[2]}px;
              padding:0 ${space[1]}px; background:${theme.color.bg.canvas}; transition:none; }
    .name { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .empty { padding:${space[7]}px ${space[6]}px; display:flex; flex-direction:column; align-items:center;
             gap:${space[2]}px; }
  </style>
  <h1>Today's log — ${theme.name} — real timeLabel(), real tokens</h1>
  <div class="grid">${populated}${swiping}${empty}</div>`;
}

mkdirSync(HERE, { recursive: true });
const stage = mkdtempSync(join(tmpdir(), 'vitals-day-log-evidence-'));
for (const name of ['dark', 'light']) {
  const html = join(stage, `day-log-${name}.html`);
  writeFileSync(html, page(themes[name]));
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=1180,540',
    `--screenshot=${join(HERE, `day-log-${name}.png`)}`,
    `file://${html}`,
  ]);
  console.log(`wrote day-log-${name}.png`);
}
