/**
 * `<SwipeToDelete>` — the swipe-revealed square trash button, extracted from `DayLogRow` (issue #85,
 * design #80) so `DayLogRow`, and #100/#101's Foods/Meals settings rows after it, all get the same
 * gesture, geometry and danger button from one place instead of cloning it three ways (issue #141).
 *
 * THIS OWNS THE GESTURE AND THE BUTTON, NOT THE ROW'S OWN CONTENT. `DayLogRow` (and #100/#101's rows)
 * still build their own front-layer content — their own figures, their own tap-to-edit behaviour,
 * their own delete-button label text — because that varies per consumer. What is identical across
 * every swipeable row is everything below: the `PanResponder`, the slide geometry
 * (`DELETE_SLIDE_WIDTH` = `size.deleteButton.gap` + `side`), the reveal threshold, the `hitSlop`
 * distribution and the danger button itself. The content is handed in as a render-prop `children`,
 * which receives `dragging`/`revealed` (for the content's own press/close behaviour) and `close()` —
 * see `DayLogRow.tsx` for the shape of a consumer.
 *
 * PanResponder, plain `useState`, the three pure drag-rule functions, and the "delete is always
 * mounted, just covered" back-layer trick are unchanged from #85 — see that component's own history
 * for why each of those choices was made; nothing about the reasoning changed by moving the code
 * here, only where it lives.
 *
 * THE A11Y FIX THIS EXTRACTION FOLDS IN (opus review of #140, parked on #141). The delete `Pressable`
 * used to stay in the accessibility tree even while fully covered and `opacity: 0` — a VoiceOver user
 * swiping through the screen could land on an invisible button. It now leaves the tree whenever the
 * layer is not painted (`accessibilityElementsHidden` + `importantForAccessibility`, the iOS/Android
 * pair), using the exact same condition `deleteLayerOpacity` already computes, so "in the tree" and
 * "visible" can never disagree. This does not touch the *screen-reader* path to delete at all — the
 * `delete` `accessibilityAction` a consumer wires onto its own content Pressable (`DayLogRow`'s
 * `accessibilityActions={[{ name: 'delete' }]}`) still reaches `onDelete` regardless of whether a
 * physical swipe ever happened, exactly as #85 built it.
 *
 * REVEAL_THRESHOLD IS NOT CONFIGURABLE, ON PURPOSE. `clamp(raw) <= -23` and `raw <= -23` agree only
 * while the threshold stays strictly inside `(0, DELETE_SLIDE_WIDTH)` (opus review of #140). Every
 * known consumer wants the same half-of-travel midpoint, so keeping it a private constant here — not
 * a prop — keeps that invariant true by construction instead of needing a test for it. Reopen this if
 * a future caller genuinely needs a different threshold.
 *
 * TOKENS ONLY, NEVER AN ARTBOARD NUMBER. The 46/10/36 geometry is pinned in
 * `design/tab-icons/canvas/DeletePane.dc.html` too (design-lead's file) — they agree today because
 * this component reads `size.deleteButton.*` and nothing else. If a token value ever moves, this
 * file changes with it automatically; it must never restate 46, 10 or 36 as a literal.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState, type ReactNode } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { glyph, radius, size, type Theme } from '../../theme/tokens';

/** How far the row slides open: the theme-background gap, then the square button. */
export const DELETE_SLIDE_WIDTH = size.deleteButton.gap + size.deleteButton.side;
/** Past this drag, releasing snaps the row fully open (Delete revealed) instead of springing shut. */
const REVEAL_THRESHOLD = DELETE_SLIDE_WIDTH / 2;
/**
 * Extends the painted square out to the full `sideHit` touch square — but NOT evenly. The button is
 * flush against the trailing edge of the wrap, and the wrap clips (`overflow: 'hidden'`), so slop
 * added on the right would sit outside the ancestor's bounds and never be hit-tested: an even spread
 * buys a 40 pt-wide target while claiming 44. All of the horizontal slop therefore goes left, where it
 * is inside the clip box — and it still stops clear of the fully open row's trailing edge
 * (`DELETE_SLIDE_WIDTH` − `sideHit`), so it can never steal a touch meant for the row itself.
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
 * finger's travel, clamped to the two ends of the track so an over-drag can neither tear the row past
 * the button nor push it right of shut.
 */
export function dragOffset(revealed: boolean, dx: number): number {
  const base = revealed ? -DELETE_SLIDE_WIDTH : 0;
  return Math.min(0, Math.max(-DELETE_SLIDE_WIDTH, base + dx));
}

/**
 * Whether letting go here leaves the button showing. It reads the UNCLAMPED position on purpose, so
 * the midpoint decides in both directions with no dead zone and no hysteresis gap: from shut, a
 * half-travel pull opens; from open, a half-travel push back still stays open, and one point more
 * closes.
 */
export function releasesOpen(revealed: boolean, dx: number): boolean {
  const base = revealed ? -DELETE_SLIDE_WIDTH : 0;
  return base + dx <= -REVEAL_THRESHOLD;
}

/**
 * The delete layer is painted — and, per the a11y fix above, present in the accessibility tree — only
 * once the row has actually moved. Belt and braces with the front row's own opaque background: even
 * if a future layout let the front row stop covering the layer, a shut row still cannot show a pixel
 * of the button. (`-0 === 0`, so a signed zero cannot defeat it.)
 */
export function deleteLayerOpacity(offset: number): number {
  return offset === 0 ? 0 : 1;
}

export type SwipeToDeleteRenderProps = {
  /** True while a finger is down on the row, for a consumer's own press-feedback background. */
  readonly dragging: boolean;
  /** True once the row is open. A consumer's own tap handler should call `close()` instead of its
   * normal action while this is true — the "first tap on an open row puts it away" rule #85 set. */
  readonly revealed: boolean;
  /** Puts the row away without deleting anything. */
  readonly close: () => void;
};

export type SwipeToDeleteProps = {
  readonly theme: Theme;
  /** Screen-reader name for the revealed button, e.g. `"Delete Greek yoghurt"`. */
  readonly deleteLabel: string;
  readonly onDelete: () => void;
  /** Applied to the outer wrap — a consumer supplies its own row height (`DayLogRow` uses
   * `size.row.logHit`; a future consumer may need a different one). */
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  readonly children: (props: SwipeToDeleteRenderProps) => ReactNode;
};

export function SwipeToDelete({ theme, deleteLabel, onDelete, style, testID = 'swipe-to-delete', children }: SwipeToDeleteProps) {
  const { state, text } = theme.color;

  const [revealed, setRevealed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);

  const close = (): void => {
    setRevealed(false);
    setOffset(0);
  };

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

  const opacity = deleteLayerOpacity(offset);
  const inTree = opacity !== 0;

  return (
    <View testID={`${testID}-wrap`} style={[styles.wrap, style]}>
      <View
        testID={`${testID}-delete-layer`}
        style={[StyleSheet.absoluteFill, styles.backLayer, { opacity }]}
        accessibilityElementsHidden={!inTree}
        importantForAccessibility={inTree ? 'yes' : 'no-hide-descendants'}
      >
        <Pressable
          testID={`${testID}-delete`}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${deleteLabel}`}
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
          <Ionicons testID={`${testID}-delete-icon`} name={glyph.delete} size={size.icon.deleteAction} color={text.onDanger} />
        </Pressable>
      </View>

      <View
        testID={`${testID}-front`}
        {...panResponder.panHandlers}
        style={[styles.front, { transform: [{ translateX: offset }] }]}
      >
        {children({ dragging, revealed, close })}
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
});
