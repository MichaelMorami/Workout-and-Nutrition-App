/**
 * Mechanism tests for `computeMotionEventsReachability` (issue #210).
 *
 * These prove the *engine* is trustworthy, independent of the real codebase: every scenario below
 * is a small synthetic TypeScript program, so a failure here means the analysis itself is wrong,
 * not that some component needs fixing. `motionEventsReachability.audit.test.tsx` runs the same
 * engine over the real `app/`/`src/` tree.
 *
 * Every synthetic file is named to end in `src/theme/tokens.ts` — the engine identifies
 * `motion.events` by resolving the `events` property's *declaration* to that path, not by the text
 * "motion", so declaring the object in a file with that name is what makes the declaration real
 * rather than by giving it a plausible-looking variable name.
 */
import ts from 'typescript';
import { computeMotionEventsReachability } from './test-support/motionEventsReachability';

const SYNTHETIC_TOKENS_FILE = '/virtual/src/theme/tokens.ts';

function createSingleFileProgram(fileName: string, sourceText: string): { program: ts.Program; sourceFile: ts.SourceFile } {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    strict: true,
    skipLibCheck: true,
  };
  const host = ts.createCompilerHost(compilerOptions);
  const readFromDisk = host.getSourceFile.bind(host);
  host.getSourceFile = (requestedFileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (requestedFileName === fileName) {
      return ts.createSourceFile(fileName, sourceText, languageVersion, true, ts.ScriptKind.TS);
    }
    return readFromDisk(requestedFileName, languageVersion, onError, shouldCreateNewSourceFile);
  };
  const program = ts.createProgram([fileName], compilerOptions, host);
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) throw new Error(`failed to create synthetic source file ${fileName}`);
  return { program, sourceFile };
}

describe('computeMotionEventsReachability — the mechanism (issue #210)', () => {
  it('proves a plain literal access reachable', () => {
    const { program, sourceFile } = createSingleFileProgram(
      SYNTHETIC_TOKENS_FILE,
      `export const motion = { events: { customReveal: { duration: 1 } } } as const;
       const x = motion.events.customReveal;`,
    );
    const report = computeMotionEventsReachability(program, [sourceFile]);
    expect(report.reachableKeys.has('customReveal')).toBe(true);
    expect(report.literalSites).toHaveLength(1);
  });

  it('GREEN: a dynamically-reached key counts, when the index narrows to a literal union — QuickAddTile’s own pattern', () => {
    // Mirrors QuickAddTile.tsx:110-112 exactly: `pressed` is a plain boolean, `eventName` is never
    // annotated, and TypeScript still narrows it to `'tilePressIn' | 'tilePressOut'` because it is
    // a `const` assigned from a ternary of two string literals.
    const { program, sourceFile } = createSingleFileProgram(
      SYNTHETIC_TOKENS_FILE,
      `export const motion = { events: { tilePressIn: { duration: 90 }, tilePressOut: { duration: 130 } } } as const;
       declare const pressed: boolean;
       const eventName = pressed ? 'tilePressIn' : 'tilePressOut';
       const event = motion.events[eventName];`,
    );
    const report = computeMotionEventsReachability(program, [sourceFile]);
    expect(report.reachableKeys.has('tilePressIn')).toBe(true);
    expect(report.reachableKeys.has('tilePressOut')).toBe(true);
    expect(report.unresolvedDynamicSites).toHaveLength(0);
    expect(report.dynamicSites).toEqual([
      expect.objectContaining({ keys: ['tilePressIn', 'tilePressOut'], resolved: true }),
    ]);
  });

  it('RED: refuses to vouch for a key reached only through an unnarrowed dynamic index', () => {
    const { program, sourceFile } = createSingleFileProgram(
      SYNTHETIC_TOKENS_FILE,
      `export const motion = { events: { ghost: { duration: 1 } } } as const;
       declare const anyName: string;
       const event = motion.events[anyName];`,
    );
    const report = computeMotionEventsReachability(program, [sourceFile]);
    expect(report.reachableKeys.has('ghost')).toBe(false);
    expect(report.unresolvedDynamicSites).toHaveLength(1);
    expect(report.unresolvedDynamicSites[0]?.indexTypeText).toBe('string');
  });

  it('RED: a key added to `events` with no access anywhere, literal or dynamic, never enters reachableKeys', () => {
    // This is exactly what "a new unreachable key" looks like: `deadKey` sits right next to a key
    // that IS consumed, so the test would go red for the right key, not just any key, if the guard
    // this backs ever regresses to "does the file merely contain the object" instead of "is each
    // key actually accessed".
    const { program, sourceFile } = createSingleFileProgram(
      SYNTHETIC_TOKENS_FILE,
      `export const motion = { events: { deadKey: { duration: 1 }, liveKey: { duration: 2 } } } as const;
       const x = motion.events.liveKey;`,
    );
    const report = computeMotionEventsReachability(program, [sourceFile]);
    expect(report.reachableKeys.has('liveKey')).toBe(true);
    expect(report.reachableKeys.has('deadKey')).toBe(false);
  });

  it('ignores a key name that only appears in a doc comment — the false positive a text grep produces (QuickAddTile.tsx:28)', () => {
    const { program, sourceFile } = createSingleFileProgram(
      SYNTHETIC_TOKENS_FILE,
      `export const motion = { events: { tilePressIn: { duration: 90 } } } as const;
       // driven by motion.events.tilePressIn through react-native-reanimated`,
    );
    const report = computeMotionEventsReachability(program, [sourceFile]);
    expect(report.reachableKeys.has('tilePressIn')).toBe(false);
    expect(report.literalSites).toHaveLength(0);
  });

  it('does not mistake an unrelated object that also happens to be named `events` for motion.events', () => {
    const { program, sourceFile } = createSingleFileProgram(
      SYNTHETIC_TOKENS_FILE,
      `export const motion = { events: { real: { duration: 1 } } } as const;
       const notMotion = { events: { real: { duration: 1 }, decoy: { duration: 2 } } };
       const x = notMotion.events.decoy;`,
    );
    const report = computeMotionEventsReachability(program, [sourceFile]);
    expect(report.reachableKeys.has('decoy')).toBe(false);
  });

  it('resolves through a renamed import-style alias — symbol identity, not the text "motion"', () => {
    // No real import is needed to prove this: aliasing happens at the declaration site here, but
    // the check (`resolvesToMotionEvents`) only ever looks at the `events` symbol's declaration
    // file, never at the identifier text preceding it, so a real `import { motion as m }` resolves
    // the same way.
    const { program, sourceFile } = createSingleFileProgram(
      SYNTHETIC_TOKENS_FILE,
      `export const motion = { events: { aliased: { duration: 1 } } } as const;
       const m = motion;
       const x = m.events.aliased;`,
    );
    const report = computeMotionEventsReachability(program, [sourceFile]);
    expect(report.reachableKeys.has('aliased')).toBe(true);
  });

  it('KNOWN LIMITATION (PR #223 review): a destructured `events` object is NOT recognised — reads as dead, not unresolved', () => {
    // `resolvesToMotionEvents` only matches `X.events.someKey` / `X.events[expr]` shapes, where
    // the `.events` access is the immediate parent of the key access. `const { events } = motion`
    // breaks that shape entirely, so `events.destructured` below produces neither a literal site
    // nor a dynamic one — the key simply never appears anywhere in the report, indistinguishable
    // from a key nobody wrote any code for at all.
    //
    // This is pinned deliberately, not fixed: the failure direction is safe (a real consumer that
    // destructures makes its key read as *dead*, and the real audit goes red loudly — the wrong
    // grep-shaped fix for that red is appending to `PENDING_EXCEPTIONS`, not widening this
    // matcher, which the module doc now says explicitly) rather than silently marking something
    // reachable that is not. If this test ever fails, the matcher has started recognising
    // destructures — update this test and the module doc's "known limitations" section together.
    const { program, sourceFile } = createSingleFileProgram(
      SYNTHETIC_TOKENS_FILE,
      `export const motion = { events: { destructured: { duration: 1 } } } as const;
       const { events } = motion;
       const x = events.destructured;`,
    );
    const report = computeMotionEventsReachability(program, [sourceFile]);
    expect(report.reachableKeys.has('destructured')).toBe(false);
    expect(report.unresolvedDynamicSites).toHaveLength(0); // not even flagged as unresolved — invisible, not loud
  });
});
