import {
  isDashboardCacheEntryComplete,
  type DashboardTransactionsCacheEntry,
} from '@ynab-counter/app-core/storage';

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
  cacheEntry: Pick<
    DashboardTransactionsCacheEntry,
    'isComplete' | 'requiresFullRefresh' | 'transactions'
  >,
): FlagUpdateRefreshPlan {
  return {
    syncRewards: true,
    markCacheForFullRefresh:
      !isDashboardCacheEntryComplete(cacheEntry)
      && cacheEntry.requiresFullRefresh !== true,
  };
}
