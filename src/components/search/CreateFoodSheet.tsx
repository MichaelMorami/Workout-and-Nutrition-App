/**
 * `<CreateFoodSheet>` — issue #71: what a tap on `<SearchSheet>`'s trailing "Create '‹query›'" row
 * opens. `<FoodForm>`'s `name` starts pre-filled with the query that seeded it (`FoodForm`'s own
 * "pre-fill everything that can be predicted" doctrine) — every other field starts blank/zero,
 * exactly a fresh food's usual state. Save is `FoodForm`'s own single button, wired here to
 * `createFoodAndLog` (`src/db/queries/search.ts`) instead of plain `createFood`: one transaction
 * stores the food and logs one serving, so a failed log never leaves an orphan food and a
 * successful one never needs a second write path. `receipt.undo` is `'unlog'` — undoing it through
 * the same generic `<UndoToast>`/`undo()` every other write in this app uses removes the log and
 * **keeps the food** (`createFoodAndLog`'s own module note); nothing here has to special-case that.
 *
 * A REAL SAVE BUTTON IS THE DOCUMENTED EXCEPTION, NOT A REGRESSION. `FoodForm`'s own module note
 * already carves this out: unlike the quick-add grid's one-tap logging, a multi-field form has no
 * single value to auto-commit, so Save (never a confirmation dialog on top of it) is the only sane
 * commit point. Cancel (`FoodForm`'s own button) calls `onClose` and writes nothing, same as
 * cancelling `/foods/new`.
 *
 * MOUNTED AS A SIBLING OF `<SearchSheet>`, NOT INSIDE IT. `SearchSheet`'s own module note is
 * explicit: `onCreate` is "exposed here only as a plain callback ... this component never touches
 * `createFoodAndLog` itself" — the screen that renders both (`app/(tabs)/index.tsx`) owns the
 * `query` state that opens this sheet, the same sibling-not-child shape `<UndoToast>` already uses
 * and for the same reason. Deliberately no `visible` flag separate from `query` (`<PortionSheet>`'s
 * own `candidate` pattern) — `null` closes it, a string opens it pre-filled with that string.
 * `SearchSheet`'s own sheet is left exactly as `onCreate` left it (open, still showing the query and
 * results) rather than reached into to close — a second stacked sheet is the same shape a long-press
 * already produces (`<PortionSheet>` over `<SearchSheet>`'s own modal).
 *
 * TAP COUNT: open the search bar (1) + tap Create (2) + tap Save (3) — three fixed taps for a
 * brand-new food logged once, whatever it takes to edit the name (pre-filled already) and set the
 * numbers (`FoodForm`'s steppers, never a keyboard number field per the tap doctrine).
 */
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { createFoodAndLog, VitalsDbError, type FoodInput, type LogReceipt, type VitalsDb } from '../../db';
import { deviceWhen } from '../../hooks/deviceWhen';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { useUndoToastStore } from '../../store/undoToast';
import { haptics, layout, radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { FoodForm } from '../food-form';

export type CreateFoodSheetProps = {
  readonly db: VitalsDb;
  /** The trimmed query that seeded this sheet — `SearchSheet`'s own `onCreate(query)`. `null`
   * closes the sheet; a non-empty string opens it with `FoodForm`'s `name` pre-filled from it. */
  readonly query: string | null;
  /** Fires with the fresh log's receipt after a successful save — the same shape `QuickAddGrid`/
   * `SearchSheet`'s own `onLogged` hand up, so the Today screen's running totals feed from one
   * reducer regardless of which of the three logging paths wrote. */
  readonly onLogged?: (receipt: LogReceipt) => void;
  readonly onClose: () => void;
  /** Formatting locale, forwarded to the undo toast's figures. Defaults to the device's. */
  readonly locale?: string;
  readonly theme: Theme;
  readonly testID?: string;
};

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

function totalsOf(entries: readonly { readonly kcal: number; readonly protein: number }[]): { kcal: number; protein: number } {
  return entries.reduce((sum, entry) => ({ kcal: sum.kcal + entry.kcal, protein: sum.protein + entry.protein }), { kcal: 0, protein: 0 });
}

/** "240 kcal · 40 g protein" — mirrors `SearchSheet`'s own `toastMeta`, so this sheet's toast reads
 * exactly like a row's or a tile's. */
function toastMeta(totals: { kcal: number; protein: number }, locale?: string): string {
  const kcal = Math.round(totals.kcal).toLocaleString(locale);
  const protein = Math.round(totals.protein).toLocaleString(locale);
  return `${kcal} kcal · ${protein} g protein`;
}

export function CreateFoodSheet({ db, query, onLogged, onClose, locale, theme, testID = 'create-food-sheet' }: CreateFoodSheetProps) {
  const { portionSheet } = theme.color;
  const fireHaptic = useHapticFeedback();
  const open = query !== null;

  // `interaction.undoDismissedBy` includes `'sheetOpened'` (`undoToast.ts`'s own module note) — a
  // toast from a row tapped just before Create must not survive into a decision this sheet, not
  // that tap, is about to make instead. Mirrors `SearchSheet`'s own `handleRowLongPress`.
  useEffect(() => {
    if (open) useUndoToastStore.getState().dismiss();
  }, [open]);

  if (!open) return null;

  const initial: FoodInput = {
    name: query,
    brand: null,
    servingLabel: '',
    servingGrams: null,
    kcalPerServing: 0,
    proteinPerServing: 0,
  };

  const handleSave = (input: FoodInput): void => {
    const now = deviceWhen();
    try {
      const { food, receipt } = createFoodAndLog(db, { ...now, food: input });
      const totals = totalsOf(receipt.entries);
      fireHaptic(haptics.foodLogged);
      useUndoToastStore.getState().show({
        token: receipt.undo,
        candidateKey: `food-${food.id}`,
        title: food.name,
        meta: toastMeta(totals, locale),
        delta: { kcal: totals.kcal, protein: totals.protein, entryCountDelta: receipt.entries.length },
      });
      onLogged?.(receipt);
      onClose();
    } catch (err) {
      // No dialog, no crash — the same doctrine every write in this app follows. The sheet stays
      // open with whatever the user typed still in it, as if Save simply did not count.
      if (!(err instanceof VitalsDbError)) throw err;
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} testID={testID}>
      <Pressable
        testID={`${testID}-scrim`}
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={[styles.topScrim, { height: size.searchSheet.topInset, backgroundColor: theme.color.bg.scrim }]}
      />
      <View
        style={[
          styles.sheet,
          { backgroundColor: portionSheet.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, boxShadow: theme.shadow.sheet },
        ]}
      >
        <View
          style={[
            styles.grabber,
            { width: size.searchSheet.grabberWidth, height: size.searchSheet.grabberHeight, backgroundColor: portionSheet.grabber, borderRadius: radius.pill },
          ]}
        />
        <Text testID={`${testID}-title`} style={textStyle(type.title, portionSheet.titleText)}>{`Create "${query}"`}</Text>
        <View style={styles.formArea}>
          <FoodForm initial={initial} onSave={handleSave} onCancel={onClose} theme={theme} testID={`${testID}-form`} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  topScrim: {
    width: '100%',
  },
  sheet: {
    flex: 1,
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    paddingBottom: space[7],
    gap: space[4],
  },
  grabber: {
    alignSelf: 'center',
  },
  formArea: {
    flex: 1,
  },
});
