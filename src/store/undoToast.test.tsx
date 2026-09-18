/**
 * `useUndoToastStore` — the toast is up after `show`, replaced (not stacked) by a second `show`,
 * cleared by `dismiss`, and cleared on its own after `interaction.undoCeilingMs` — the only timed
 * dismissal (`docs/decisions.md`: no 4-second guess).
 *
 * `.test.tsx`, not `.test.ts`: `jest.config.js`'s "data" project doesn't match `src/store/**`, and
 * "components" only picks up `src/**\/*.test.tsx` (`theme-preference.test.tsx`'s note).
 *
 * Asserted through `getState()`, the same way `theme-preference.test.tsx` does — zustand's own
 * React binding is not this suite's to test, and the suite's frozen-clock `beforeEach`
 * (`test/setup/common.ts`) already installs fake timers before every test.
 */
import type { UndoToken } from '../db';
import { interaction } from '../theme/tokens';
import { useUndoToastStore, type UndoToastPayload } from './undoToast';

const token: UndoToken = { kind: 'unlog', logIds: ['log-1'] };

const payload = (overrides: Partial<UndoToastPayload> = {}): UndoToastPayload => ({
  token,
  candidateKey: 'food-1',
  title: 'Greek yoghurt',
  meta: '120 kcal · 20 g protein',
  delta: { kcal: 120, protein: 20, entryCountDelta: 1 },
  ...overrides,
});

afterEach(() => {
  useUndoToastStore.getState().dismiss();
});

describe('useUndoToastStore', () => {
  it('has no toast until something is shown', () => {
    expect(useUndoToastStore.getState().toast).toBeNull();
  });

  it('shows the payload passed to show', () => {
    useUndoToastStore.getState().show(payload());
    expect(useUndoToastStore.getState().toast).toEqual(payload());
  });

  it('replaces, not stacks, a toast still showing — logging again updates it', () => {
    useUndoToastStore.getState().show(payload({ title: 'Greek yoghurt' }));
    useUndoToastStore.getState().show(payload({ title: 'Greek yoghurt  ×2' }));
    expect(useUndoToastStore.getState().toast?.title).toBe('Greek yoghurt  ×2');
  });

  it('dismiss clears it', () => {
    useUndoToastStore.getState().show(payload());
    useUndoToastStore.getState().dismiss();
    expect(useUndoToastStore.getState().toast).toBeNull();
  });

  it('clears itself at the undo ceiling, wall-clock from the log', () => {
    useUndoToastStore.getState().show(payload());
    jest.advanceTimersByTime(interaction.undoCeilingMs - 1);
    expect(useUndoToastStore.getState().toast).not.toBeNull();
    jest.advanceTimersByTime(1);
    expect(useUndoToastStore.getState().toast).toBeNull();
  });

  it('a second show resets the ceiling instead of stacking a stale one', () => {
    useUndoToastStore.getState().show(payload());
    jest.advanceTimersByTime(interaction.undoCeilingMs - 1);
    useUndoToastStore.getState().show(payload({ title: 'second' }));
    jest.advanceTimersByTime(interaction.undoCeilingMs - 1);
    expect(useUndoToastStore.getState().toast?.title).toBe('second');
  });

  it('dismiss clears a pending ceiling timer — it does not fire on an unrelated later toast', () => {
    useUndoToastStore.getState().show(payload());
    useUndoToastStore.getState().dismiss();
    useUndoToastStore.getState().show(payload({ title: 'unrelated' }));
    jest.advanceTimersByTime(interaction.undoCeilingMs - 1);
    expect(useUndoToastStore.getState().toast?.title).toBe('unrelated');
  });

  // Issue #100: a food-archive delete has no `UndoToken` — `action` stands in for it, and
  // `token`/`candidateKey`/`delta` are all optional so this payload shape is still valid.
  it('accepts a token-less payload carrying only an action, for a reversal UndoToken cannot express', () => {
    const action = jest.fn();
    useUndoToastStore.getState().show({ title: 'Greek yoghurt', meta: 'Removed', verb: 'deleting', action });
    expect(useUndoToastStore.getState().toast).toEqual({ title: 'Greek yoghurt', meta: 'Removed', verb: 'deleting', action });
  });
});
