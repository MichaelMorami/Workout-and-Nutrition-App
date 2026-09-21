/**
 * The living guard issue #210 asks for: every key in `tokens.ts`'s `motion.events` is either
 * proven reachable by real production code (`computeMotionEventsReachability`, checked against the
 * actual `ts.Program` for this repo — no grep, no name-based allowlist), or carries a tracked
 * `PENDING_EXCEPTIONS` entry that names the open issue claiming it. Add a key to `motion.events`
 * with neither and this test goes red, naming the key — that is the artifact that keeps #210's
 * finding from rotting the moment someone adds key #22.
 *
 * SCOPE (issue #210, tech-lead re-scope comment): audit and guard only. Nothing here wires a token
 * to a component or deletes one — both of those are follow-up issues, filed from the list this test
 * (and the PR body) makes authoritative. `PENDING_EXCEPTIONS` below is that list for the 13 keys
 * this sweep found genuinely unreached today: `portionModeSwap` → #225 (wiring already decided);
 * the other 12 → #224 (design-lead rules wire / retire / defer per key). Both issues carry an
 * acceptance item to delete their entries here and lower `PENDING_EXCEPTIONS_CEILING` below —
 * closing either issue without doing both leaves this file stale with nothing to catch it.
 *
 * PR #223 REVIEW — `PENDING_EXCEPTIONS` is a ratchet, not an allowlist. A reviewer proved that
 * without a cap, one line with a fabricated `issue` number silences any new dead key — the exact
 * invisibility #210 exists to end. `PENDING_EXCEPTIONS_CEILING` below closes that: the list can
 * only ever shrink un-reviewed. Growing it past the ceiling is still possible (a new token landing
 * ahead of its own consumer is legitimate — see `footerDividerFade`'s history before #220 wired
 * it) — but only by raising the ceiling itself, which is a one-line, plainly-visible diff a
 * reviewer has to see and accept, not a silent append.
 *
 * WHY A PROGRAM OVER THE WHOLE TREE, NOT JUST `app/`+`src/components`: `motion.events` could in
 * principle be consumed from `src/hooks/**` or `src/store/**` too (both ui-engineer's), so the scan
 * covers every production source file under `app/` and `src/`, not just where today's 8 consumers
 * happen to live.
 */
import path from 'path';
import ts from 'typescript';
import { motion } from '../../theme/tokens';
import { computeMotionEventsReachability, type ReachabilityReport } from './test-support/motionEventsReachability';

/**
 * Keys with no reachable consumer today, each pinned to the issue that is allowed to leave it that
 * way. This is NOT a name-based reachability check — `computeMotionEventsReachability` above still
 * computes reachability purely from the AST and the type checker, blind to this list. This list
 * only answers a different question: given that a key is unreached, is that expected right now?
 * An entry with a closed or fabricated `issue`, or a key that has since gained a real consumer, is
 * stale — the tests below catch a closed/fabricated issue only indirectly, through the length cap:
 * see `PENDING_EXCEPTIONS_CEILING`.
 */
const PENDING_EXCEPTIONS: readonly { readonly key: keyof typeof motion.events; readonly issue: number; readonly note: string }[] = [
  { key: 'loggedWashIn', issue: 224, note: 'QuickAddTile logged wash — colour swap only today, no animated transition' },
  { key: 'loggedWashOut', issue: 224, note: 'same — the wash leaving' },
  { key: 'sheetIn', issue: 224, note: "PortionSheet's own doc: uses Modal's built-in slide, not this token, until a bottom-sheet dependency is raised" },
  { key: 'sheetOut', issue: 224, note: 'same' },
  { key: 'searchLift', issue: 224, note: 'no search bar/search sheet screen exists yet' },
  { key: 'portionModeSwap', issue: 225, note: "the original trigger for #210 — PortionSheet's Presets/Exact cross-fade is not wired; wiring already decided" },
  { key: 'sliderSnap', issue: 224, note: "PortionSheet's Exact slider has no detent-snap animation yet" },
  { key: 'rowPress', issue: 224, note: 'no row/chip press-colour transition is wired yet' },
  { key: 'setCollapse', issue: 224, note: 'workout set rows do not exist yet' },
  { key: 'restPulse', issue: 224, note: 'the rest-ring pulse is not wired yet' },
  { key: 'tabFade', issue: 224, note: 'tab cross-fade is not wired (#82 tracks tab carousel, not this token specifically)' },
  { key: 'chartDraw', issue: 224, note: "ProgressArc's own doc: belongs to the Charts tab, which does not exist yet (charts-engineer)" },
  { key: 'rangeMorph', issue: 224, note: 'same — the Charts tab range switch' },
];

/**
 * THE RATCHET. `PENDING_EXCEPTIONS` may only ever shrink without this number moving too — lower it
 * whenever an entry is deleted (a key gets wired or retired), and never raise it in the same PR
 * that also appends an entry: the whole point is that growth needs its own reviewable line. This
 * is what stops the exact hole PR #223's review found: previously, appending one line with any
 * `issue` value at all — including a fabricated one — passed every test. Now the same append also
 * pushes `PENDING_EXCEPTIONS.length` past this constant, and that failure names no key: it just
 * says the ceiling was not raised to match, forcing the append to be argued for as its own change.
 */
const PENDING_EXCEPTIONS_CEILING = 13;

function loadProductionProgram(): { program: ts.Program; sourceFiles: ts.SourceFile[]; root: string } {
  const root = path.resolve(__dirname, '../../..');
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) throw new Error('tsconfig.json not found');
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
  const program = ts.createProgram(parsed.fileNames, parsed.options);

  const sourceFiles = program.getSourceFiles().filter((sf) => {
    if (sf.isDeclarationFile) return false;
    const rel = path.relative(root, sf.fileName);
    if (!rel.startsWith('app/') && !rel.startsWith('src/')) return false;
    // tokens.ts's own file, and design-lead's test of it, assert facts about the token's *values*
    // (durations, easing) — that is not production consumption, and counting it would let a key
    // read as "reachable" purely because its own spec test exercises it.
    if (rel.startsWith('src/theme/')) return false;
    if (rel.includes('.test.')) return false;
    return true;
  });

  return { program, sourceFiles, root };
}

describe('motion.events reachability audit (issue #210)', () => {
  let report: ReachabilityReport;

  beforeAll(() => {
    const { program, sourceFiles } = loadProductionProgram();
    report = computeMotionEventsReachability(program, sourceFiles);
  }, 30000);

  it('finds no dynamic call site the checker could not narrow to a literal key set', () => {
    // A site here means some `motion.events[expr]` in production code has an unnarrowed `expr` —
    // the guard cannot vouch for whatever it reaches, and that is a real defect, not a false
    // positive: the fix is to narrow the call site's type, per #210's own re-scope comment.
    expect(report.unresolvedDynamicSites).toEqual([]);
  });

  it('proves QuickAddTile.tsx:112 reaches both tilePressIn and tilePressOut through its dynamic lookup', () => {
    const site = report.dynamicSites.find((s) => s.file.endsWith('QuickAddTile.tsx'));
    expect(site?.keys.slice().sort()).toEqual(['tilePressIn', 'tilePressOut']);
  });

  it('every key in motion.events is either proven reachable or carries a tracked pending exception', () => {
    const allKeys = Object.keys(motion.events);
    const pendingKeys = new Set(PENDING_EXCEPTIONS.map((e) => e.key));
    const unaccountedFor = allKeys.filter((key) => !report.reachableKeys.has(key) && !pendingKeys.has(key as keyof typeof motion.events));
    expect(unaccountedFor).toEqual([]);
  });

  it('names no pending exception for a key that has since gained a real consumer — stale exceptions rot the audit too', () => {
    const nowReachable = PENDING_EXCEPTIONS.filter((e) => report.reachableKeys.has(e.key)).map((e) => e.key);
    expect(nowReachable).toEqual([]);
  });

  it('names no pending exception for a key that no longer exists in motion.events', () => {
    const allKeys = new Set(Object.keys(motion.events));
    const stale = PENDING_EXCEPTIONS.filter((e) => !allKeys.has(e.key)).map((e) => e.key);
    expect(stale).toEqual([]);
  });

  it('the pending list never grows past its ceiling — a new dead key cannot be silenced by appending (PR #223 review)', () => {
    // This is the ratchet, not the allowlist: appending an entry with any `issue` value at all —
    // including a fabricated one, as the review proved — passes every test above on its own. This
    // one additionally requires `PENDING_EXCEPTIONS_CEILING` to have been raised to match, and that
    // is a second, separately visible line in the same diff a reviewer has to see and accept.
    expect(PENDING_EXCEPTIONS.length).toBeLessThanOrEqual(PENDING_EXCEPTIONS_CEILING);
  });

  it('records the authoritative reachable set — the audit issue #210 asked for (8 of 21 keys, today)', () => {
    // Pinned as data, not just prose, so a change to who is reachable shows up as a diff here too.
    expect([...report.reachableKeys].sort()).toEqual([
      'arcSweep',
      'customReveal',
      'footerDividerFade',
      'repeatBadge',
      'tilePressIn',
      'tilePressOut',
      'toastIn',
      'toastOut',
    ]);
  });
});
