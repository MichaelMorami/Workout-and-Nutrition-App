/**
 * Uuid v4 generation for every row the data layer inserts.
 *
 * `expo-crypto` ships inside Expo Go and its `randomUUID()` is synchronous, which is what makes a
 * synchronous, no-loading-state write possible (issue #17 contract §5). It also runs unmodified
 * under Node/`better-sqlite3` in tests — no mock needed.
 */
import * as Crypto from 'expo-crypto';

/** A fresh uuid v4, generated inside the data layer so no caller invents its own id scheme. */
export function newId(): string {
  return Crypto.randomUUID();
}
