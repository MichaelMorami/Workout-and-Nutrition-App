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
 * behaviour test by testID — but that shortcut only ever proves the SHUT row, so the swipe itself is
 * driven for real too: the test drives this very `PanResponder` through
 * `onResponderGrant`/`Move`/`Release` with a populated `touchHistory`, and re-runs the icon and
 * square assertions with the row actually open (`PortionSheet.test.tsx` sets the precedent for
 * driving a `PanResponder` rather than only pressing what it reveals).
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
 *
 * THE DELETE BUTTON (issue #85, design #80). An icon-only square — `glyph.delete` on `state.danger`,
 * painted `size.deleteButton.side`, touch area `sideHit` via `hitSlop` — sitting on the row's trailing
 * edge. The row slides open by `gap + side`, so a strip of theme background separates the protein
 * figure from the button. At rest the front row paints `bg.canvas` (opaque) AND the back layer is
 * transparent-by-opacity, so no part of the button can bleed under the row's figures — the bug #85
 * reported, when the front row was `transparent` and the old "Delete" label showed through.
 *
 * THE THREE DRAG RULES ARE PURE FUNCTIONS, NOT INLINE ARITHMETIC. `dragOffset`, `releasesOpen` and
 * `deleteLayerOpacity` below are the whole gesture: where the row sits mid-drag, whether letting go
 * leaves the button showing, and whether the layer is painted at all. They live outside the
 * component so each can be asserted at its exact boundary (the 23 pt midpoint, the over-drag clamp,
 * the closed/open opacity flip) instead of only being observable through a rendered row that a test
 * can otherwise only ever catch sitting shut.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { formatGrams } from '../format/food';
import { glyph, radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';

export type DayLogRowProps = {
  readonly entry: DayLogEntry;
  readonly theme: Theme;
  /** Formatting locale, forwarded to the kcal/protein figures. Defaults to the device's. */
  readonly locale?: string;
  readonly onPress: (entry: DayLogEntry) => void;
  readonly onDelete: (entry: DayLogEntry) => void;
  readonly testID?: string;
};

/** How far the row slides open: the theme-background gap, then the square button. */
export const DELETE_SLIDE_WIDTH = size.deleteButton.gap + size.deleteButton.side;
/** Past this drag, releasing snaps the row fully open (Delete revealed) instead of springing shut. */
const REVEAL_THRESHOLD = DELETE_SLIDE_WIDTH / 2;
/**
 * Extends the painted square out to the full `sideHit` touch square — but NOT evenly. The button is
 * flush against the trailing edge of `wrap`, and `wrap` clips (`overflow: 'hidden'`), so slop added
 * on the right would sit outside the ancestor's bounds and never be hit-tested: an even spread buys
 * a 40 pt-wide target while claiming 44. All of the horizontal slop therefore goes left, where it is
 * inside the clip box — and it still stops 2 pt clear of the fully open row's trailing edge
 * (`DELETE_SLIDE_WIDTH` 46 − 44), so it can never steal a touch meant for the row itself. Vertically
 * the square is centred in a `logHit`-tall row, so 4 pt each way exactly fills it.
 */
const DELETE_SLOP_Y = (size.deleteButton.sideHit - size.deleteButton.side) / 2;
const DELETE_HIT_SLOP = {
  top: DELETE_SLOP_Y,
  bottom: DELETE_SLOP_Y,
  left: size.deleteButton.sideHit - size.deleteButton.side,
  right: 0,
};

/**
 * Where the row sits while the finger is down: the position it started this drag from, plus the
 * finger's travel, clamped to the two ends of the track so an over-drag can neither tear the row
 * past the button nor push it right of shut.
 */
export function dragOffset(revealed: boolean, dx: number): number {
  const base = revealed ? -DELETE_SLIDE_WIDTH : 0;
  return Math.min(0, Math.max(-DELETE_SLIDE_WIDTH, base + dx));
}

/**
 * Whether letting go here leaves the button showing. It reads the UNCLAMPED position on purpose, so
 * the midpoint decides in both directions with no dead zone and no hysteresis gap: from shut, a
 * 23 pt pull opens; from open, a 23 pt push back still stays open, and 24 closes.
 */
export function releasesOpen(revealed: boolean, dx: number): boolean {
  const base = revealed ? -DELETE_SLIDE_WIDTH : 0;
  return base + dx <= -REVEAL_THRESHOLD;
}

/**
 * The delete layer is painted only once the row has actually moved. Belt and braces with the front
 * row's opaque `bg.canvas`: even if a future layout let the front row stop covering the layer, a
 * shut row still cannot show a pixel of the button. (`-0 === 0`, so a signed zero cannot defeat it.)
 */
export function deleteLayerOpacity(offset: number): number {
  return offset === 0 ? 0 : 1;
}

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
  const { logRow, bg, state, text } = theme.color;
  const name = entryName(entry);
  const kcalText = Math.round(entry.kcal).toLocaleString(locale);
  const proteinText = formatGrams(entry.protein, locale);
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
          setOffset(dragOffset(revealed, gesture.dx));
        },
        onPanResponderRelease: (_: GestureResponderEvent, gesture: PanResponderGestureState) => {
          setDragging(false);
          const open = releasesOpen(revealed, gesture.dx);
          setOffset(open ? -DELETE_SLIDE_WIDTH : 0);
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

  const accessibilityLabel = `${name}, ${kcalText} kcal, ${proteinText} protein, logged at ${time}. Double tap to edit.`;

  return (
    <View testID={`${testID}-wrap`} style={[styles.wrap, { height: size.row.logHit }]}>
      <View
        testID={`${testID}-delete-layer`}
        style={[StyleSheet.absoluteFill, styles.backLayer, { opacity: deleteLayerOpacity(offset) }]}
      >
        <Pressable
          testID={`${testID}-delete`}
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${name}`}
          hitSlop={DELETE_HIT_SLOP}
          style={[
            styles.deleteAction,
            {
              width: size.deleteButton.side,
              height: size.deleteButton.side,
              borderRadius: radius.sm,
              backgroundColor: state.danger,
            },
          ]}
        >
          <Ionicons
            testID={`${testID}-delete-icon`}
            name={glyph.delete}
            size={size.icon.deleteAction}
            color={text.onDanger}
          />
        </Pressable>
      </View>

      <View
        testID={`${testID}-front`}
        {...panResponder.panHandlers}
        style={[styles.front, { transform: [{ translateX: offset }] }]}
      >
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
