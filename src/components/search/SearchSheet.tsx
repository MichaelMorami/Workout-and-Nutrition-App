/**
 * `<SearchSheet>` — issue #69 (`docs/decisions.md` §"One search bar, under the grid"): the only way
 * into the food library beyond the six quick-add tiles. Owns the full-width "Search foods" bar and
 * the sheet it opens — a section header, six ranked tiles is `<QuickAddGrid>`'s job; finding the
 * rest of the library is this one's.
 *
 * ROWS BEHAVE EXACTLY LIKE TILES (issue #70). A tap goes through the same "one place decides"
 * bookkeeping `QuickAddGrid` uses (`logTracker`'s module note — it is shared across tile and row on
 * purpose): a fresh `logFood`/`logMeal` if this candidate was not logged inside
 * `interaction.repeatWindowMs`, `addPortion` on the same rows if it was. Either way: a haptic, the
 * undo toast (`useUndoToastStore`, generic across every write this app makes), a brief "Logged" beat
 * on the row itself (`resultRow.bgLogged`, held `interaction.rowLoggedHoldMs`), then the sheet
 * closes — no confirmation dialog, no save button, no navigation. A long-press dismisses any toast
 * still up and opens `<PortionSheet>` (#21) instead of logging; its own Log always writes fresh (a
 * chosen serving multiple, never an addition) and closes both sheets. A failed write is swallowed,
 * exactly `QuickAddGrid`'s own doctrine: no dialog, and the sheet stays open, as if the tap simply
 * did not count. What a tap on the trailing *Create* row does (open the add-food form, pre-filled,
 * save-and-log) is #71, exposed here only as a plain callback (`onCreate`) — this component never
 * touches `createFoodAndLog` itself. The pinned blank-query row (#97, below) funnels through the
 * exact same `onCreate`/`renderCreate` pair, just with an empty string.
 *
 * RECENT NEVER EXCLUDES THE GRID (issue #95's ruling — reversing #69's original design). Recent is
 * every food and meal logged in the last `interaction.recentDays` days, newest last-log first,
 * including the six on `<QuickAddGrid>`. `recentFoods` is read fresh every time the sheet opens
 * (`openSheet`, not a mount-time `useState`), so a food logged a moment ago — on the grid or off
 * it — appears at the top the next time this sheet is opened, no app reload required.
 *
 * THE BLANK-QUERY LIST IS NEVER BLANK WHILE ANY FOOD EXISTS (issue #96's ruling). If `recentFoods`
 * comes back empty — nothing logged in `interaction.recentDays` days, which a library with real but
 * stale items hits often — the list falls back to `libraryByUsage`: the whole library, most used
 * first, under a "Your foods" section label instead of "Recent" (`renderRow`/`header` share every
 * other row-rendering, tap and log behaviour; the two lists only ever differ in which query filled
 * them and how the header reads). Recent wins whenever it has anything; the fallback is a *sibling*
 * of "no results", never drawn alongside Recent. Both `recentFoods` and (when needed) `libraryByUsage`
 * are read together in `openSheet`, so this never adds a second render pass.
 *
 * `libraryEmpty` — WHETHER THE WHOLE LIBRARY HAS ANYTHING AT ALL, drives the search bar's "day one"
 * emphasis (`searchBar.emphasisIcon`/`emphasisLabelText`, `borderEmphasis`) in lockstep with the grid
 * teaching the same first-time user, and the "no library yet" empty state below (reserved for a
 * library with nothing in it — a stale-but-non-empty library falls back per the ruling above, it
 * never sees this message). It seeds from a mount-time `quickAddCandidates` read (the bar itself is
 * drawn before the sheet is ever opened, so something has to answer before `openSheet` has run even
 * once — exactly `<QuickAddGrid>`'s own "ranked once per visit" read, same call, same cost), but is
 * re-evaluated on every `openSheet` after that (issue #96's sub-case, found reviewing #117: Today
 * never unmounts, so a mount-time-only read went stale the moment a day-one user logged their very
 * first food, hiding it behind "No foods yet" until a reload) — from `recent`/`libraryFallback`
 * themselves (`recent.length === 0 && libraryFallback.length === 0`, since a library the fallback
 * ruling above already proves non-empty is definitionally not `libraryEmpty`), never a further
 * `quickAddCandidates` call, so this adds no read and never disturbs its call count elsewhere
 * (issue #103's re-rank cadence, which counts on `quickAddCandidates` running only at the points it
 * names). The bar's own emphasis styling, drawn before the sheet is ever opened, still reflects
 * whatever the last open (or the initial mount) last read — exactly the same lag `<QuickAddGrid>`'s
 * own ranking accepts between visits.
 *
 * THE LAST ROW WHILE TYPING IS ALWAYS CREATE. Per the decisions doc, `Create "‹query›"` trails every
 * non-empty query — including when there are results, not only when there are none.
 *
 * THE FIRST ROW ON A BLANK QUERY IS ALWAYS CREATE (issue #97 — reversing #69/#70's original
 * ruling that a blank query "has nothing to create from"). A pinned "+ Create new food" row sits
 * above Recent, the day-one library fallback and the "no library yet" empty state alike — on day
 * one it is the obvious next step, and there is no reason to make a user with an empty library type
 * a throwaway query just to reach Create. It renders as `<CreateNewFoodRow>`, not `<CreateRow>`
 * (no query to quote), but taps the same `handleCreatePress` with `trimmedQuery` already `''`, so it
 * opens `renderCreate`/calls `onCreate` exactly like the trailing row does — `CreateFoodSheet` (#71)
 * already treats any non-null query, including `''`, as "open with a blank name".
 *
 * NO NEW NATIVE DEPENDENCY: `Modal`'s built-in `animationType="slide"` presents the sheet, the same
 * choice `<PortionSheet>` made and for the same reason.
 *
 * ONE NATIVE MODAL, AND FOCUS ONLY ONCE IT IS UP (issue #79 — the iPhone freeze). iOS presents a
 * `Modal` from the nearest view controller, and a controller that is already presenting silently
 * refuses a second one — so `<PortionSheet>` and the create form (`renderCreate`) are drawn *inside*
 * this sheet's `Modal` with `presentation="overlay"`, never beside it. Android's back button closes
 * the top overlay first. The field is focused from `onShow` (the presentation's completion) rather
 * than `autoFocus`, so the keyboard never asks for first responder mid-transition. A host that puts
 * this component inside a `ScrollView` must give that `ScrollView` `keyboardShouldPersistTaps=
 * "handled"`: the responder system walks React ancestry across the `Modal`, and the default
 * (`'never'`) spends the first tap on every row, Cancel and Create dismissing the keyboard.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import {
  addPortion,
  libraryByUsage,
  logFood,
  logMeal,
  quickAddCandidates,
  recentFoods,
  searchFoods,
  VitalsDbError,
  type Candidate,
  type LogReceipt,
  type VitalsDb,
} from '../../db';
import { formatGrams } from '../format/food';
import { deviceWhen } from '../../hooks/deviceWhen';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { forgetLog, logTrackerKey, recentLog, trackLog } from '../../store/logTracker';
import { useUndoToastStore, type LogDelta } from '../../store/undoToast';
import { haptics, interaction, radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { PortionSheet } from '../quick-add/PortionSheet';

/** The layered-plates glyph a saved meal carries — same choice `QuickAddTile` made: plain Unicode,
 * no icon library installed yet (`CLAUDE.md` — raise a native dependency before adding one). */
const MEAL_GLYPH = '▤';
/** A plain-Unicode magnifier and clear glyph, for the same reason. */
const SEARCH_GLYPH = '⌕';
const CLEAR_GLYPH = '×';

/** What `SearchSheetProps['renderCreate']` receives. */
export type CreateSlotArgs = { query: string; onLogged: (receipt: LogReceipt) => void; onClose: () => void };

export type SearchSheetProps = {
  readonly db: VitalsDb;
  /** Called after a *fresh* log lands — a row's first tap, or the portion sheet's own Log — with
   * the receipt (`kcal`/`protein` logged). Mirrors `QuickAddGridProps['onLogged']` exactly, so the
   * Today screen can feed both into the same running-totals reducer. Never called for a write that
   * failed, and never called for a repeat tap's `addPortion` (see `onPortionAdded`). */
  readonly onLogged?: (receipt: LogReceipt) => void;
  /** Called after a repeat tap (within `interaction.repeatWindowMs` of the candidate's last log,
   * tile or row alike) adds a portion instead of a fresh row. Mirrors
   * `QuickAddGridProps['onPortionAdded']`. */
  readonly onPortionAdded?: (delta: LogDelta) => void;
  /** The trailing Create row was tapped, with the trimmed query that seeded it. */
  readonly onCreate?: (query: string) => void;
  /**
   * Draws the add-food form for a Create tap, inside this sheet's own `Modal` (issue #79 — iOS
   * cannot present a second `Modal` beside it). Render it with `presentation="overlay"`. `onLogged`
   * forwards the receipt to this sheet's own `onLogged` and closes the form and the sheet (back to
   * Today); `onClose` closes the form only, leaving the search as it was. This component still never
   * touches `createFoodAndLog` — whatever is rendered here does.
   */
  readonly renderCreate?: (create: CreateSlotArgs) => ReactNode;
  /** Formatting locale, forwarded to every figure. Defaults to the device's. */
  readonly locale?: string;
  readonly theme: Theme;
  readonly testID?: string;
};

type Row = { readonly key: string; readonly kind: 'candidate'; readonly candidate: Candidate } | { readonly key: 'create'; readonly kind: 'create' };

function textStyle(token: TypeStyle, color: string): TextStyle {
  return {
    fontFamily: token.fontFamily,
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    textTransform: token.textTransform,
    color,
  };
}

/** "Fage · 1 pot" / "2 eggs" for a food, "3 items" for a meal — the line under a row's name. */
function servingSummary(candidate: Candidate): string {
  if (candidate.kind === 'meal') return `${candidate.itemCount} item${candidate.itemCount === 1 ? '' : 's'}`;
  return candidate.brand ? `${candidate.brand} · ${candidate.servingLabel}` : candidate.servingLabel;
}

function rowAccessibilityLabel(candidate: Candidate, kcal: string, protein: string): string {
  const kind = candidate.kind === 'meal' ? 'meal' : 'food';
  return `${candidate.name}, ${kind}, ${kcal} kilocalories, ${protein} grams protein`;
}

function ResultRow({
  candidate,
  theme,
  locale,
  logged,
  onPress,
  onLongPress,
  testID,
}: {
  candidate: Candidate;
  theme: Theme;
  locale?: string;
  /** This row's own brief "Logged" beat (`resultRow.bgLogged`, held `interaction.rowLoggedHoldMs`)
   * — the tile's `logged` state, mirrored here (`QuickAddTile`'s module note). */
  logged: boolean;
  onPress: () => void;
  onLongPress: () => void;
  testID: string;
}) {
  const { resultRow } = theme.color;
  const kcalText = Math.round(candidate.kcal).toLocaleString(locale);
  const proteinText = Math.round(candidate.protein).toLocaleString(locale);
  const isMeal = candidate.kind === 'meal';
  // Guards the same touch from firing both `onLongPress` and `onPress` when the finger lifts —
  // `QuickAddTile`'s own guard, same reasoning: opening the portion sheet must never also log.
  const longPressed = useRef(false);

  const handlePress = (): void => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    onPress();
  };

  const handleLongPress = (): void => {
    longPressed.current = true;
    onLongPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={interaction.longPressMs}
      accessibilityRole="button"
      accessibilityLabel={rowAccessibilityLabel(candidate, kcalText, proteinText)}
      style={[
        styles.row,
        {
          minHeight: size.resultRow.heightHit,
          backgroundColor: logged ? resultRow.bgLogged : resultRow.bg,
          borderBottomColor: resultRow.divider,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={styles.rowText}>
        <View style={styles.nameLine}>
          {isMeal ? (
            <Text testID={`${testID}-meal-icon`} style={{ fontSize: size.icon.sm, color: resultRow.mealIcon, marginRight: space[1] }}>
              {MEAL_GLYPH}
            </Text>
          ) : null}
          <Text testID={`${testID}-name`} numberOfLines={1} style={[textStyle(type.body, resultRow.nameText), styles.name]}>
            {candidate.name}
          </Text>
          {isMeal ? (
            <View testID={`${testID}-meal-tag`} style={[styles.mealTag, { backgroundColor: resultRow.mealTagBg, borderRadius: radius.xs }]}>
              <Text style={textStyle(type.micro, resultRow.mealTagText)}>Meal</Text>
            </View>
          ) : null}
        </View>
        <Text testID={`${testID}-serving`} style={textStyle(type.caption, resultRow.servingText)}>
          {servingSummary(candidate)}
        </Text>
      </View>
      {logged ? (
        <View testID={`${testID}-logged`} style={styles.loggedBeat}>
          <Text style={{ fontSize: size.icon.sm, color: resultRow.loggedIcon, marginRight: space[1] }}>{'✓'}</Text>
          <Text style={textStyle(type.numericSm, resultRow.loggedText)}>Logged</Text>
        </View>
      ) : (
        <View style={styles.rowFigures}>
          <Text testID={`${testID}-kcal`} style={textStyle(type.numericSm, resultRow.kcalText)}>
            {`${kcalText} kcal`}
          </Text>
          <Text testID={`${testID}-protein`} style={textStyle(type.numericSm, resultRow.proteinText)}>
            {formatGrams(candidate.protein, locale)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function CreateRow({ query, theme, onPress, testID }: { query: string; theme: Theme; onPress: () => void; testID: string }) {
  const { resultRow } = theme.color;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Create "${query}"`}
      style={[
        styles.row,
        { minHeight: size.resultRow.heightHit, backgroundColor: resultRow.bg, borderBottomColor: resultRow.divider, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <View style={[styles.createDisc, { width: size.resultRow.createDisc, height: size.resultRow.createDisc, borderRadius: size.resultRow.createDisc / 2, backgroundColor: resultRow.createIconBg }]}>
        <Text style={{ fontSize: size.icon.lg, color: resultRow.createIcon }}>+</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={textStyle(type.body, resultRow.createText)}>{`Create "${query}"`}</Text>
        <Text style={textStyle(type.caption, resultRow.createMetaText)}>New food · logs one serving</Text>
      </View>
    </Pressable>
  );
}

/** The pinned "+ Create new food" row (issue #97) — the blank-query counterpart to `<CreateRow>`.
 * No query to quote, so its own copy and a11y label say so plainly; same `resultRow.create*`
 * tokens, same tap target, same trailing "logs one serving" promise once the form is saved. */
function CreateNewFoodRow({ theme, onPress, testID }: { theme: Theme; onPress: () => void; testID: string }) {
  const { resultRow } = theme.color;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Create new food"
      style={[
        styles.row,
        { minHeight: size.resultRow.heightHit, backgroundColor: resultRow.bg, borderBottomColor: resultRow.divider, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <View style={[styles.createDisc, { width: size.resultRow.createDisc, height: size.resultRow.createDisc, borderRadius: size.resultRow.createDisc / 2, backgroundColor: resultRow.createIconBg }]}>
        <Text style={{ fontSize: size.icon.lg, color: resultRow.createIcon }}>+</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={textStyle(type.body, resultRow.createText)}>Create new food</Text>
        <Text style={textStyle(type.caption, resultRow.createMetaText)}>New food · logs one serving</Text>
      </View>
    </Pressable>
  );
}

/** Sums `kcal`/`protein` off any row shape that carries them — mirrors `QuickAddGrid`'s own
 * `totalsOf`, the same helper both write paths need. */
function totalsOf(rows: readonly { readonly kcal: number; readonly protein: number }[]): { kcal: number; protein: number } {
  return rows.reduce((sum, row) => ({ kcal: sum.kcal + row.kcal, protein: sum.protein + row.protein }), { kcal: 0, protein: 0 });
}

/** "Skyr Pot" once, "Skyr Pot ×2" from the second portion on — mirrors `QuickAddGrid`'s own
 * `toastTitle`, so a row's undo toast reads exactly like a tile's. */
function toastTitle(name: string, portions: number): string {
  return portions > 1 ? `${name} ×${portions}` : name;
}

/** "240 kcal · 40 g protein" — mirrors `QuickAddGrid`'s own `toastMeta`. */
function toastMeta(totals: { kcal: number; protein: number }, locale?: string): string {
  const kcal = Math.round(totals.kcal).toLocaleString(locale);
  return `${kcal} kcal · ${formatGrams(totals.protein, locale)} protein`;
}

function NoLibraryEmptyState({ theme, testID }: { theme: Theme; testID: string }) {
  const { sectionLabel } = theme.color;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel="No foods yet. Type a name below to add your first one."
      style={styles.empty}
    >
      <Text style={textStyle(type.body, sectionLabel.labelText)}>No foods yet.</Text>
      <Text style={[textStyle(type.label, sectionLabel.metaText), styles.emptyLine]}>Type a name below to add your first one.</Text>
    </View>
  );
}

/** Calls `renderCreate` as its own component render, so the sheet's handlers (which touch refs)
 * are passed as props rather than invoked during `SearchSheet`'s render. */
function CreateSlot({ render, ...create }: CreateSlotArgs & { readonly render: (create: CreateSlotArgs) => ReactNode }) {
  return <>{render(create)}</>;
}

export function SearchSheet({ db, onLogged, onPortionAdded, onCreate, renderCreate, locale, theme, testID = 'search-sheet' }: SearchSheetProps) {
  const { searchBar, searchSheet } = theme.color;
  const fireHaptic = useHapticFeedback();

  const [when] = useState(deviceWhen);
  // `libraryEmpty` seeds from a mount-time read (the bar itself renders before the sheet is ever
  // opened) but is re-evaluated in `openSheet` below, issue #96's sub-case — see the module note.
  const [libraryEmpty, setLibraryEmpty] = useState<boolean>(() => quickAddCandidates(db, { ...when, limit: 6 }).length === 0);

  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<Candidate[]>([]);
  // The blank-query fallback (issue #96): the whole library, most used first, used only when
  // `recent` comes back empty. Read alongside `recent` in `openSheet`, never derived on demand, so
  // it is never stale as `recent`'s own freshness guarantee (issue #95) already established.
  const [libraryFallback, setLibraryFallback] = useState<Candidate[]>([]);
  const [sheetCandidate, setSheetCandidate] = useState<Candidate | null>(null);
  // The query the create form was opened with, or `null` while it is closed.
  const [createQuery, setCreateQuery] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  // The row currently showing its "Logged" beat (`logTrackerKey`-shaped), or `null` at rest.
  const [loggedKey, setLoggedKey] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors `visible` but updates synchronously (a `ref`, not `setState`) — issue #110's refocus
  // needs to know *within the same tick* whether `closeSheet` already ran. `PortionSheet`'s own
  // `handlePick` calls `onLog` (here, `handlePortionSheetLog`, which can call `closeSheet` itself
  // for a fresh log) and then always calls `onClose` (`handlePortionSheetClose`) right after, in the
  // same synchronous call — by the time that second call runs, `setVisible(false)` has been queued
  // but not yet applied, so reading `visible` there would still see the stale `true` from this
  // render. `sheetOpenRef` has no such lag, so it is the one `refocusSearch` below trusts.
  const sheetOpenRef = useRef(false);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  // Read fresh on every open (issue #95) — not cached from mount, so a food logged a moment ago,
  // whether or not it is also one of the six on the grid, is already first in Recent the next time
  // this sheet opens, with no reload needed. `libraryByUsage` only runs when Recent comes back
  // empty (issue #96) — no point ranking the whole library on every open when Recent already has
  // something to show. `libraryEmpty` is refreshed here too (issue #96's sub-case), from these same
  // two reads — never a further `quickAddCandidates` call: a library with nothing in it is exactly
  // a library where both `recentFoods` and `libraryByUsage` come back empty, and `recent.length > 0`
  // alone already proves the library is non-empty. So this fixes the staleness with no extra read,
  // and never disturbs `quickAddCandidates`'s own call count (issue #103's re-rank cadence).
  const openSheet = (): void => {
    const freshRecent = recentFoods(db, { ...when, days: interaction.recentDays });
    const freshLibraryFallback = freshRecent.length === 0 ? libraryByUsage(db, {}) : [];
    setRecent(freshRecent);
    setLibraryFallback(freshLibraryFallback);
    setLibraryEmpty(freshRecent.length === 0 && freshLibraryFallback.length === 0);
    setQuery('');
    sheetOpenRef.current = true;
    setVisible(true);
  };

  const closeSheet = (): void => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    sheetOpenRef.current = false;
    setLoggedKey(null);
    setSheetCandidate(null);
    setCreateQuery(null);
    setVisible(false);
  };

  // Issue #110: an overlay (the portion sheet or the create form) closing on its own — Cancel, its
  // scrim, or Android back — must hand the keyboard straight back, or continuing to type costs an
  // extra tap on the field. Guarded by `sheetOpenRef`, not `visible`: `PortionSheet`'s own
  // `handlePick` (and, per `CreateSlotArgs`'s contract, a real create form's own Save) call their
  // "log" callback and then their "close" callback in the same synchronous handler, so a fresh log
  // that closes the *whole* sheet via `closeSheet` must stop this from firing right after — the
  // `visible` state itself would not have updated yet within that same tick. Never fights the
  // open-time focus in `handleShow` below either: that one only ever fires once, from `onShow`,
  // before either overlay can exist.
  const refocusSearch = (): void => {
    if (sheetOpenRef.current) inputRef.current?.focus();
  };

  // Android's back button closes whatever is on top: an overlay first, then the sheet itself.
  const handleRequestClose = (): void => {
    if (sheetCandidate) {
      setSheetCandidate(null);
      refocusSearch();
    } else if (createQuery !== null) {
      setCreateQuery(null);
      refocusSearch();
    } else {
      closeSheet();
    }
  };

  // Focus only once the Modal has finished presenting (issue #79) — see the module note.
  const handleShow = (): void => {
    inputRef.current?.focus();
  };

  // Both overlays sit at the bottom of the sheet — exactly where the keyboard is. Nothing else
  // blurs the field now that the taps persist, so dropping the keyboard here is what keeps the
  // portion steppers and the create form's Save tappable on an iPhone (issue #79).
  const dismissKeyboard = (): void => {
    inputRef.current?.blur();
  };

  const handleCreateLogged = (receipt: LogReceipt): void => {
    onLogged?.(receipt);
    closeSheet();
  };

  const handleCreateClose = (): void => {
    setCreateQuery(null);
    refocusSearch();
  };

  const logFreshCandidate = (candidate: Candidate, at: { at: number; timeZone: string }, portions?: number): LogReceipt =>
    candidate.kind === 'food'
      ? logFood(db, { ...at, foodId: candidate.id, amount: portions === undefined ? undefined : { servings: portions } })
      : logMeal(db, { ...at, mealId: candidate.id, portions });

  const publishToast = (candidate: Candidate, receipt: LogReceipt, totals: { kcal: number; protein: number }, delta: LogDelta): void => {
    useUndoToastStore.getState().show({
      token: receipt.undo,
      candidateKey: logTrackerKey(candidate),
      title: toastTitle(candidate.name, receipt.portions),
      meta: toastMeta(totals, locale),
      delta,
    });
  };

  // The row's brief "Logged" beat, then the sheet closes — `QuickAddTile`'s hold-then-revert,
  // ending in a close instead of a revert: a search row's whole job is done the instant its one
  // write lands, so there is nothing left here to go back to resting figures for.
  const scheduleClose = (): void => {
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      closeSheet();
    }, interaction.rowLoggedHoldMs);
  };

  const handleRowPress = (candidate: Candidate): void => {
    const key = logTrackerKey(candidate);
    const now = deviceWhen();
    try {
      const previous = recentLog(key, now.at);
      if (previous) {
        const next = addPortion(db, { at: now.at, receipt: previous });
        trackLog(key, next, now.at);
        const totals = totalsOf(next.entries);
        const prevTotals = next.undo.kind === 'revert' ? totalsOf(next.undo.previous) : totalsOf(previous.entries);
        const delta: LogDelta = { kcal: totals.kcal - prevTotals.kcal, protein: totals.protein - prevTotals.protein, entryCountDelta: 0 };
        fireHaptic(haptics.foodLogged);
        publishToast(candidate, next, totals, delta);
        onPortionAdded?.(delta);
        setLoggedKey(key);
        scheduleClose();
        return;
      }

      const receipt = logFreshCandidate(candidate, now);
      trackLog(key, receipt, now.at);
      const totals = totalsOf(receipt.entries);
      const delta: LogDelta = { kcal: totals.kcal, protein: totals.protein, entryCountDelta: receipt.entries.length };
      fireHaptic(haptics.foodLogged);
      publishToast(candidate, receipt, totals, delta);
      onLogged?.(receipt);
      setLoggedKey(key);
      scheduleClose();
    } catch (err) {
      // No dialog, no crash — a failed write is not a user-visible event, and the sheet stays open,
      // exactly as if the tap simply did not count (`QuickAddGrid`'s own doctrine).
      if (!(err instanceof VitalsDbError)) throw err;
      forgetLog(key);
    }
  };

  const handleRowLongPress = (candidate: Candidate): void => {
    // `interaction.undoDismissedBy` includes `'sheetOpened'` — a toast from the tap before this
    // long-press must not survive into a decision the portion sheet is about to make instead.
    useUndoToastStore.getState().dismiss();
    dismissKeyboard();
    setSheetCandidate(candidate);
  };

  const handlePortionSheetClose = (): void => {
    setSheetCandidate(null);
    refocusSearch();
  };

  const handlePortionSheetLog = (candidate: Candidate, portions: number): void => {
    const now = deviceWhen();
    try {
      const receipt = logFreshCandidate(candidate, now, portions);
      trackLog(logTrackerKey(candidate), receipt, now.at);
      const totals = totalsOf(receipt.entries);
      const delta: LogDelta = { kcal: totals.kcal, protein: totals.protein, entryCountDelta: receipt.entries.length };
      fireHaptic(haptics.foodLogged);
      publishToast(candidate, receipt, totals, delta);
      onLogged?.(receipt);
      setSheetCandidate(null);
      closeSheet();
    } catch (err) {
      if (!(err instanceof VitalsDbError)) throw err;
      setSheetCandidate(null);
    }
  };

  const trimmedQuery = query.trim();

  const handleCreatePress = (): void => {
    dismissKeyboard();
    onCreate?.(trimmedQuery);
    if (renderCreate) setCreateQuery(trimmedQuery);
  };
  const results = useMemo<Candidate[]>(
    () => (trimmedQuery.length === 0 ? [] : searchFoods(db, { ...when, query: trimmedQuery })),
    [db, when, trimmedQuery],
  );

  const typing = trimmedQuery.length > 0;
  // Recent if it has anything, else the library-by-usage fallback (issue #96) — never both.
  const blankQueryList = recent.length > 0 ? recent : libraryFallback;
  const rows: Row[] = typing
    ? [...results.map((candidate) => ({ key: `${candidate.kind}-${candidate.id}`, kind: 'candidate' as const, candidate })), { key: 'create', kind: 'create' as const }]
    : blankQueryList.map((candidate) => ({ key: `${candidate.kind}-${candidate.id}`, kind: 'candidate' as const, candidate }));

  // Keyed off `libraryEmpty` (`quickAddCandidates`, the whole library), not `blankQueryList` —
  // `recentFoods` only covers the last `interaction.recentDays` days and `libraryByUsage` only runs
  // once Recent is confirmed empty, so a library with real items that simply have not been logged
  // recently must never see "No foods yet"; it sees the fallback instead.
  const showNoLibraryEmptyState = !typing && libraryEmpty;

  const renderRow = ({ item }: { item: Row }) =>
    item.kind === 'create' ? (
      <CreateRow query={trimmedQuery} theme={theme} onPress={handleCreatePress} testID={`${testID}-create`} />
    ) : (
      <ResultRow
        candidate={item.candidate}
        theme={theme}
        locale={locale}
        logged={loggedKey === logTrackerKey(item.candidate)}
        onPress={() => handleRowPress(item.candidate)}
        onLongPress={() => handleRowLongPress(item.candidate)}
        testID={`${testID}-row-${item.candidate.kind}-${item.candidate.id}`}
      />
    );

  const header = typing
    ? results.length > 0
      ? { title: 'Results', meta: `${results.length} match${results.length === 1 ? '' : 'es'}`, testID: `${testID}-section-results` }
      : null
    : recent.length > 0
      ? { title: 'Recent', meta: `${interaction.recentDays} days`, testID: `${testID}-section-recent` }
      : libraryFallback.length > 0
        ? { title: 'Your foods', meta: 'Most used first', testID: `${testID}-section-library` }
        : null;

  // The pinned blank-query row (issue #97) is drawn as part of the list header, never as a data
  // row: `ListHeaderComponent` renders above every data row *and* above the section header below
  // it, so it stays first whether Recent has items, the library is empty, or anything in between.
  const listHeader = (
    <>
      {!typing ? <CreateNewFoodRow theme={theme} onPress={handleCreatePress} testID={`${testID}-create-new`} /> : null}
      {header ? (
        <View testID={header.testID} style={styles.sectionHeader}>
          <Text style={textStyle(type.micro, searchSheet.sectionText)}>{header.title}</Text>
          <Text style={textStyle(type.label, searchSheet.sectionMetaText)}>{header.meta}</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <View testID={testID}>
      <Pressable
        testID={`${testID}-bar`}
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={libraryEmpty ? 'Add your first food' : 'Search foods'}
        style={[
          styles.bar,
          {
            height: size.searchBar.heightHit,
            minHeight: size.tapTargetMin,
            borderRadius: radius.lg,
            backgroundColor: searchBar.bg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: libraryEmpty ? searchBar.borderEmphasis : searchBar.border,
          },
        ]}
      >
        <Text style={{ fontSize: size.icon.lg, color: libraryEmpty ? searchBar.emphasisIcon : searchBar.searchIcon, marginRight: space[3] }}>{SEARCH_GLYPH}</Text>
        <Text style={textStyle(type.body, libraryEmpty ? searchBar.emphasisLabelText : searchBar.labelText)}>
          {libraryEmpty ? 'Add your first food' : 'Search foods'}
        </Text>
      </Pressable>

      {visible ? (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={handleRequestClose}
          onShow={handleShow}
          testID={`${testID}-modal`}
        >
          <Pressable
            testID={`${testID}-scrim`}
            accessibilityRole="button"
            accessibilityLabel="Close search"
            onPress={closeSheet}
            style={[styles.topScrim, { height: size.searchSheet.topInset, backgroundColor: theme.color.bg.scrim }]}
          />
          <View style={[styles.sheet, { backgroundColor: searchSheet.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }]}>
            <View
              style={[styles.grabber, { width: size.searchSheet.grabberWidth, height: size.searchSheet.grabberHeight, borderRadius: radius.pill, backgroundColor: searchSheet.grabber }]}
            />

            <View style={styles.fieldRow}>
              <View style={[styles.field, { height: size.searchSheet.fieldHeight, borderRadius: radius.md, backgroundColor: searchSheet.fieldBg, borderColor: searchSheet.fieldBorderFocus }]}>
                <Text style={{ fontSize: size.icon.md, color: searchSheet.fieldIcon, marginRight: space[2] }}>{SEARCH_GLYPH}</Text>
                <TextInput
                  ref={inputRef}
                  testID={`${testID}-input`}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search foods"
                  placeholderTextColor={searchSheet.placeholderText}
                  selectionColor={searchSheet.caret}
                  style={[textStyle(type.input, searchSheet.queryText), styles.input]}
                  accessibilityLabel="Search foods"
                />
                {query.length > 0 ? (
                  <Pressable
                    testID={`${testID}-clear`}
                    onPress={() => setQuery('')}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    hitSlop={space[2]}
                    style={{ minWidth: size.searchSheet.clearHit, minHeight: size.searchSheet.clearHit, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: size.icon.md, color: searchSheet.clearIcon }}>{CLEAR_GLYPH}</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                testID={`${testID}-cancel`}
                onPress={closeSheet}
                accessibilityRole="button"
                accessibilityLabel="Cancel search"
                hitSlop={space[2]}
                style={{ minHeight: size.searchSheet.cancelHit, justifyContent: 'center', paddingLeft: space[4] }}
              >
                <Text style={textStyle(type.button, searchSheet.cancelText)}>Cancel</Text>
              </Pressable>
            </View>

            <FlatList
              data={rows}
              keyExtractor={(row) => row.key}
              renderItem={renderRow}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={listHeader}
              ListFooterComponent={showNoLibraryEmptyState ? <NoLibraryEmptyState theme={theme} testID={`${testID}-empty`} /> : null}
            />
          </View>

          {createQuery !== null && renderCreate ? (
            <CreateSlot render={renderCreate} query={createQuery} onLogged={handleCreateLogged} onClose={handleCreateClose} />
          ) : null}
          <PortionSheet
            presentation="overlay"
            candidate={sheetCandidate}
            theme={theme}
            locale={locale}
            onLog={handlePortionSheetLog}
            onClose={handlePortionSheetClose}
            testID={`${testID}-portion-sheet`}
          />
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[5],
  },
  topScrim: {
    width: '100%',
  },
  sheet: {
    flex: 1,
    paddingTop: space[3],
    gap: space[3],
  },
  grabber: {
    alignSelf: 'center',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[6],
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[4],
  },
  input: {
    flex: 1,
    padding: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: space[6],
    paddingVertical: space[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[6],
    paddingVertical: space[4],
    gap: space[4],
  },
  rowText: {
    flexShrink: 1,
    gap: space[1],
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  name: {
    flexShrink: 1,
  },
  mealTag: {
    paddingHorizontal: space[2],
    // `space[1]` (4) — the tightest step on the scale. No step is as small as the previous
    // hardcoded 1px; this is the closest token to the small pill the tag calls for.
    paddingVertical: space[1],
  },
  rowFigures: {
    alignItems: 'flex-end',
    gap: space[1],
  },
  loggedBeat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  createDisc: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    paddingVertical: space[7],
    paddingHorizontal: space[6],
    alignItems: 'center',
    gap: space[2],
  },
  emptyLine: {
    textAlign: 'center',
  },
});
