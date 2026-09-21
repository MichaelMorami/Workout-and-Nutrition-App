/**
 * `<FormFrame>` — issue #207. Behaviour only: the divider's fade math, the footer's bottom padding
 * rule, and which of `KeyboardAvoidingView`/plain `View` wraps the frame. Rendered inside a real
 * `<SafeAreaProvider initialMetrics={…}>` throughout (spec section 5's own instruction) — never a
 * mocked `useSafeAreaInsets`.
 */
import { act, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Keyboard, Text, type EmitterSubscription } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { formFooterPaddingBottom, layout, motion, themes } from '../../theme/tokens';
import { FormFrame } from './FormFrame';
import { __resetAnimations, __setReducedMotion, __timingCalls } from './test-support/reanimated-mock';

// jest hoists `jest.mock` above every import in this file (babel-plugin-jest-hoist), so the factory
// cannot reference the `./test-support/reanimated-mock` import above — only a `require` inside the
// factory itself resolves at the point jest actually calls it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./test-support/reanimated-mock'));

const theme = themes.dark;
// The semantic token for this exact hairline. `<FormFrame>` takes it as a prop rather than reading
// `color.line.hairline` itself (PR #220 review) — `<FoodForm>` passes this same token.
const dividerColor = theme.color.foodForm.footerDivider;

// Mirrors `src/hooks/useKeyboardVisible.test.tsx`'s own helper — `Keyboard` has no way to fire a
// fake event on it, so this stubs `addListener` and hands the test a `fire`.
function mockKeyboardListeners() {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((eventType, listener) => {
    const existing = listeners.get(eventType) ?? [];
    existing.push(listener as (event: unknown) => void);
    listeners.set(eventType, existing);
    return { remove: jest.fn() } as unknown as EmitterSubscription;
  });
  return {
    fire: (eventType: string) => {
      (listeners.get(eventType) ?? []).forEach((listener) => listener({}));
    },
  };
}

// A fixed inset, independent of whatever `initialWindowMetrics` resolves to under jest-expo/ios —
// the footer's `formFooterPaddingBottom()` math is exercised against a value this file controls.
const metrics = { ...initialWindowMetrics, insets: { top: 0, left: 0, right: 0, bottom: 34 } } as typeof initialWindowMetrics;

function renderFrame(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);
}

afterEach(() => {
  __resetAnimations();
  jest.restoreAllMocks();
});

describe('FormFrame', () => {
  it('renders the frame, body and footer testIDs, with children in the body and footer content in the footer', async () => {
    await renderFrame(
      <FormFrame footerBg={theme.color.bg.surface} dividerColor={dividerColor} footer={<Text>Save</Text>} testID="frame">
        <Text>A field</Text>
      </FormFrame>,
    );
    expect(screen.getByTestId('frame-frame')).toBeTruthy();
    expect(screen.getByTestId('frame-body')).toBeTruthy();
    expect(screen.getByTestId('frame-footer')).toBeTruthy();
    expect(screen.getByText('A field')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
  });

  // PR #220 review, B1.1: the whole point of decision 13 is *where* the footer lives, and
  // `getByText('Save')` is equally true when Save is the scroll view's last child — the shape this
  // frame exists to replace. `within` is what actually fails when `{footer}` moves back inside the
  // `<ScrollView>`: the footer is a sibling of the body, never its descendant.
  it('renders the footer outside the scrolling body — a pinned sibling, not the body’s last child', async () => {
    await renderFrame(
      <FormFrame footerBg={theme.color.bg.surface} dividerColor={dividerColor} footer={<Text>Save</Text>} testID="frame">
        <Text>A field</Text>
      </FormFrame>,
    );
    expect(within(screen.getByTestId('frame-footer')).getByText('Save')).toBeTruthy();
    expect(within(screen.getByTestId('frame-body')).queryByText('Save')).toBeNull();
    // …and the body still holds the form itself, so "the footer is outside the body" was not won by
    // emptying the body instead.
    expect(within(screen.getByTestId('frame-body')).getByText('A field')).toBeTruthy();
  });

  // PR #220 review: `foodForm.footerDivider` is the semantic token design-lead published for this
  // line. The frame takes it as a prop instead of reading `color.line.hairline` itself, so this
  // asserts the caller's token is what actually gets painted.
  it('paints the divider with the colour its caller passed, not a colour of its own', async () => {
    // Deliberately *not* `foodForm.footerDivider` here: that token resolves to the same
    // `color.line.hairline` the frame used to read directly, so asserting it would pass either way.
    // A different token proves the prop is what drives the paint.
    const distinct = theme.color.foodForm.fieldBorderError;
    expect(distinct).not.toBe(dividerColor);
    await renderFrame(
      <FormFrame footerBg={theme.color.bg.surface} dividerColor={distinct} footer={<Text>Save</Text>} testID="frame">
        <Text>A field</Text>
      </FormFrame>,
    );
    const divider = screen.getByTestId('frame-footer-divider');
    const style = [divider.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
    expect(style.backgroundColor).toBe(distinct);
  });

  it('wraps the frame in an avoider by default (avoidsKeyboard defaults true)', async () => {
    // `behavior="padding"` itself is not observable through this black-box renderer — RN's
    // `KeyboardAvoidingView` consumes `behavior` and never forwards it onto the host node it
    // renders — so this only asserts the avoider is present at all; the literal is FormFrame's
    // own module doc ("`behavior: 'padding'` on both platforms") plus source review.
    await renderFrame(
      <FormFrame footerBg={theme.color.bg.surface} dividerColor={dividerColor} footer={<Text>Save</Text>} testID="frame">
        <Text>A field</Text>
      </FormFrame>,
    );
    expect(screen.getByTestId('frame-avoider')).toBeTruthy();
  });

  it('renders a plain View with no avoider when avoidsKeyboard is false', async () => {
    await renderFrame(
      <FormFrame footerBg={theme.color.bg.surface} dividerColor={dividerColor} footer={<Text>Save</Text>} avoidsKeyboard={false} testID="frame">
        <Text>A field</Text>
      </FormFrame>,
    );
    expect(screen.queryByTestId('frame-avoider')).toBeNull();
    expect(screen.getByTestId('frame-frame')).toBeTruthy();
  });

  it('never sets automaticallyAdjustKeyboardInsets, and persists taps on the body', async () => {
    await renderFrame(
      <FormFrame footerBg={theme.color.bg.surface} dividerColor={dividerColor} footer={<Text>Save</Text>} testID="frame">
        <Text>A field</Text>
      </FormFrame>,
    );
    const body = screen.getByTestId('frame-body');
    expect(body.props.keyboardShouldPersistTaps).toBe('handled');
    expect(body.props.automaticallyAdjustKeyboardInsets).toBeUndefined();
  });

  it('applies layout.gutter as the side padding on the body content and the footer', async () => {
    await renderFrame(
      <FormFrame footerBg={theme.color.bg.surface} dividerColor={dividerColor} footer={<Text>Save</Text>} testID="frame">
        <Text>A field</Text>
      </FormFrame>,
    );
    const body = screen.getByTestId('frame-body');
    const bodyPadding = [body.props.contentContainerStyle].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
    expect(bodyPadding.paddingHorizontal).toBe(layout.gutter);

    const footer = screen.getByTestId('frame-footer');
    const footerStyle = [footer.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
    expect(footerStyle.paddingHorizontal).toBe(layout.gutter);
  });

  it('pads the footer with the safe-area inset when the keyboard is down', async () => {
    await renderFrame(
      <FormFrame footerBg={theme.color.bg.surface} dividerColor={dividerColor} footer={<Text>Save</Text>} testID="frame">
        <Text>A field</Text>
      </FormFrame>,
    );
    const footer = screen.getByTestId('frame-footer');
    const footerStyle = [footer.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
    expect(footerStyle.paddingBottom).toBe(formFooterPaddingBottom(false, 34));
  });

  it('drops to the bare pad once the keyboard shows', async () => {
    const keyboard = mockKeyboardListeners();
    await renderFrame(
      <FormFrame footerBg={theme.color.bg.surface} dividerColor={dividerColor} footer={<Text>Save</Text>} testID="frame">
        <Text>A field</Text>
      </FormFrame>,
    );
    await act(async () => {
      keyboard.fire('keyboardWillShow');
    });
    const footer = screen.getByTestId('frame-footer');
    const footerStyle = [footer.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
    expect(footerStyle.paddingBottom).toBe(formFooterPaddingBottom(true, 34));
  });

  describe('the divider', () => {
    // A sync `act(() => {...})` returns before this concurrent-root test renderer flushes the
    // `setCanScroll` these three calls schedule (the same gap `useKeyboardVisible.test.tsx`
    // documents) — only the awaited async form guarantees the state (and the effect it triggers)
    // has landed by the time the assertion after this reads the divider's style.
    async function fireScrollState(canScroll: boolean) {
      const body = screen.getByTestId('frame-body');
      await act(async () => {
        body.props.onLayout({ nativeEvent: { layout: { height: 400 } } });
        body.props.onContentSizeChange(320, canScroll ? 900 : 300);
        body.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
      });
    }

    it('starts hidden when the body fits with no scrolling needed', async () => {
      await renderFrame(
        <FormFrame footerBg={theme.color.bg.surface} dividerColor={dividerColor} footer={<Text>Save</Text>} testID="frame">
          <Text>A field</Text>
        </FormFrame>,
      );
      await fireScrollState(false);
      const divider = screen.getByTestId('frame-footer-divider');
      const style = [divider.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
      expect(style.opacity).toBe(0);
    });

    it('fades in once the body can scroll and is not at its end', async () => {
      await renderFrame(
        <FormFrame footerBg={theme.color.bg.surface} dividerColor={dividerColor} footer={<Text>Save</Text>} testID="frame">
          <Text>A field</Text>
        </FormFrame>,
      );
      await fireScrollState(true);
      const divider = screen.getByTestId('frame-footer-divider');
      const style = [divider.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
      expect(style.opacity).toBe(1);
      expect(__timingCalls.at(-1)).toMatchObject({ toValue: 1, config: { duration: motion.events.footerDividerFade.duration } });
    });

    it('fades out again once scrolled to the end', async () => {
      await renderFrame(
        <FormFrame footerBg={theme.color.bg.surface} dividerColor={dividerColor} footer={<Text>Save</Text>} testID="frame">
          <Text>A field</Text>
        </FormFrame>,
      );
      await fireScrollState(true);
      const body = screen.getByTestId('frame-body');
      await act(async () => {
        body.props.onScroll({ nativeEvent: { contentOffset: { y: 500 } } });
      });
      const divider = screen.getByTestId('frame-footer-divider');
      const style = [divider.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
      expect(style.opacity).toBe(0);
    });

    it('runs the same duration under reduce motion (reduced.kind is "same")', async () => {
      __setReducedMotion(true);
      await renderFrame(
        <FormFrame footerBg={theme.color.bg.surface} dividerColor={dividerColor} footer={<Text>Save</Text>} testID="frame">
          <Text>A field</Text>
        </FormFrame>,
      );
      await fireScrollState(true);
      expect(__timingCalls.at(-1)?.config?.duration).toBe(motion.events.footerDividerFade.reduced.duration);
    });
  });
});
