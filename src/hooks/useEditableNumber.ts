import { useCallback, useState } from 'react';

export type UseEditableNumberOptions = {
  /** The committed value this control currently shows. Read fresh on every `startEditing` so a
   * value that changed elsewhere (an undo, another control) is what typing starts from. */
  readonly value: number;
  /** Defaults to no floor. */
  readonly min?: number;
  /** Defaults to no ceiling. */
  readonly max?: number;
  /** Called with the parsed, clamped number — only when the draft parses to a finite number. */
  readonly onCommit: (value: number) => void;
  /** Seeds the draft text when editing starts. Defaults to `String(value)` — deliberately not a
   * locale-formatted or rounded string, so the draft round-trips through `Number(...)` exactly. */
  readonly formatDraft?: (value: number) => string;
};

export type UseEditableNumberResult = {
  /** Whether the control is currently showing its `TextInput`, not its resting display. */
  readonly editing: boolean;
  /** The in-progress typed text — controlled, so the caller's `TextInput` stays a plain `value`/`onChangeText` pair. */
  readonly draft: string;
  /** Opens the field, seeded with the current value, selected so typing replaces it. */
  readonly startEditing: () => void;
  readonly setDraft: (text: string) => void;
  /** Parses and clamps `draft` right now, without committing or ending the edit — `null` for the
   * same "empty, non-numeric" cases `commit` discards. #94's Exact-mode readout uses this for a
   * live preview while the digit-pad is still open. */
  readonly parseDraft: () => number | null;
  /** Parses `draft`: a finite number clamps to `[min, max]` and fires `onCommit`; anything else
   * (empty, "-", "1.2.3", non-numeric) is silently discarded — the previous value stands, unchanged,
   * exactly as if this edit had never happened. Either way, editing ends. */
  readonly commit: () => void;
  /** Closes the field without parsing or committing — an explicit "never mind", distinct from an
   * empty/invalid `commit` only in that it skips the parse entirely. Either way the value stands
   * unchanged; this exists for a caller with its own cancel affordance (e.g. a keyboard's dismiss),
   * not required by `<Stepper>` itself, which only ever blurs or submits. */
  readonly cancel: () => void;
};

/**
 * Issue #87's "tap the value to type it exactly" mechanism, factored out of `<Stepper>` so issue
 * #94 (the portion sheet's Exact-mode readout) can drive the same tap → keypad → clamp-or-revert
 * behaviour without depending on Stepper's own −/+ buttons. Pure state and parsing — no rendering,
 * no keyboard type, no haptics: the caller owns the `TextInput` and everything visual.
 */
export function useEditableNumber({ value, min = -Infinity, max = Infinity, onCommit, formatDraft }: UseEditableNumberOptions): UseEditableNumberResult {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEditing = useCallback(() => {
    setDraft(formatDraft ? formatDraft(value) : String(value));
    setEditing(true);
  }, [value, formatDraft]);

  const parseDraft = useCallback((): number | null => {
    // A comma decimal separator ("33,5") is how a `decimal-pad` keyboard shows the decimal key in
    // most non-English locales — `Number(...)` only ever accepts a dot, so without this a comma
    // entry silently reverted as if it were invalid text. Only the first comma is swapped: a second
    // one (a stray thousands separator, "1,234,5") still fails to parse below, exactly as before.
    const normalized = draft.trim().replace(',', '.');
    const parsed = Number(normalized);
    if (normalized === '' || !Number.isFinite(parsed)) return null;
    return Math.min(max, Math.max(min, parsed));
  }, [draft, min, max]);

  const commit = useCallback(() => {
    const parsed = parseDraft();
    if (parsed !== null) onCommit(parsed);
    setEditing(false);
  }, [parseDraft, onCommit]);

  const cancel = useCallback(() => {
    setEditing(false);
  }, []);

  return { editing, draft, startEditing, setDraft, parseDraft, commit, cancel };
}
