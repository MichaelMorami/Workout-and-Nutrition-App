import { createContext } from 'react';
import type { VitalsDb } from '../../db';

/** `null` outside a `DbProvider` — `useDb` (src/hooks) turns that into a thrown error rather than
 * `undefined`, because a screen querying before migration is a startup bug, not a state to render
 * around. */
export const DbContext = createContext<VitalsDb | null>(null);
