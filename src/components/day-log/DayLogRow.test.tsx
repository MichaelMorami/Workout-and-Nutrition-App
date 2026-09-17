/**
 * `<DayLogRow>` — one row of the Today log (issue #42): its own figures, tap to edit, and the
 * swipe-revealed Delete action. Behaviour only — the swipe gesture itself is `PanResponder`-driven
 * (`PortionSheet.tsx`'s own precedent for "no new native dependency").
 *
 * PRESSING THE BUTTON BY testID IS NOT ENOUGH, AND THAT IS THE POINT OF THE DRIVEN DRAG BELOW. The
 * Delete action is always mounted under the row, so a test *can* press it on a shut row — but every
 * assertion made that way describes the row at offset 0, where the delete layer is deliberately
 * invisible. A test suite built only on that shortcut stays green if the button never appears on
 * swipe at all. So the swipe is driven for real here (`swipeBy`), the open state is asserted in the
 * state it actually ships in, and the three drag rules are additionally pinned at their exact
 * boundaries as pure functions.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { DayLogEntry } from '../../db';
import { glyph, radius, size, themes, type Theme } from '../../theme/tokens';
import {
  DayLogRow,
  DELETE_SLIDE_WIDTH,
  deleteLayerOpacity,
  dragOffset,
  releasesOpen,
  timeLabel,
} from './DayLogRow';

const foodEntry: DayLogEntry = {
  id: 'log-1',
  updatedAt: 0,
  deleted: 0,
  loggedAt: 0,
  localDate: '2025-03-10',
  localMinute: 480, // 08:00
  foodId: 'food-1',
  mealId: null,
  qty: 1,
  grams: 170,
  ml: null,
  kcal: 120,
  protein: 20,
  slot: 'breakfast',
  foodName: 'Greek yoghurt',
  brand: 'Fage',
  servingLabel: '1 pot',
  mealName: null,
};

const renderRow = (props: Partial<React.ComponentProps<typeof DayLogRow>> = {}) =>
  render(
    <DayLogRow entry={foodEntry} theme={themes.dark} onPress={jest.fn()} onDelete={jest.fn()} testID="row" {...props} />,
  );

describe('timeLabel', () => {
  it('formats minutes-after-midnight as HH:MM', () => {
    expect(timeLabel(0)).toBe('00:00');
    expect(timeLabel(480)).toBe('08:00');
    expect(timeLabel(1439)).toBe('23:59');
    expect(timeLabel(65)).toBe('01:05');
  });
});

describe('DayLogRow', () => {
  it('shows the time, name, kcal and protein', async () => {
    await renderRow();
    expect(screen.getByTestId('row-time')).toHaveTextContent('08:00');
    expect(screen.getByTestId('row-name')).toHaveTextContent('Greek yoghurt');
    expect(screen.getByTestId('row-kcal')).toHaveTextContent('120 kcal');
    expect(screen.getByTestId('row-protein')).toHaveTextContent('20 g protein');
  });

  it('falls back to the meal name for a meal row', async () => {
    await renderRow({
      entry: { ...foodEntry, foodId: null, mealId: 'meal-1', mealName: 'Post-workout shake', foodName: null },
    });
    expect(screen.getByTestId('row-name')).toHaveTextContent('Post-workout shake');
  });

  it('tapping the row calls onPress with the entry', async () => {
    const onPress = jest.fn();
    await renderRow({ onPress });

    await fireEvent.press(screen.getByTestId('row'));

    expect(onPress).toHaveBeenCalledWith(foodEntry);
  });

  it('tapping the revealed Delete action calls onDelete, never a confirmation dialog', async () => {
    const onDelete = jest.fn();
    const onPress = jest.fn();
    await renderRow({ onDelete, onPress });

    await fireEvent.press(screen.getByTestId('row-delete'));

    expect(onDelete).toHaveBeenCalledWith(foodEntry);
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('exposes an accessibility delete action for screen readers, equivalent to a physical swipe', async () => {
    const onDelete = jest.fn();
    await renderRow({ onDelete });

    const row = screen.getByTestId('row');
    expect(row.props.accessibilityActions).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'delete' })]));

    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(onDelete).toHaveBeenCalledWith(foodEntry);
  });

  it('has accessibility labels and a >=44pt target on the row and the delete action', async () => {
    await renderRow();

    const row = screen.getByTestId('row');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Greek yoghurt, 120 kcal, 20 g protein, logged at 08:00. Double tap to edit.');

    const del = screen.getByTestId('row-delete');
    expect(del.props.accessibilityRole).toBe('button');
    expect(del.props.accessibilityLabel).toBe('Delete Greek yoghurt');
  });
});

/** The literal character Ionicons paints for a glyph name — what lands on screen, not the name.
 * `GlyphMap` is typed `string | number` because an icon set may use ligatures; Ionicons' entries are
 * codepoints, so this narrows rather than asserting a type over the whole map. */
function renderedGlyph(name: keyof typeof Ionicons.glyphMap): string {
  const codepoint = Ionicons.glyphMap[name];
  if (typeof codepoint !== 'number') throw new Error(`glyph "${name}" is a ligature, not a codepoint`);
  return String.fromCodePoint(codepoint);
}

const themeCases: readonly (readonly [string, Theme])[] = [
  ['dark', themes.dark],
  ['light', themes.light],
];

describe('DayLogRow delete button (issue #85)', () => {
  it.each(themeCases)('%s: the delete button is the trash icon alone — no "Delete" text anywhere in the row', async (_, theme) => {
    await renderRow({ theme });

    expect(screen.queryByText(/delete/i)).toBeNull();
    const icon = screen.getByTestId('row-delete-icon');
    expect(icon.children).toEqual([renderedGlyph(glyph.delete)]);
    expect(StyleSheet.flatten(icon.props.style)).toEqual(
      expect.objectContaining({ fontSize: size.icon.deleteAction, color: theme.color.text.onDanger }),
    );
    expect(screen.getByTestId('row-delete')).toContainElement(icon);
  });

  it.each(themeCases)('%s: the button is a painted square in state.danger with a >=44pt hit area', async (_, theme) => {
    await renderRow({ theme });

    const del = screen.getByTestId('row-delete');
    expect(StyleSheet.flatten(del.props.style)).toEqual(
      expect.objectContaining({
        width: size.deleteButton.side,
        height: size.deleteButton.side,
        borderRadius: radius.sm,
        backgroundColor: theme.color.state.danger,
      }),
    );
  });

  it('the touch square is a real 44 pt: the horizontal slop goes left, where the row is not clipping it', async () => {
    await renderRow();
    const { top, bottom, left, right } = screen.getByTestId('row-delete').props.hitSlop;

    // The painted square is flush against the trailing edge of a `overflow: 'hidden'` wrapper, so
    // slop on the RIGHT lands outside the ancestor and is never hit-tested — it would buy a 40 pt
    // target while the tokens promise 44. All of it goes left instead.
    expect(right).toBe(0);
    expect(size.deleteButton.side + left + right).toBe(size.deleteButton.sideHit);
    expect(size.deleteButton.side + top + bottom).toBe(size.deleteButton.sideHit);
    expect(size.deleteButton.sideHit).toBeGreaterThanOrEqual(size.tapTargetMin);

    // ...and the leftward slop still stops clear of the open row's trailing edge, so it cannot
    // swallow a touch meant for the row itself.
    expect(size.deleteButton.side + left).toBeLessThanOrEqual(DELETE_SLIDE_WIDTH);
  });

  it("the row slides open by 46 pt — the DeletePane canvas's own travel, gap 10 then the 36 pt square", () => {
    // Pinned to the approved artboard (`design/tab-icons/canvas/DeletePane.dc.html`, `left:-46px`),
    // not restated from the tokens it is built out of: if a token moves, this fails and design and
    // code have to agree again.
    expect(DELETE_SLIDE_WIDTH).toBe(46);
    expect(size.deleteButton.gap).toBe(10);
    expect(size.deleteButton.side).toBe(36);
  });

  it.each(themeCases)('%s: at rest the front row is opaque and the delete layer is hidden, so nothing bleeds under the row', async (_, theme) => {
    await renderRow({ theme });

    expect(StyleSheet.flatten(screen.getByTestId('row').props.style)).toEqual(
      expect.objectContaining({ backgroundColor: theme.color.bg.canvas }),
    );
    expect(StyleSheet.flatten(screen.getByTestId('row-delete-layer').props.style)).toEqual(
      expect.objectContaining({ opacity: 0 }),
    );
  });

  it('tapping the trash button still deletes, and the accessibility label and action are unchanged', async () => {
    const onDelete = jest.fn();
    await renderRow({ onDelete });

    const del = screen.getByTestId('row-delete');
    expect(del.props.accessibilityLabel).toBe('Delete Greek yoghurt');
    await fireEvent.press(del);
    expect(onDelete).toHaveBeenCalledWith(foodEntry);

    const row = screen.getByTestId('row');
    expect(row.props.accessibilityActions).toEqual([{ name: 'delete', label: 'Delete' }]);
  });
});

/**
 * The three rules the swipe is made of, asserted at the exact values where they change their mind.
 * `REVEAL_THRESHOLD` is half the travel — 23 pt — and the release rule reads the *unclamped*
 * position, so the midpoint has to belong to "open" from both directions with no dead zone.
 */
describe('drag rules (issue #85)', () => {
  it('releasing at the 23 pt midpoint opens from shut, and 22.9 springs back', () => {
    expect(releasesOpen(false, -23)).toBe(true);
    expect(releasesOpen(false, -22.9)).toBe(false);
    expect(releasesOpen(false, -100)).toBe(true);
    expect(releasesOpen(false, 0)).toBe(false);
  });

  it('pushing an open row back stays open up to 23 pt, and closes at 24', () => {
    expect(releasesOpen(true, 23)).toBe(true);
    expect(releasesOpen(true, 24)).toBe(false);
    expect(releasesOpen(true, 0)).toBe(true);
    expect(releasesOpen(true, 100)).toBe(false);
  });

  it('over-dragging clamps to the two ends of the track, in both directions and from both states', () => {
    expect(dragOffset(false, -1000)).toBe(-DELETE_SLIDE_WIDTH);
    expect(dragOffset(false, 1000)).toBe(0);
    expect(dragOffset(true, -1000)).toBe(-DELETE_SLIDE_WIDTH);
    expect(dragOffset(true, 1000)).toBe(0);
    expect(dragOffset(false, -20)).toBe(-20);
    expect(dragOffset(true, 20)).toBe(-DELETE_SLIDE_WIDTH + 20);
  });

  it('the delete layer is painted the moment the row leaves its resting place, and only then', () => {
    expect(deleteLayerOpacity(0)).toBe(0);
    expect(deleteLayerOpacity(-0)).toBe(0);
    expect(deleteLayerOpacity(-1)).toBe(1);
    expect(deleteLayerOpacity(-DELETE_SLIDE_WIDTH)).toBe(1);
  });
});

/**
 * A driven swipe — the real `PanResponder` the component built, fed a real touch history.
 *
 * TWO THINGS THE FIXTURE HAS TO GET RIGHT. First, `PanResponder` ignores `nativeEvent.pageX`: it
 * accumulates centroid changes out of `event.touchHistory` (`TouchHistoryMath.centroidDimension`),
 * so `gestureState.dx` is only as real as the touch bank handed to it — one active touch at index 0,
 * `touchActive`, and a `currentTimeStamp` strictly later than the one the gesture has already
 * accounted for, because a repeated timestamp is dropped by `PanResponder`'s duplicate-dispatch
 * guard. Second, the handlers are invoked through their props inside `act` rather than through
 * `fireEvent`: RNTL decides whether a touch event is "enabled" by calling this row's own
 * `onStartShouldSetResponder`/`onMoveShouldSetResponder` with NO arguments and a pristine
 * `gestureState`, and this row answers `false` to both by design (it claims a gesture only once the
 * finger has travelled 6 pt horizontally), so `fireEvent` would swallow the very first dispatch and
 * the drag could never start. That gate is an artifact of the fixture, not of the app — the real
 * responder system calls the same function with a populated gesture and gets `true`, which is what
 * `rowClaimsDrag` below asserts directly.
 */
let clock = 0;

const touchEvent = (fromX: number, toX: number, toY = 0) => {
  const previousTimeStamp = (clock += 100);
  const currentTimeStamp = (clock += 100);
  return {
    touchHistory: {
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: currentTimeStamp,
      numberActiveTouches: 1,
      touchBank: [
        {
          touchActive: true,
          startPageX: fromX,
          startPageY: 0,
          startTimeStamp: previousTimeStamp,
          currentPageX: toX,
          currentPageY: toY,
          currentTimeStamp,
          previousPageX: fromX,
          previousPageY: 0,
          previousTimeStamp,
        },
      ],
    },
    nativeEvent: { pageX: toX, pageY: toY, touches: [], changedTouches: [] },
  };
};

type ResponderEvent = ReturnType<typeof touchEvent>;
type ResponderProps = {
  readonly onResponderGrant: (event: ResponderEvent) => void;
  readonly onResponderMove: (event: ResponderEvent) => void;
  readonly onResponderRelease: (event: ResponderEvent) => void;
  readonly onMoveShouldSetResponderCapture: (event: ResponderEvent) => boolean;
  readonly onMoveShouldSetResponder: (event: ResponderEvent) => boolean;
};

const frontProps = (): ResponderProps => screen.getByTestId('row-front').props as ResponderProps;

/** Grant, move, release — the order the responder system dispatches once the row has the gesture. */
const swipeBy = async (dx: number): Promise<void> => {
  const front = frontProps();
  await act(() => {
    front.onResponderGrant(touchEvent(200, 200));
    front.onResponderMove(touchEvent(200, 200 + dx));
    front.onResponderRelease(touchEvent(200, 200 + dx));
  });
};

/** Drag without letting go, so the row is left mid-gesture. */
const dragBy = async (dx: number): Promise<void> => {
  const front = frontProps();
  await act(() => {
    front.onResponderGrant(touchEvent(200, 200));
    front.onResponderMove(touchEvent(200, 200 + dx));
  });
};

/** Whether the row takes the gesture away from the list it is scrolling inside. The capture pass is
 * what populates `gestureState` before the bubbling gate reads it, exactly as on device. */
const rowClaimsDrag = (dx: number, dy: number): boolean => {
  const front = frontProps();
  front.onMoveShouldSetResponderCapture(touchEvent(200, 200 + dx, dy));
  return front.onMoveShouldSetResponder(touchEvent(200, 200 + dx, dy));
};

const frontOffset = (): number => {
  const style = StyleSheet.flatten(screen.getByTestId('row-front').props.style) as {
    readonly transform: readonly { readonly translateX: number }[];
  };
  const [slide] = style.transform;
  if (slide === undefined) throw new Error('the front layer is not on a translateX track at all');
  return slide.translateX;
};

const layerOpacity = (): number => {
  const style = StyleSheet.flatten(screen.getByTestId('row-delete-layer').props.style) as { readonly opacity: number };
  return style.opacity;
};

describe('DayLogRow swiped open (issue #85)', () => {
  it.each(themeCases)('%s: swiping the row open reveals the trash square — the state it ships in', async (_, theme) => {
    await renderRow({ theme });
    expect(layerOpacity()).toBe(0);

    await swipeBy(-DELETE_SLIDE_WIDTH);

    // The row really moved, and the layer under it is really painted. Hard-coding the layer to
    // `opacity: 0` — the shape of mistake a shut-row-only suite cannot see — fails here.
    expect(frontOffset()).toBe(-DELETE_SLIDE_WIDTH);
    expect(layerOpacity()).toBe(1);

    // The same glyph and square as before, now asserted with the row open rather than shut.
    const icon = screen.getByTestId('row-delete-icon');
    expect(icon.children).toEqual([renderedGlyph(glyph.delete)]);
    expect(StyleSheet.flatten(icon.props.style)).toEqual(
      expect.objectContaining({ fontSize: size.icon.deleteAction, color: theme.color.text.onDanger }),
    );
    expect(StyleSheet.flatten(screen.getByTestId('row-delete').props.style)).toEqual(
      expect.objectContaining({
        width: size.deleteButton.side,
        height: size.deleteButton.side,
        backgroundColor: theme.color.state.danger,
      }),
    );
    expect(screen.queryByText(/delete/i)).toBeNull();
  });

  it('the button appears the moment the row moves, before it is anywhere near open', async () => {
    await renderRow();

    await dragBy(-2);

    expect(frontOffset()).toBe(-2);
    expect(layerOpacity()).toBe(1);
  });

  it('a 23 pt pull opens the row and keeps it open; 22.9 springs it shut and hides the button again', async () => {
    await renderRow();

    await swipeBy(-22.9);
    expect(frontOffset()).toBe(0);
    expect(layerOpacity()).toBe(0);

    await swipeBy(-23);
    expect(frontOffset()).toBe(-DELETE_SLIDE_WIDTH);
    expect(layerOpacity()).toBe(1);
  });

  it('pushing an open row back stays open at the midpoint and closes past it', async () => {
    await renderRow();

    await swipeBy(-DELETE_SLIDE_WIDTH);
    await swipeBy(23);
    expect(frontOffset()).toBe(-DELETE_SLIDE_WIDTH); // the midpoint belongs to "open" from both sides

    await swipeBy(24);
    expect(frontOffset()).toBe(0);
    expect(layerOpacity()).toBe(0);
  });

  it('the first tap on an open row puts it away instead of opening the editor', async () => {
    const onPress = jest.fn();
    await renderRow({ onPress });

    await swipeBy(-DELETE_SLIDE_WIDTH);
    await fireEvent.press(screen.getByTestId('row'));

    expect(onPress).not.toHaveBeenCalled();
    expect(frontOffset()).toBe(0);
    expect(layerOpacity()).toBe(0);
  });

  it('over-dragging cannot tear the row past the button, and dragging right of shut does nothing', async () => {
    await renderRow();

    await dragBy(-400);
    expect(frontOffset()).toBe(-DELETE_SLIDE_WIDTH);

    await swipeBy(-400);
    expect(frontOffset()).toBe(-DELETE_SLIDE_WIDTH);

    await swipeBy(400);
    expect(frontOffset()).toBe(0);
    expect(layerOpacity()).toBe(0);
  });

  it('tapping the trash on a row that was really swiped open deletes, with its label intact', async () => {
    const onDelete = jest.fn();
    await renderRow({ onDelete });

    await swipeBy(-DELETE_SLIDE_WIDTH);
    const del = screen.getByTestId('row-delete');
    expect(del.props.accessibilityLabel).toBe('Delete Greek yoghurt');

    await fireEvent.press(del);
    expect(onDelete).toHaveBeenCalledWith(foodEntry);
  });
});

/** Each case gets its own row: `gestureState` accumulates across dispatches until the responder is
 * granted or released, so reusing one row would carry the previous drag into the next. */
const gateCases: readonly (readonly [string, number, number, boolean])[] = [
  ['a firm leftward drag is the row\'s own swipe', -40, 4, true],
  ['a 6 pt twitch is below the slop and is not a swipe', -6, 0, false],
  ['a mostly-vertical drag belongs to the list, which has to keep scrolling', -20, 40, false],
];

describe('DayLogRow gesture gate (issue #85)', () => {
  it.each(gateCases)('%s', async (_, dx, dy, claimed) => {
    await renderRow();
    expect(rowClaimsDrag(dx, dy)).toBe(claimed);
  });
});
