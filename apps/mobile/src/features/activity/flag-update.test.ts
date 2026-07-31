import { describe, expect, it } from 'vitest';

import { planFlagUpdateRefresh } from './flag-update';

describe('planFlagUpdateRefresh', () => {
  it('syncs derived rewards even when the transaction cache is complete', () => {
    expect(planFlagUpdateRefresh({ isComplete: true })).toEqual({
      syncRewards: true,
      markCacheForFullRefresh: false,
    });
  });

  it('marks a truncated cache for a full fetch before syncing rewards', () => {
    expect(planFlagUpdateRefresh({ isComplete: false })).toEqual({
      syncRewards: true,
      markCacheForFullRefresh: true,
    });
    expect(planFlagUpdateRefresh({
      isComplete: false,
      requiresFullRefresh: true,
    }).markCacheForFullRefresh).toBe(false);
  });
});
