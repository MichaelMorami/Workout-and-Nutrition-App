/**
 * `<SwipeToDelete>` (issue #141) — the gesture, slide geometry, reveal threshold, `hitSlop`
 * distribution and danger button extracted out of `DayLogRow` (issue #85) so #100/#101's Foods/Meals
 * settings rows can reuse them instead of cloning the row a second and third time.
 *
 * This suite proves the component in isolation, with a minimal generic content renderer standing in
 * for any future consumer's own row — not `DayLogRow`'s actual figures, which stay covered end-to-end
 * by `DayLogRow.test.tsx` (#85's own suite, unmodified, still green after the extraction).
 *
 * THE DRIVEN-SWIPE HARNESS BELOW IS A KNOWN, DELIBERATE DUPLICATE of `DayLogRow.test.tsx`'s own
 * `swipeBy`/`dragBy`/`touchEvent`. That duplication is exactly what #141's issue comment (opus review
 * of #140, follow-up 2) flagged: once a second consumer needs the same drive, it belongs in
 * qa-engineer's `test/**` as shared infrastructure. That move is qa-engineer's call and their path —
 * this PR does not reach across to make it; it is left on the issue for qa-engineer to pick up.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { act, configure, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, StyleSheet, Text } from 'react-native';
import { glyph, radius, size, themes, type Theme } from '../../theme/tokens';
import { DELETE_SLIDE_WIDTH, SwipeToDelete, deleteLayerOpacity, dragOffset, releasesOpen } from './SwipeToDelete';

// The delete layer intentionally leaves the accessibility tree at rest (the fix this file's own
// "SwipeToDelete accessibility" describe block asserts directly). RNTL 14 filters every query,
// `getByTestId` included, against that same "hidden from accessibility" definition by default — so
// the tests below that reach the button/layer *through* a shut row (proving it is still tappable and
// still measurable even while hidden from assistive tech) need to opt back in. See
// `DayLogRow.test.tsx`'s identical comment for the full reasoning.
configure({ defaultIncludeHiddenElements: true });

/** A minimal stand-in for a consumer's own row content — just enough to exercise `dragging`,
 * `revealed` and `close()`, without restating any real consumer's figures or layout. */
function Content({ dragging, revealed, close, onPress }: { dragging: boolean; revealed: boolean; close: () => void; onPress: () => void }) {
  return (
    <Pressable testID="row" onPress={revealed ? close : onPress} accessibilityRole="button" accessibilityLabel="Row">
      <Text testID="row-dragging">{String(dragging)}</Text>
    </Pressable>
  );
}

const renderSwipe = (props: Partial<React.ComponentProps<typeof SwipeToDelete>> = {}, onPress = jest.fn()) =>
  render(
    <SwipeToDelete theme={themes.dark} deleteLabel="Greek yoghurt" onDelete={jest.fn()} testID="row" {...props}>
      {({ dragging, revealed, close }) => <Content dragging={dragging} revealed={revealed} close={close} onPress={onPress} />}
    </SwipeToDelete>,
  );

describe('drag rules', () => {
  it('releasing at the midpoint opens from shut, and just under it springs back', () => {
    const midpoint = DELETE_SLIDE_WIDTH / 2;
    expect(releasesOpen(false, -midpoint)).toBe(true);
    expect(releasesOpen(false, -(midpoint - 0.1))).toBe(false);
    expect(releasesOpen(false, 0)).toBe(false);
  });

  it('pushing an open row back stays open up to the midpoint, and closes just past it', () => {
    const midpoint = DELETE_SLIDE_WIDTH / 2;
    expect(releasesOpen(true, midpoint)).toBe(true);
    expect(releasesOpen(true, midpoint + 1)).toBe(false);
  });

  it('over-dragging clamps to the two ends of the track, in both directions and from both states', () => {
    expect(dragOffset(false, -1000)).toBe(-DELETE_SLIDE_WIDTH);
    expect(dragOffset(false, 1000)).toBe(0);
    expect(dragOffset(true, -1000)).toBe(-DELETE_SLIDE_WIDTH);
    expect(dragOffset(true, 1000)).toBe(0);
  });

  it('the delete layer is painted the moment the row leaves its resting place, and only then', () => {
    expect(deleteLayerOpacity(0)).toBe(0);
    expect(deleteLayerOpacity(-0)).toBe(0);
    expect(deleteLayerOpacity(-1)).toBe(1);
    expect(deleteLayerOpacity(-DELETE_SLIDE_WIDTH)).toBe(1);
  });

  it('the geometry comes from tokens alone — never a restated artboard literal', () => {
    expect(DELETE_SLIDE_WIDTH).toBe(size.deleteButton.gap + size.deleteButton.side);
  });
});

function renderedGlyph(name: keyof typeof Ionicons.glyphMap): string {
  const codepoint = Ionicons.glyphMap[name];
  if (typeof codepoint !== 'number') throw new Error(`glyph "${name}" is a ligature, not a codepoint`);
  return String.fromCodePoint(codepoint);
}

const themeCases: readonly (readonly [string, Theme])[] = [
  ['dark', themes.dark],
  ['light', themes.light],
];

describe('SwipeToDelete button', () => {
  it.each(themeCases)('%s: an icon-only square in state.danger, no text anywhere', async (_, theme) => {
    await renderSwipe({ theme });

    expect(screen.queryByText(/delete/i)).toBeNull();
    const icon = screen.getByTestId('row-delete-icon');
    expect(icon.children).toEqual([renderedGlyph(glyph.delete)]);
    expect(StyleSheet.flatten(icon.props.style)).toEqual(
      expect.objectContaining({ fontSize: size.icon.deleteAction, color: theme.color.text.onDanger }),
    );
    expect(StyleSheet.flatten(screen.getByTestId('row-delete').props.style)).toEqual(
      expect.objectContaining({
        width: size.deleteButton.side,
        height: size.deleteButton.side,
        borderRadius: radius.sm,
        backgroundColor: theme.color.state.danger,
      }),
    );
  });

  it('the touch square is a real 44pt target, slop distributed left where the wrap is not clipping it', async () => {
    await renderSwipe();
    const { top, bottom, left, right } = screen.getByTestId('row-delete').props.hitSlop;

    expect(right).toBe(0);
    expect(size.deleteButton.side + left + right).toBe(size.deleteButton.sideHit);
    expect(size.deleteButton.side + top + bottom).toBe(size.deleteButton.sideHit);
    expect(size.deleteButton.sideHit).toBeGreaterThanOrEqual(size.tapTargetMin);
    expect(size.deleteButton.side + left).toBeLessThanOrEqual(DELETE_SLIDE_WIDTH);
  });

  it('the screen-reader label is built from the supplied deleteLabel, not a hard-coded name', async () => {
    await renderSwipe({ deleteLabel: 'Post-workout shake' });
    expect(screen.getByTestId('row-delete').props.accessibilityLabel).toBe('Delete Post-workout shake');
  });

  it('tapping the button calls onDelete even while the row is shut — the button is always mounted, just covered', async () => {
    const onDelete = jest.fn();
    await renderSwipe({ onDelete });

    await fireEvent.press(screen.getByTestId('row-delete'));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it.each(themeCases)('%s: at rest the delete layer is fully transparent, so nothing bleeds under the content', async (_, theme) => {
    await renderSwipe({ theme });
    expect(StyleSheet.flatten(screen.getByTestId('row-delete-layer').props.style)).toEqual(
      expect.objectContaining({ opacity: 0 }),
    );
  });
});

describe('SwipeToDelete accessibility (issue #141 follow-up on #140)', () => {
  it('the delete control leaves the accessibility tree at rest', async () => {
    await renderSwipe();
    const layer = screen.getByTestId('row-delete-layer');
    expect(layer.props.accessibilityElementsHidden).toBe(true);
    expect(layer.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  // The two props above are RNTL's own hidden-detection *inputs*, not the outcome a screen-reader
  // user experiences. This pair asserts the outcome directly, black-box, the same way RNTL's default
  // `getByTestId`/`queryByTestId` behave for every other component in this codebase (i.e. with
  // `includeHiddenElements` off, undoing this file's own `configure` opt-in for just these two
  // queries) — so a future change to which props RNTL honours, or a regression in this component that
  // still happens to leave those two props correct, cannot both slip through and leave this file green.
  it('at rest, the delete button is unreachable by a plain (non-hidden-aware) query', async () => {
    await renderSwipe();
    expect(screen.queryByTestId('row-delete', { includeHiddenElements: false })).toBeNull();
  });

  it('once revealed, the delete button is reachable again by that same plain query', async () => {
    await renderSwipe();
    await swipeBy(-DELETE_SLIDE_WIDTH);
    expect(screen.queryByTestId('row-delete', { includeHiddenElements: false })).not.toBeNull();
  });
});

/**
 * A driven swipe — the real `PanResponder` this component builds, fed a real touch history. Same
 * fixture shape `DayLogRow.test.tsx` uses (and the same reasons for its two required properties — see
 * that file's own comment); kept local here per the duplication note at the top of this file.
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
  readonly onResponderTerminate: (event: ResponderEvent) => void;
};

const frontProps = (): ResponderProps => screen.getByTestId('row-front').props as ResponderProps;

const swipeBy = async (dx: number): Promise<void> => {
  const front = frontProps();
  await act(() => {
    front.onResponderGrant(touchEvent(200, 200));
    front.onResponderMove(touchEvent(200, 200 + dx));
    front.onResponderRelease(touchEvent(200, 200 + dx));
  });
};

const frontOffset = (): number => {
  const style = StyleSheet.flatten(screen.getByTestId('row-front').props.style) as {
    readonly transform: readonly { readonly translateX: number }[];
  };
  const [slide] = style.transform;
  if (slide === undefined) throw new Error('the front layer is not on a translateX track');
  return slide.translateX;
};

const layerOpacity = (): number => {
  const style = StyleSheet.flatten(screen.getByTestId('row-delete-layer').props.style) as { readonly opacity: number };
  return style.opacity;
};

describe('SwipeToDelete gesture', () => {
  it('swiping open reveals the button and translates the content, in a fresh consumer that never mentioned DayLogRow', async () => {
    await renderSwipe();
    expect(layerOpacity()).toBe(0);

    await swipeBy(-DELETE_SLIDE_WIDTH);

    expect(frontOffset()).toBe(-DELETE_SLIDE_WIDTH);
    expect(layerOpacity()).toBe(1);
  });

  it('passes dragging=true to the content only while a finger is down', async () => {
    await renderSwipe();
    expect(screen.getByTestId('row-dragging')).toHaveTextContent('false');

    const front = frontProps();
    await act(() => {
      front.onResponderGrant(touchEvent(200, 200));
    });
    expect(screen.getByTestId('row-dragging')).toHaveTextContent('true');

    await act(() => {
      front.onResponderRelease(touchEvent(200, 200));
    });
    expect(screen.getByTestId('row-dragging')).toHaveTextContent('false');
  });

  it('close() puts an open row away without calling onDelete or the content\'s own onPress', async () => {
    const onDelete = jest.fn();
    const onPress = jest.fn();
    await renderSwipe({ onDelete }, onPress);

    await swipeBy(-DELETE_SLIDE_WIDTH);
    await fireEvent.press(screen.getByTestId('row'));

    expect(onPress).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(frontOffset()).toBe(0);
    expect(layerOpacity()).toBe(0);
  });

  /**
   * Follow-up #1 from the opus review of #140, parked on #141: `onPanResponderTerminate` had no test
   * of its own before this extraction. A terminated gesture — the OS handing the touch to a competing
   * responder mid-drag — must spring the row shut, not leave it stranded half-open.
   */
  it('a terminated drag springs the row shut, not left half-open', async () => {
    await renderSwipe();

    const front = frontProps();
    await act(() => {
      front.onResponderGrant(touchEvent(200, 200));
      front.onResponderMove(touchEvent(200, 200 - 30));
    });
    expect(frontOffset()).toBe(-30);
    expect(layerOpacity()).toBe(1);
    expect(screen.getByTestId('row-dragging')).toHaveTextContent('true');

    await act(() => {
      front.onResponderTerminate(touchEvent(200, 200 - 30));
    });

    expect(frontOffset()).toBe(0);
    expect(layerOpacity()).toBe(0);
    expect(screen.getByTestId('row-dragging')).toHaveTextContent('false');
  });

  it('a terminated drag springs an already-open row shut too', async () => {
    await renderSwipe();
    await swipeBy(-DELETE_SLIDE_WIDTH);

    const front = frontProps();
    await act(() => {
      front.onResponderGrant(touchEvent(200, 200));
      front.onResponderTerminate(touchEvent(200, 200));
    });

    expect(frontOffset()).toBe(0);
    expect(layerOpacity()).toBe(0);
  });
});
