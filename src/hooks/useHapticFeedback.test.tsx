import { renderHook } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { haptics } from '../theme/tokens';
import { useHapticFeedback } from './useHapticFeedback';

jest.mock('expo-haptics', () => {
  const actual = jest.requireActual<typeof import('expo-haptics')>('expo-haptics');
  return {
    ...actual,
    impactAsync: jest.fn<typeof actual.impactAsync>().mockResolvedValue(undefined),
    notificationAsync: jest.fn<typeof actual.notificationAsync>().mockResolvedValue(undefined),
    selectionAsync: jest.fn<typeof actual.selectionAsync>().mockResolvedValue(undefined),
  };
});

const mockImpact = jest.mocked(Haptics.impactAsync);
const mockNotification = jest.mocked(Haptics.notificationAsync);
const mockSelection = jest.mocked(Haptics.selectionAsync);

describe('useHapticFeedback', () => {
  it('fires an impact style for haptics.foodLogged', async () => {
    const { result } = await renderHook(() => useHapticFeedback());
    result.current(haptics.foodLogged);
    expect(mockImpact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  });

  it('fires the lighter impact for haptics.undo', async () => {
    const { result } = await renderHook(() => useHapticFeedback());
    result.current(haptics.undo);
    expect(mockImpact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('fires a selection tick for haptics.sliderDetent', async () => {
    const { result } = await renderHook(() => useHapticFeedback());
    result.current(haptics.sliderDetent);
    expect(mockSelection).toHaveBeenCalled();
  });

  it('fires a notification for haptics.restFinished', async () => {
    const { result } = await renderHook(() => useHapticFeedback());
    result.current(haptics.restFinished);
    expect(mockNotification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('never throws when the native call rejects', async () => {
    mockImpact.mockRejectedValueOnce(new Error('no haptics engine'));
    const { result } = await renderHook(() => useHapticFeedback());
    expect(() => result.current(haptics.foodLogged)).not.toThrow();
    // Let the swallowed rejection's microtask settle before the test ends.
    await Promise.resolve();
  });

  it('returns the same function across renders', async () => {
    const { result, rerender } = await renderHook(() => useHapticFeedback());
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
  });
});
