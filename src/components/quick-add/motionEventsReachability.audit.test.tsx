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
 * this sweep found genuinely unreached today; #210 itself is the tracking issue for all of them
 * until tech-lead splits each into its own follow-up (wire or retire) — update the `issue` field
 * then, or delete the entry once the key is wired or removed.
 *
 * WHY A PROGRAM OVER THE WHOLE TREE, NOT JUST `app/`+`src/components`: `motion.events` could in
 * principle be consumed from `src/hooks/**` or `src/store/**` too (both ui-engineer's), so the scan
 * covers every production source file under `app/` and `src/`, not just where today's 8 consumers
 * happen to live.
 */
import path from 'path';
import ts from 'typescript';
import { motion } from '../../theme/tokens';
import { computeMotionEventsReachability, type ReachabilityReport } from './motionEventsReachability';

/**
 * Keys with no reachable consumer today, each pinned to the issue that is allowed to leave it that
 * way. This is NOT a name-based reachability check — `computeMotionEventsReachability` above still
 * computes reachability purely from the AST and the type checker, blind to this list. This list
 * only answers a different question: given that a key is unreached, is that expected right now?
 * An entry here with no real open issue, or a key that has since gained a real consumer, is stale —
 * `scripts/check.sh` does not catch that by itself; a human closes the loop when filing or
 * resolving the follow-up.
 */
const PENDING_EXCEPTIONS: readonly { readonly key: keyof typeof motion.events; readonly issue: number; readonly note: string }[] = [
  { key: 'loggedWashIn', issue: 210, note: 'QuickAddTile logged wash — colour swap only today, no animated transition' },
  { key: 'loggedWashOut', issue: 210, note: 'same — the wash leaving' },
  { key: 'sheetIn', issue: 210, note: "PortionSheet's own doc: uses Modal's built-in slide, not this token, until a bottom-sheet dependency is raised" },
  { key: 'sheetOut', issue: 210, note: 'same' },
  { key: 'searchLift', issue: 210, note: 'no search bar/search sheet screen exists yet' },
  { key: 'portionModeSwap', issue: 210, note: "the original trigger for #210 — PortionSheet's Presets/Exact cross-fade is not wired" },
  { key: 'sliderSnap', issue: 210, note: "PortionSheet's Exact slider has no detent-snap animation yet" },
  { key: 'rowPress', issue: 210, note: 'no row/chip press-colour transition is wired yet' },
  { key: 'setCollapse', issue: 210, note: 'workout set rows do not exist yet' },
  { key: 'restPulse', issue: 210, note: 'the rest-ring pulse is not wired yet' },
  { key: 'tabFade', issue: 210, note: 'tab cross-fade is not wired (#82 tracks tab carousel, not this token specifically)' },
  { key: 'chartDraw', issue: 210, note: "ProgressArc's own doc: belongs to the Charts tab, which does not exist yet (charts-engineer)" },
  { key: 'rangeMorph', issue: 210, note: 'same — the Charts tab range switch' },
];

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
