/**
 * `useEditableNumber` — issue #87's tap-to-type mechanism, factored out so issue #94 (the portion
 * sheet's Exact-mode readout) can reuse it without depending on `<Stepper>`. Behaviour only: what
 * `onCommit` is called with, never a rendered field.
 */
import { act, renderHook } from '@testing-library/react-native';
import { useEditableNumber } from './useEditableNumber';

describe('useEditableNumber', () => {
  it('starts not editing, with an empty draft', async () => {
    const { result } = await renderHook(() => useEditableNumber({ value: 120, onCommit: jest.fn() }));

    expect(result.current.editing).toBe(false);
    expect(result.current.draft).toBe('');
  });

  it('startEditing opens the field seeded with the current value', async () => {
    const { result } = await renderHook(() => useEditableNumber({ value: 120, onCommit: jest.fn() }));

    await act(() => result.current.startEditing());

    expect(result.current.editing).toBe(true);
    expect(result.current.draft).toBe('120');
  });

  it('startEditing reads a formatDraft override instead of the plain number', async () => {
    const { result } = await renderHook(() =>
      useEditableNumber({ value: 1.5, onCommit: jest.fn(), formatDraft: (v) => `x${v}` }),
    );

    await act(() => result.current.startEditing());

    expect(result.current.draft).toBe('x1.5');
  });

  it('commit parses the draft and fires onCommit with the exact typed number', async () => {
    const onCommit = jest.fn();
    const { result } = await renderHook(() => useEditableNumber({ value: 120, onCommit }));
    await act(() => result.current.startEditing());

    await act(() => result.current.setDraft('33.5'));
    await act(() => result.current.commit());

    expect(onCommit).toHaveBeenCalledWith(33.5);
    expect(result.current.editing).toBe(false);
  });

  it('commit clamps a typed value above max', async () => {
    const onCommit = jest.fn();
    const { result } = await renderHook(() => useEditableNumber({ value: 120, max: 500, onCommit }));
    await act(() => result.current.startEditing());

    await act(() => result.current.setDraft('9000'));
    await act(() => result.current.commit());

    expect(onCommit).toHaveBeenCalledWith(500);
  });

  it('commit clamps a typed value below min', async () => {
    const onCommit = jest.fn();
    const { result } = await renderHook(() => useEditableNumber({ value: 120, min: 10, onCommit }));
    await act(() => result.current.startEditing());

    await act(() => result.current.setDraft('-50'));
    await act(() => result.current.commit());

    expect(onCommit).toHaveBeenCalledWith(10);
  });

  it('commit on an empty draft reverts — onCommit is never called', async () => {
    const onCommit = jest.fn();
    const { result } = await renderHook(() => useEditableNumber({ value: 120, onCommit }));
    await act(() => result.current.startEditing());

    await act(() => result.current.setDraft(''));
    await act(() => result.current.commit());

    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.editing).toBe(false);
  });

  it('commit on an invalid draft reverts — onCommit is never called', async () => {
    const onCommit = jest.fn();
    const { result } = await renderHook(() => useEditableNumber({ value: 120, onCommit }));
    await act(() => result.current.startEditing());

    await act(() => result.current.setDraft('1.2.3'));
    await act(() => result.current.commit());

    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.editing).toBe(false);
  });

  // Issue #184 review: a `decimal-pad` shows a comma for its decimal key in most non-English
  // locales — "33,5" must commit the same as "33.5", not silently revert as unparseable.
  it('commit accepts a comma decimal separator, same as a dot', async () => {
    const onCommit = jest.fn();
    const { result } = await renderHook(() => useEditableNumber({ value: 120, onCommit }));
    await act(() => result.current.startEditing());

    await act(() => result.current.setDraft('33,5'));
    await act(() => result.current.commit());

    expect(onCommit).toHaveBeenCalledWith(33.5);
  });

  it('parseDraft previews the parsed, clamped number without committing or ending the edit', async () => {
    const onCommit = jest.fn();
    const { result } = await renderHook(() => useEditableNumber({ value: 120, max: 500, onCommit }));
    await act(() => result.current.startEditing());

    await act(() => result.current.setDraft('9000'));

    expect(result.current.parseDraft()).toBe(500);
    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.editing).toBe(true);
  });

  it('parseDraft returns null for an empty or invalid draft', async () => {
    const { result } = await renderHook(() => useEditableNumber({ value: 120, onCommit: jest.fn() }));
    await act(() => result.current.startEditing());

    await act(() => result.current.setDraft(''));
    expect(result.current.parseDraft()).toBeNull();

    await act(() => result.current.setDraft('abc'));
    expect(result.current.parseDraft()).toBeNull();
  });

  it('cancel closes the field without parsing or committing', async () => {
    const onCommit = jest.fn();
    const { result } = await renderHook(() => useEditableNumber({ value: 120, onCommit }));
    await act(() => result.current.startEditing());
    await act(() => result.current.setDraft('999'));

    await act(() => result.current.cancel());

    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.editing).toBe(false);
  });
});
