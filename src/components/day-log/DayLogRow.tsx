/**
 * `<DayLogRow>` — one row of the Today log (issue #42, the day-log sub-issue of #22/#20's tracker).
 * Tap it to edit (`<DayLogList>` reopens #21's `<PortionSheet>` pre-filled at what this row already
 * holds); swipe it to reveal Delete, with undo, never a confirmation dialog — the same tap doctrine
 * `docs/decisions.md` states for the quick-add grid: confirmation costs a tap on every success,
 * undo costs one only on the rare mistake.
 *
 * THE DELETE ACTION IS ALWAYS MOUNTED, JUST COVERED. It sits in a back layer, full row height,
 * behind the front content layer that carries the row's own figures. At rest the front layer's
 * offset is `0` and fully covers it; dragging left slides the front layer clear, the same physical-
 * stacking trick that makes touches land on whichever layer is actually on top rather than needing
 * to toggle `pointerEvents` by hand. This is also what makes the action directly reachable in a
 * behaviour test by testID, with no need to simulate a real drag (`PortionSheet.test.tsx`'s own
 * precedent: its slider's nudge buttons are tested, not a `PanResponder` drag).
 *
 * `PanResponder`, NOT A GESTURE LIBRARY. `react-native-gesture-handler` is only a transitive
 * dependency here (pulled in by `expo-router`), never one this app has declared for itself —
 * `PortionSheet.tsx`'s `SliderTrack` already sets the precedent of building a drag purely on RN
 * core's `PanResponder`, and this reveal is the same shape of problem: one axis, one release
 * decision, no dependency to raise on the issue first (`CLAUDE.md`).
 *
 * PLAIN STATE, NOT A REF OR A SHARED VALUE — same reason `SliderTrack` gives for its own drag: this
 * codebase's hooks lint rule treats any ref/shared-value handed to `PanResponder.create` (a plain
 * function call, not a recognised JSX event-prop sink) as a possible read-or-mutate-during-render,
 * whether or not it is ever actually invoked synchronously. Tracking the reveal purely through
 * `useState` — exactly `SliderTrack`'s own drag position — sidesteps the false positive entirely
 * instead of fighting it, and still re-renders once per touch-move event, same as that slider.
 *
 * AN ACCESSIBLE ROUTE THAT NEEDS NO SWIPE AT ALL. A physical swipe has no VoiceOver/TalkBack
 * equivalent by default, so the row also exposes a `delete` `accessibilityAction` — a screen-reader
 * user reaches the exact same `onDelete` a sighted user reaches by dragging, never a second-class
 * path.
 */
import { useMemo, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type PanResponderGestureState,
  type TextStyle,
} from 'react-native';
import type { DayLogEntry } from '../../db';
import { size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';

export type DayLogRowProps = {
  readonly entry: DayLogEntry;
  readonly theme: Theme;
  /** Formatting locale, forwarded to the kcal/protein figures. Defaults to the device's. */
  readonly locale?: string;
  readonly onPress: (entry: DayLogEntry) => void;
  readonly onDelete: (entry: DayLogEntry) => void;
  readonly testID?: string;
};

/** The Delete pane's width — the tap-target floor plus one gutter of breathing room around its
 * label, not an arbitrary pixel guess. */
const DELETE_PANE_WIDTH = size.tapTargetMin + space[5];
/** Past this drag, releasing snaps the row fully open (Delete revealed) instead of springing shut. */
const REVEAL_THRESHOLD = DELETE_PANE_WIDTH / 2;

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
 * for the data-integrity edge case where neither resolved (never silently blank). */
function entryName(entry: DayLogEntry): string {
  return entry.mealName ?? entry.foodName ?? 'Removed food';
}

export function DayLogRow({ entry, theme, locale, onPress, onDelete, testID = 'day-log-row' }: DayLogRowProps) {
  const { logRow } = theme.color;
  const name = entryName(entry);
  const kcalText = Math.round(entry.kcal).toLocaleString(locale);
  const proteinText = Math.round(entry.protein).toLocaleString(locale);
  const time = timeLabel(entry.localMinute);

  const [revealed, setRevealed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_: GestureResponderEvent, gesture: PanResponderGestureState) =>
          Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => setDragging(true),
        onPanResponderMove: (_: GestureResponderEvent, gesture: PanResponderGestureState) => {
          const base = revealed ? -DELETE_PANE_WIDTH : 0;
          setOffset(Math.min(0, Math.max(-DELETE_PANE_WIDTH, base + gesture.dx)));
        },
        onPanResponderRelease: (_: GestureResponderEvent, gesture: PanResponderGestureState) => {
          setDragging(false);
          const base = revealed ? -DELETE_PANE_WIDTH : 0;
          const open = base + gesture.dx <= -REVEAL_THRESHOLD;
          setOffset(open ? -DELETE_PANE_WIDTH : 0);
          setRevealed(open);
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          setOffset(0);
          setRevealed(false);
        },
      }),
    [revealed],
  );

  const handlePress = (): void => {
    if (revealed) {
      setRevealed(false);
      setOffset(0);
      return;
    }
    onPress(entry);
  };

  const handleDelete = (): void => onDelete(entry);

  const handleAccessibilityAction = (event: AccessibilityActionEvent): void => {
    if (event.nativeEvent.actionName === 'delete') handleDelete();
  };

  const accessibilityLabel = `${name}, ${kcalText} kcal, ${proteinText} g protein, logged at ${time}. Double tap to edit.`;

  return (
    <View testID={`${testID}-wrap`} style={[styles.wrap, { height: size.row.logHit }]}>
      <View style={[StyleSheet.absoluteFill, styles.backLayer]}>
        <Pressable
          testID={`${testID}-delete`}
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${name}`}
          style={[styles.deleteAction, { width: DELETE_PANE_WIDTH, minHeight: size.tapTargetMin }]}
        >
          <Text style={textStyle(type.label, logRow.deleteText)}>Delete</Text>
        </Pressable>
      </View>

      <View {...panResponder.panHandlers} style={[styles.front, { transform: [{ translateX: offset }] }]}>
        <Pressable
          testID={testID}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
          onAccessibilityAction={handleAccessibilityAction}
          style={[
            styles.content,
            {
              minHeight: size.row.logHit,
              backgroundColor: dragging ? logRow.bgPress : 'transparent',
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
            {`${proteinText} g protein`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    overflow: 'hidden',
  },
  backLayer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  deleteAction: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  front: {
    width: '100%',
  },
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
