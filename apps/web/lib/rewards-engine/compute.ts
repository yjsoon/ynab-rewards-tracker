/**
 * Compute current-period reward calculations for all active cards.
 * Web-specific wrapper that provides YnabClient to the shared compute logic.
 */

import { computeCurrentPeriod as sharedComputeCurrentPeriod } from '@ynab-counter/app-core/rewards-engine';
import type {
  AppSettings,
  CreditCard,
  RewardCalculation,
  RewardRule,
} from '@ynab-counter/app-core/storage';
import { YnabClient } from '@/lib/ynab-client';

export async function computeCurrentPeriod(
  pat: string,
  budgetId: string,
  cards: CreditCard[],
  allRules: RewardRule[],
  settings?: AppSettings,
  signal?: AbortSignal
): Promise<RewardCalculation[]> {
  const client = new YnabClient(pat);
  return sharedComputeCurrentPeriod(client, budgetId, cards, allRules, settings, signal);
}
