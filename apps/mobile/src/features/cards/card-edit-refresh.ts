import {
  isDashboardCacheEntryComplete,
  type DashboardTransactionsCacheEntry,
} from '@ynab-counter/app-core/storage';

export type CardEditRefreshPlan = {
  needsFullPeriodRefresh: boolean;
  publishCalculationsLocally: boolean;
};

/** Chooses exactly one trustworthy calculation publication path after a card edit. */
export function planCardEditRefresh({
  cacheEntry,
  nextPeriodStart,
  rewardConfigurationChanged,
}: {
  cacheEntry: DashboardTransactionsCacheEntry | undefined;
  nextPeriodStart: string;
  rewardConfigurationChanged: boolean;
}): CardEditRefreshPlan {
  const needsFullPeriodRefresh = cacheEntry?.requiresFullRefresh === true || (
    rewardConfigurationChanged && (
      !cacheEntry
      || nextPeriodStart < cacheEntry.sinceDate
      || !isDashboardCacheEntryComplete(cacheEntry)
    )
  );

  return {
    needsFullPeriodRefresh,
    publishCalculationsLocally: Boolean(
      rewardConfigurationChanged
      && cacheEntry
      && isDashboardCacheEntryComplete(cacheEntry)
      && !needsFullPeriodRefresh
    ),
  };
}
