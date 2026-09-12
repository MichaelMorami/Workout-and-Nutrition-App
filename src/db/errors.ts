/**
 * The one error type every query function throws — never a raw `Error`, never a driver exception
 * leaking through. `code` is what a caller (the UI, or a test) branches on; `message` is for a log.
 *
 * Per the contract on issue #17 §0: bad input or a missing row throws `not_found` /
 * `invalid_input` / `empty_meal`. A tombstoned row counts as not found for writes.
 */
export type VitalsDbErrorCode = 'not_found' | 'invalid_input' | 'empty_meal';

export class VitalsDbError extends Error {
  readonly code: VitalsDbErrorCode;

  constructor(code: VitalsDbErrorCode, message: string) {
    super(message);
    this.name = 'VitalsDbError';
    this.code = code;
    // TS's `extends Error` breaks the prototype chain under some transpilation targets, which
    // would make `instanceof VitalsDbError` false for an error that really is one.
    Object.setPrototypeOf(this, VitalsDbError.prototype);
  }
}
