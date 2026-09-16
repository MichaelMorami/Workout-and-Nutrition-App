/**
 * `logTracker` — the double-tap-window bookkeeping `QuickAddGrid` and `UndoToast` share.
 */
import type { LogReceipt } from '../db';
import { interaction } from '../theme/tokens';
import { __resetLogTracker, forgetLog, logTrackerKey, recentLog, trackLog } from './logTracker';

const receipt: LogReceipt = {
  target: { kind: 'food', id: 'food-1' },
  entries: [
    {
      id: 'log-1',
      updatedAt: 0,
      deleted: 0,
      loggedAt: 0,
      localDate: '2025-03-10',
      localMinute: 415,
      foodId: 'food-1',
      mealId: null,
      qty: 1,
      grams: null,
      ml: null,
      kcal: 120,
      protein: 20,
      slot: 'breakfast',
    },
  ],
  portions: 1,
  undo: { kind: 'unlog', logIds: ['log-1'] },
};

beforeEach(() => {
  __resetLogTracker();
});

describe('logTrackerKey', () => {
  it('distinguishes a food and a meal that happen to share an id', () => {
    expect(logTrackerKey({ kind: 'food', id: '1' })).not.toBe(logTrackerKey({ kind: 'meal', id: '1' }));
  });
});

describe('recentLog', () => {
  it('is undefined for a candidate never logged', () => {
    expect(recentLog(logTrackerKey({ kind: 'food', id: 'food-1' }), 1_000)).toBeUndefined();
  });

  it('returns the tracked receipt inside the repeat window', () => {
    const key = logTrackerKey({ kind: 'food', id: 'food-1' });
    trackLog(key, receipt, 1_000);
    expect(recentLog(key, 1_000 + interaction.repeatWindowMs - 1)).toBe(receipt);
  });

  it('ages out at exactly the repeat window', () => {
    const key = logTrackerKey({ kind: 'food', id: 'food-1' });
    trackLog(key, receipt, 1_000);
    expect(recentLog(key, 1_000 + interaction.repeatWindowMs)).toBeUndefined();
  });

  it('forgets on request — the undo path', () => {
    const key = logTrackerKey({ kind: 'food', id: 'food-1' });
    trackLog(key, receipt, 1_000);
    forgetLog(key);
    expect(recentLog(key, 1_000)).toBeUndefined();
  });
});
