/**
 * Type-driven reachability for `motion.events` (issue #210).
 *
 * WHY THIS EXISTS. `QuickAddTile` (this directory) is the one place in the app that looks a motion
 * event up dynamically — `motion.events[eventName]` at `QuickAddTile.tsx:112` — so a plain
 * `grep 'motion\.events\.<key>'` cannot prove a key is dead: it never sees that call site at all,
 * and it is fooled the other way too (a key's name can appear in a doc *comment* — see
 * `QuickAddTile.tsx:28` mentioning `tilePressIn`/`tilePressOut` — with no real access nearby, and a
 * key genuinely consumed only through a `Record` lookup elsewhere reads as unconsumed). A
 * name-based allowlist has the same blind spot with an extra failure mode: it silently accepts any
 * key someone remembers to type into it, which is the exact invisibility issue #210 was filed to
 * fix.
 *
 * THE MECHANISM. This module walks the real TypeScript AST and asks the type checker, not a
 * string, two questions:
 *
 *   1. Is this `X.events` really *the* `motion.events` — i.e. does the `events` property resolve
 *      (via `checker.getSymbolAtLocation`) to the exact same declaration as the `events` property
 *      of `tokens.ts`'s `motion` export (found once, by reading the module's exports, in
 *      `findMotionEventsSymbol`)? Comparing the resolved declaration node, not just "declared
 *      somewhere in tokens.ts", is what stops a second, unrelated `events`-shaped object — even one
 *      declared in the same file — from being mistaken for it. This survives renamed imports
 *      (`import { motion as m }`) and shadowing that a text match would not, and it ignores
 *      comments outright because comments are not AST nodes.
 *   2. For `X.events.someKey` the key is just `someKey` — a static, unambiguous literal.
 *      For `X.events[someExpr]`, the reachable keys are the string-literal members of
 *      `checker.getTypeAtLocation(someExpr)`. If TypeScript has narrowed `someExpr` to a literal
 *      union (as it does for `QuickAddTile`'s `const eventName = pressed ? 'tilePressIn' :
 *      'tilePressOut'`), every member is a proven-reachable key. If it has not narrowed — the
 *      index is `string`, or any other non-literal type — the site is `unresolved`: the guard
 *      cannot vouch for it, and that is a finding in its own right (the call site needs narrowing
 *      to a `MotionEventName`-shaped union before it can be trusted), not a silent pass.
 *
 * This is why `computeMotionEventsReachability` takes a `ts.Program` rather than a set of globs: it
 * needs real type information, which only the checker has.
 */
import ts from 'typescript';

const TOKENS_FILE_SUFFIX = 'src/theme/tokens.ts';

/** One `X.events.someKey` access, proven by the checker to reach `tokens.ts`'s `motion.events`. */
export type LiteralSite = {
  readonly file: string;
  readonly line: number;
  readonly key: string;
};

/** One `X.events[someExpr]` access, proven by the checker to reach `tokens.ts`'s `motion.events`. */
export type DynamicSite = {
  readonly file: string;
  readonly line: number;
  /** The index expression's resolved literal keys — empty when `resolved` is false. */
  readonly keys: readonly string[];
  /** `false` means the index type did not narrow to a string-literal union: the checker cannot
   * name which keys this site reaches, so none of them count as proven-reachable. */
  readonly resolved: boolean;
  /** What the checker actually saw, e.g. `"tilePressIn" | "tilePressOut"` or `string` — for the
   * failure message when `resolved` is false. */
  readonly indexTypeText: string;
};

export type ReachabilityReport = {
  /** Every key proven reachable, by a literal access or a resolved dynamic one. */
  readonly reachableKeys: ReadonlySet<string>;
  readonly literalSites: readonly LiteralSite[];
  readonly dynamicSites: readonly DynamicSite[];
  /** Dynamic sites the checker could not narrow — these need fixing, not allowlisting. */
  readonly unresolvedDynamicSites: readonly DynamicSite[];
};

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/**
 * The canonical `events` property symbol on `tokens.ts`'s `motion` export — resolved once, by
 * walking the module's exports, never by matching the text "motion". Every candidate access site
 * is compared against this exact symbol (by its declaration node, which is stable across however
 * the checker reaches it — through an alias, a destructure, or the plain identifier), so a second,
 * unrelated object that also happens to have an `events` property — even one declared in the same
 * file — is not mistaken for it. Returns `undefined` if `tokens.ts` is not part of `program`, or
 * does not export a `motion` value shaped the way this module expects.
 */
function findMotionEventsSymbol(program: ts.Program, checker: ts.TypeChecker): ts.Symbol | undefined {
  const tokensFile = program.getSourceFiles().find((sf) => !sf.isDeclarationFile && sf.fileName.endsWith(TOKENS_FILE_SUFFIX));
  if (!tokensFile) return undefined;
  const moduleSymbol = checker.getSymbolAtLocation(tokensFile);
  if (!moduleSymbol) return undefined;
  const motionExport = checker.getExportsOfModule(moduleSymbol).find((s) => s.name === 'motion');
  if (!motionExport) return undefined;
  const motionDeclaration = motionExport.valueDeclaration ?? motionExport.declarations?.[0];
  if (!motionDeclaration) return undefined;
  const motionType = checker.getTypeOfSymbolAtLocation(motionExport, motionDeclaration);
  return motionType.getProperty('events');
}

/** True when `eventsProperty` (the `events` in `X.events`) resolves — via the checker, not the
 * text "motion" — to the exact `events` property declared on `tokens.ts`'s `motion` export. */
function resolvesToMotionEvents(checker: ts.TypeChecker, motionEventsSymbol: ts.Symbol | undefined, eventsProperty: ts.MemberName): boolean {
  if (!motionEventsSymbol || eventsProperty.text !== 'events') return false;
  const symbol = checker.getSymbolAtLocation(eventsProperty);
  const declaration = symbol?.declarations?.[0];
  const targetDeclaration = motionEventsSymbol.declarations?.[0];
  return declaration !== undefined && declaration === targetDeclaration;
}

/** The index type's string-literal members, or `[]` if any member is not a literal (the type has
 * not narrowed and the site cannot be trusted). */
function literalKeysOf(type: ts.Type): string[] {
  const members = type.isUnion() ? type.types : [type];
  const keys: string[] = [];
  for (const member of members) {
    if (!member.isStringLiteral()) return [];
    keys.push(member.value);
  }
  return keys;
}

/**
 * Walks `sourceFiles` for every access into `motion.events` — literal or dynamic — and returns the
 * proven-reachable key set plus every site the audit found, so a caller can report *how* each key
 * is reached, not just that it is.
 */
export function computeMotionEventsReachability(program: ts.Program, sourceFiles: readonly ts.SourceFile[]): ReachabilityReport {
  const checker = program.getTypeChecker();
  const motionEventsSymbol = findMotionEventsSymbol(program, checker);
  const reachableKeys = new Set<string>();
  const literalSites: LiteralSite[] = [];
  const dynamicSites: DynamicSite[] = [];
  const unresolvedDynamicSites: DynamicSite[] = [];

  for (const sourceFile of sourceFiles) {
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        // node is `X.events.someKey`; node.expression is `X.events`.
        if (resolvesToMotionEvents(checker, motionEventsSymbol, node.expression.name)) {
          const key = node.name.text;
          reachableKeys.add(key);
          literalSites.push({ file: sourceFile.fileName, line: lineOf(sourceFile, node), key });
        }
      } else if (ts.isElementAccessExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        // node is `X.events[someExpr]`; node.expression is `X.events`.
        if (resolvesToMotionEvents(checker, motionEventsSymbol, node.expression.name)) {
          const indexType = checker.getTypeAtLocation(node.argumentExpression);
          const keys = literalKeysOf(indexType);
          const site: DynamicSite = {
            file: sourceFile.fileName,
            line: lineOf(sourceFile, node),
            keys,
            resolved: keys.length > 0,
            indexTypeText: checker.typeToString(indexType),
          };
          if (site.resolved) {
            keys.forEach((key) => reachableKeys.add(key));
            dynamicSites.push(site);
          } else {
            unresolvedDynamicSites.push(site);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return { reachableKeys, literalSites, dynamicSites, unresolvedDynamicSites };
}
