import { act, renderHook } from '@testing-library/react-native';
import { Keyboard, type EmitterSubscription } from 'react-native';
import { useKeyboardVisible } from './useKeyboardVisible';

type Listener = (event: unknown) => void;

/**
 * `Keyboard` wraps a native emitter with no way to fire a fake event on it in a component test —
 * this repo has no earlier precedent for exercising it (grep turns up nothing), so this stubs
 * `addListener` itself and gives the test a `fire` to call back whatever the hook registered.
 * Scoped to this file only: nothing else here imports `Keyboard`.
 */
function mockKeyboardListeners() {
  const listeners = new Map<string, Listener[]>();
  const removeSpies: jest.Mock[] = [];
  jest.spyOn(Keyboard, 'addListener').mockImplementation((eventType, listener) => {
    const existing = listeners.get(eventType) ?? [];
    existing.push(listener as Listener);
    listeners.set(eventType, existing);
    const remove = jest.fn(() => {
      listeners.set(eventType, (listeners.get(eventType) ?? []).filter((l) => l !== listener));
    });
    removeSpies.push(remove);
    return { remove } as unknown as EmitterSubscription;
  });
  return {
    fire: (eventType: string) => {
      (listeners.get(eventType) ?? []).forEach((listener) => listener({}));
    },
    removeSpies,
  };
}

// This suite runs under the `components` jest project, which targets iOS (`jest-expo/ios`,
// `jest.config.js`) — so the hook's own `Platform.OS === 'ios'` branch (`keyboardWillShow`/
// `keyboardWillHide`) is what is under test here; the Android branch is a one-line mirror
// (`keyboardDidShow`/`keyboardDidHide`) with nothing else to diverge on.
describe('useKeyboardVisible', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts false', async () => {
    mockKeyboardListeners();
    const { result } = await renderHook(() => useKeyboardVisible());
    expect(result.current).toBe(false);
  });

  it('turns true on keyboardWillShow and false again on keyboardWillHide', async () => {
    const keyboard = mockKeyboardListeners();
    const { result } = await renderHook(() => useKeyboardVisible());

    // A bare sync `act(() => {...})` returns before React flushes the `setVisible` this schedules —
    // this suite's root is concurrent, so only the async form (`act(async () => {...})`, awaited)
    // guarantees the render has landed by the time the assertion below reads `result.current`.
    await act(async () => {
      keyboard.fire('keyboardWillShow');
    });
    expect(result.current).toBe(true);

    await act(async () => {
      keyboard.fire('keyboardWillHide');
    });
    expect(result.current).toBe(false);
  });

  it('removes both its listeners on unmount', async () => {
    const keyboard = mockKeyboardListeners();
    const { unmount } = await renderHook(() => useKeyboardVisible());

    expect(keyboard.removeSpies).toHaveLength(2);
    // RNTL 14's `unmount` is itself async (its own `render.js` awaits the renderer) — a bare
    // synchronous call here never actually tears the tree down before the assertion below reads it.
    await unmount();
    keyboard.removeSpies.forEach((remove) => expect(remove).toHaveBeenCalledTimes(1));
  });
});
