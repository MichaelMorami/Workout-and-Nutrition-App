/**
 * The public surface of `src/sync`.
 *
 * Today it is the pure row mapping between local SQLite and the remote contract in
 * `supabase/migrations/**` (#114). The client, the push/pull loop and the merge planner arrive
 * behind this same barrel; consumers import from `@/src/sync`, never from a file inside it.
 */
export { SyncMappingError } from './errors';
export type { SyncMappingErrorCode, SyncTable } from './errors';

export {
  FOOD_SYNC_COLUMNS,
  foodSyncFields,
  fromRemoteFood,
  fromRemoteFoodLog,
  toRemoteFood,
  toRemoteFoodLog,
} from './mapping';
export type { LocalFoodLogSync, LocalFoodSync } from './mapping';

export type { RemoteFoodLogRow, RemoteFoodRow } from './remote-rows';
