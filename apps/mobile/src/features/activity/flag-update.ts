import type { DashboardTransactionsCacheEntry } from '@ynab-counter/app-core/storage';

export type FlagUpdateRefreshPlan = {
  syncRewards: true;
  markCacheForFullRefresh: boolean;
};

/**
 * A flag affects derived reward tiers, so every confirmed mutation must run
 * the calculation publication path. Truncated caches additionally need a full
 * transaction fetch before those calculations are trustworthy.
 */
export function planFlagUpdateRefresh(
  cacheEntry: Pick<DashboardTransactionsCacheEntry, 'isComplete' | 'requiresFullRefresh'>,
): FlagUpdateRefreshPlan {
  return {
    syncRewards: true,
    markCacheForFullRefresh:
      cacheEntry.isComplete === false && cacheEntry.requiresFullRefresh !== true,
  };
}
