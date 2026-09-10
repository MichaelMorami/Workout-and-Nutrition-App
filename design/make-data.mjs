// Deterministic pseudo-random
let seed = 20260910;
function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
function n() { return (rnd() + rnd() + rnd() - 1.5) * 1.15; } // ~normal

const N = 90;   // displayed days
const WARM = 14; // extra leading days so the rolling averages are fully seeded
// Phase A (0..34): maintenance ~2460 kcal, weight flat ~86.8
// Phase B (35..89): deficit ~2140 kcal, weight falls ~0.42 kg/wk
const kcal = [], prot = [], wTrue = [], weight = [];
for (let i = -WARM; i < N; i++) {
  const dow = (i + 3) % 7; // 5,6 = weekend
  const base = i < 35 ? 2460 : 2140;
  const weekend = (dow === 5 || dow === 6) ? 330 : -60;
  kcal.push(Math.round(base + weekend + n() * 210));
  prot.push(Math.round((i < 35 ? 152 : 172) + (dow === 6 ? -22 : 4) + n() * 16));
  const t = i < 35 ? 86.85 - i * 0.004 : 86.71 - (i - 35) * 0.0605;
  wTrue.push(t);
  weight.push(+(t + n() * 0.52).toFixed(1));
}
const cut = (a) => a.slice(WARM);
function ema(arr, span) {
  const k = 2 / (span + 1); let acc = arr[0]; return arr.map(v => (acc = v * k + acc * (1 - k)));
}
function roll(arr, w) {
  return arr.map((_, i) => { const s = Math.max(0, i - w + 1); const sl = arr.slice(s, i + 1); return sl.reduce((a, b) => a + b, 0) / sl.length; });
}
const wTrend = cut(ema(weight, 13));
const kAvg = cut(roll(kcal, 7));
const pAvg = cut(roll(prot, 7));

const kcalD = cut(kcal), protD = cut(prot), weightD = cut(weight);
const r2 = v => Math.round(v * 10) / 10;
function mk(w, h, xs, ys, ydom) {
  const [y0, y1] = ydom;
  const X = i => r2(i / (xs - 1) * w);
  const Y = v => r2(h - (v - y0) / (y1 - y0) * h);
  return { X, Y, path: (a, from = 0) => 'M' + a.map((v, i) => (i === 0 ? '' : 'L') + X(i + from) + ' ' + Y(v)).join(' ') };
}
const out = {};

// --- Chart 1: weight 90d, plot 326 x 128
{
  const w = 326, h = 128, y0 = 82.3, y1 = 87.9;
  const m = mk(w, h, N, null, [y0, y1]);
  out.weight = {
    w, h, y0, y1,
    dots: weightD.map((v, i) => [m.X(i), m.Y(v)]),
    trend: m.path(wTrend),
    ticks: [87, 86, 85, 84, 83].map(v => [v, m.Y(v)]),
    last: r2(wTrend[N - 1]), first: r2(wTrend[0]),
    lastPt: [m.X(N - 1), m.Y(wTrend[N - 1])],
    rawLast: weightD[N - 1], rawPrev: weightD[N - 2],
  };
}
// --- Chart 2/3: last 30 days — daily dots + 7-day average + target line, plot 326 x 96
// These were bars. A bar chart has to start at zero, and against a 2,400 kcal target a
// zero-based 96 px axis renders a 200 kcal miss as about 8 px of nothing. Daily values
// are noise anyway; the rolling average is the signal. So they now use the same grammar
// as the weight chart — quiet dots, loud line, and a target line you can actually miss.
function series(arr, avgArr, y0, y1, target) {
  const M = 30, w = 326, h = 96;
  const sl = arr.slice(-M), av = avgArr.slice(-M);
  const X = i => r2(i / (M - 1) * w);
  const Y = v => r2(h - (Math.min(y1, Math.max(y0, v)) - y0) / (y1 - y0) * h);
  return {
    w, h, y0, y1, target, targetY: Y(target),
    dots: sl.map((v, i) => [X(i), Y(v)]),
    avg: 'M' + av.map((v, i) => (i ? 'L' : '') + X(i) + ' ' + Y(v)).join(' '),
    avgLast: Math.round(av[M - 1]), todayVal: sl[M - 1],
    avgLastPt: [X(M - 1), Y(av[M - 1])],
    ticks: null,
  };
}
out.kcalDaily = series(kcalD, kAvg, 1600, 3250, 2400);
out.kcalDaily.ticks = [3000, 2600, 2200, 1800].map(v => [v.toLocaleString('en-GB'), r2(96 - (v - 1600) / 1650 * 96)]);
out.protDaily = series(protD, pAvg, 95, 230, 180);
out.protDaily.ticks = [220, 180, 140, 100].map(v => [v, r2(96 - (v - 95) / 135 * 96)]);

// --- Chart 4: overlay, plot 326 x 138
{
  const w = 326, h = 138;
  const wy0 = 83.4, wy1 = 87.4, ky0 = 1700, ky1 = 2800;
  const WY = v => r2(h - (v - wy0) / (wy1 - wy0) * h);
  const KY = v => r2(h - (v - ky0) / (ky1 - ky0) * h);
  const X = i => r2(i / (N - 1) * w);
  out.overlay = {
    w, h, wy0, wy1, ky0, ky1,
    kArea: 'M0 ' + h + ' ' + kAvg.map((v, i) => 'L' + X(i) + ' ' + KY(v)).join(' ') + ' L' + w + ' ' + h + ' Z',
    kLine: 'M' + kAvg.map((v, i) => (i ? 'L' : '') + X(i) + ' ' + KY(v)).join(' '),
    wLine: 'M' + wTrend.map((v, i) => (i ? 'L' : '') + X(i) + ' ' + WY(v)).join(' '),
    splitX: X(35),
    wTicks: [87, 86, 85, 84].map(v => [v, WY(v)]),
    kTicks: [2600, 2200, 1800].map(v => [v, KY(v)]),
    phaseA: { kcal: Math.round(kAvg.slice(10, 35).reduce((a, b) => a + b) / 25), rate: r2((wTrend[34] - wTrend[10]) / 24 * 7 * 100) / 100 },
    phaseB: { kcal: Math.round(kAvg.slice(45, N).reduce((a, b) => a + b) / (N - 45)), rate: r2((wTrend[N - 1] - wTrend[45]) / (N - 46) * 7 * 100) / 100 },
  };
}
// --- Chart 5: strength e1RM, bench, 22 sessions over 6 months, plot 326 x 96
{
  const S = 22, w = 326, h = 96, y0 = 72, y1 = 108;
  const pts = [];
  let v = 78;
  for (let i = 0; i < S; i++) { v += 1.35 + n() * 1.1; if (i === 9) v -= 3.2; pts.push(+v.toFixed(1)); }
  const X = i => r2(i / (S - 1) * w);
  const Y = x => r2(h - (x - y0) / (y1 - y0) * h);
  out.strength = {
    w, h, y0, y1, S,
    line: 'M' + pts.map((p, i) => (i ? 'L' : '') + X(i) + ' ' + Y(p)).join(' '),
    dots: pts.map((p, i) => [X(i), Y(p)]),
    ticks: [105, 95, 85].map(x => [x, Y(x)]),
    first: pts[0], last: pts[S - 1],
  };
}
// --- Today sparkline (weight, 30d) 96 x 28
{
  const w = 96, h = 28, sl = wTrend.slice(N - 30);
  const lo = Math.min(...sl) - 0.1, hi = Math.max(...sl) + 0.1;
  out.spark = 'M' + sl.map((v, i) => (i ? 'L' : '') + r2(i / 29 * w) + ' ' + r2(h - (v - lo) / (hi - lo) * h)).join(' ');
}
out.today = { kcal: kcalD[N - 1], prot: protD[N - 1], weight: weightD[N - 1], kAvg: Math.round(kAvg[N - 1]), pAvg: Math.round(pAvg[N - 1]) };
console.log(JSON.stringify(out));
