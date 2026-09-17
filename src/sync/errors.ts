/**
 * The one error the row mapping raises.
 *
 * It names the table, the row and the column, because the caller's correct response is to quarantine
 * *that row* and carry on: one malformed row from an older or newer client must never abort a batch
 * and strand the user's other rows. A thrown-away batch is data the user can still see locally; a
 * batch that never retries is data they lose.
 */
export type SyncMappingErrorCode =
  /** A column held something the schema cannot represent (a basis outside the set, a NaN, a both-amounts log). */
  | 'invalid-value'
  /** A push was attempted with no signed-in user. An unattributed row would be rejected by RLS. */
  | 'missing-user';

export type SyncTable = 'foods' | 'food_log';

export class SyncMappingError extends Error {
  constructor(
    readonly code: SyncMappingErrorCode,
    readonly table: SyncTable,
    readonly rowId: string,
    readonly column: string,
    detail: string,
  ) {
    super(`${table}.${column} on row ${rowId}: ${detail}`);
    this.name = 'SyncMappingError';
  }
}
