/**
 * `<DayLogRow>` — one row of the Today log (issue #42, the day-log sub-issue of #22/#20's tracker).
 * Tap it to edit (`<DayLogList>` reopens #21's `<PortionSheet>` pre-filled at what this row already
 * holds); swipe it to reveal Delete, with undo, never a confirmation dialog — the same tap doctrine
 * `docs/decisions.md` states for the quick-add grid: confirmation costs a tap on every success,
 * undo costs one only on the rare mistake.
 *
 * THE SWIPE GESTURE, GEOMETRY AND DANGER BUTTON LIVE IN `<SwipeToDelete>` (issue #141), NOT HERE. This
 * row supplies only what is specific to it: its own figures, `entryName`'s fallback text as both the
 * button's screen-reader label and the row's own accessibility label, and its own tap-to-edit
 * behaviour. `DELETE_SLIDE_WIDTH`, `dragOffset`, `releasesOpen` and `deleteLayerOpacity` are
 * re-exported below unchanged, so #85's own test suite keeps importing them from here without
 * modification — see `../shared/SwipeToDelete.tsx` for what they actually do and why.
 *
 * AN ACCESSIBLE ROUTE THAT NEEDS NO SWIPE AT ALL. A physical swipe has no VoiceOver/TalkBack
 * equivalent by default, so the row also exposes a `delete` `accessibilityAction` — a screen-reader
 * user reaches the exact same `onDelete` a sighted user reaches by dragging, never a second-class
 * path. This lives on the row's own content `Pressable`, not on `<SwipeToDelete>`, because the
 * accessible element carrying it is this row's full label (name, kcal, protein, time) — content only
 * this component owns.
 *
 * "REVEALED CLOSES INSTEAD OF OPENING THE EDITOR." `<SwipeToDelete>` hands this row `revealed` and
 * `close()` precisely so this rule — the first tap on an open row puts it away rather than navigating
 * — stays a one-line ternary here instead of `<SwipeToDelete>` having to guess what "the row's normal
 * action" means for every future consumer.
 */
import { Pressable, StyleSheet, Text, type AccessibilityActionEvent, type TextStyle } from 'react-native';
import type { DayLogEntry } from '../../db';
import { formatGrams } from '../format/food';
import { size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { DELETE_SLIDE_WIDTH, SwipeToDelete, deleteLayerOpacity, dragOffset, releasesOpen } from '../shared/SwipeToDelete';

export type DayLogRowProps = {
  readonly entry: DayLogEntry;
  readonly theme: Theme;
  /** Formatting locale, forwarded to the kcal/protein figures. Defaults to the device's. */
  readonly locale?: string;
  readonly onPress: (entry: DayLogEntry) => void;
  readonly onDelete: (entry: DayLogEntry) => void;
  readonly testID?: string;
};

// Re-exported so #85's own test suite — and any other existing caller — keeps importing these from
// `DayLogRow` unmodified; the gesture and the three drag rules now live in `<SwipeToDelete>`
// (issue #141), `DayLogRow` is just their first consumer.
export { DELETE_SLIDE_WIDTH, deleteLayerOpacity, dragOffset, releasesOpen };

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

/** "480 minutes after midnight" -> `"08:00"`. Reads `DayLogEntry.localMinute` directly — it is
 * already the authoritative local wall-clock time (`CLAUDE.md`'s local-date discipline), so there is
 * no timezone conversion left to get wrong here, unlike deriving a time from the UTC `loggedAt`. */
export function timeLabel(localMinute: number): string {
  const hh = Math.floor(localMinute / 60)
    .toString()
    .padStart(2, '0');
  const mm = (localMinute % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/** The row's display name — the meal it was logged from, else the food, else an honest placeholder
 * for the data-integrity edge case where neither resolved (never silently blank). Exported for
 * `<DayLogList>`'s own undo-toast title, so an edit or a delete names itself the same way the row
 * that triggered it already reads on screen. */
export function entryName(entry: DayLogEntry): string {
  return entry.mealName ?? entry.foodName ?? 'Removed food';
}

export function DayLogRow({ entry, theme, locale, onPress, onDelete, testID = 'day-log-row' }: DayLogRowProps) {
  const { logRow, bg } = theme.color;
  const name = entryName(entry);
  const kcalText = Math.round(entry.kcal).toLocaleString(locale);
  const proteinText = formatGrams(entry.protein, locale);
  const time = timeLabel(entry.localMinute);

  const handleDelete = (): void => onDelete(entry);

  const handleAccessibilityAction = (event: AccessibilityActionEvent): void => {
    if (event.nativeEvent.actionName === 'delete') handleDelete();
  };

  const accessibilityLabel = `${name}, ${kcalText} kcal, ${proteinText} protein, logged at ${time}. Double tap to edit.`;

  return (
    <SwipeToDelete theme={theme} deleteLabel={name} onDelete={handleDelete} style={{ height: size.row.logHit }} testID={testID}>
      {({ dragging, revealed, close }) => (
        <Pressable
          testID={testID}
          onPress={revealed ? close : () => onPress(entry)}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
          onAccessibilityAction={handleAccessibilityAction}
          style={[
            styles.content,
            {
              minHeight: size.row.logHit,
              backgroundColor: dragging ? logRow.bgPress : bg.canvas,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: logRow.divider,
            },
          ]}
        >
          <Text testID={`${testID}-time`} style={[textStyle(type.numericRow, logRow.timeText), styles.time]}>
            {time}
          </Text>
          <Text testID={`${testID}-name`} numberOfLines={1} style={[textStyle(type.body, logRow.nameText), styles.name]}>
            {name}
          </Text>
          <Text testID={`${testID}-kcal`} style={textStyle(type.numericRow, logRow.kcalText)}>{`${kcalText} kcal`}</Text>
          <Text testID={`${testID}-protein`} style={[textStyle(type.numericRow, logRow.proteinText), styles.protein]}>
            {`${proteinText} protein`}
          </Text>
        </Pressable>
      )}
    </SwipeToDelete>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[1],
  },
  time: {
    width: 44,
  },
  name: {
    flex: 1,
  },
  protein: {
    textAlign: 'right',
  },
});
