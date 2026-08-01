import type {
  CardDashboardProjection,
  RewardCategoryProjection,
} from '@ynab-counter/app-core/rewards-engine';

export interface PortfolioRewardCategory {
  key: string;
  card: CardDashboardProjection;
  category: RewardCategoryProjection;
  cardOrder: number;
}

export function collectRewardCategories(
  cards: CardDashboardProjection[],
): PortfolioRewardCategory[] {
  return cards.flatMap((card, cardOrder) => card.rewardCategories.map((category) => ({
    key: `${card.card.id}:${category.id}`,
    card,
    category,
    cardOrder,
  })));
}

function previewUrgency(item: PortfolioRewardCategory): number {
  if (item.category.excluded) {
    return 5;
  }
  if (item.category.maximum.reached) {
    return 0;
  }
  if ((item.category.maximum.progress ?? 0) >= 0.8) {
    return 1;
  }
  if (
    item.category.blockedByCardMinimum ||
    (item.category.minimum.target !== null && item.category.minimum.met === false)
  ) {
    return 2;
  }
  if (item.category.spend.total > 0) {
    return 3;
  }
  return 4;
}

/**
 * Put operationally urgent tiers first, then favour tiers with real period
 * spend. Card order and configured tier priority make every tie stable.
 */
export function rankRewardCategoryPreview(
  categories: PortfolioRewardCategory[],
  limit = 3,
): PortfolioRewardCategory[] {
  const hasSpend = categories.some(({ category }) => category.spend.total > 0);
  const candidates = hasSpend
    ? categories.filter((item) => (
        item.category.spend.total > 0 || previewUrgency(item) <= 2
      ))
    : categories;

  return [...candidates]
    .sort((left, right) => {
      const urgencyDifference = previewUrgency(left) - previewUrgency(right);
      if (urgencyDifference !== 0) {
        return urgencyDifference;
      }

      const spendDifference = right.category.spend.total - left.category.spend.total;
      if (spendDifference !== 0) {
        return spendDifference;
      }

      const cardOrderDifference = left.cardOrder - right.cardOrder;
      if (cardOrderDifference !== 0) {
        return cardOrderDifference;
      }

      return left.category.priority - right.category.priority;
    })
    .slice(0, Math.max(0, limit));
}

/** Rank earned reward tiers by estimated cross-card value, preserving stable configured order for ties. */
export function rankRewardCategoryEarnings(
  categories: PortfolioRewardCategory[],
  limit = 3,
): PortfolioRewardCategory[] {
  return categories
    .filter(({ category }) => !category.excluded && category.reward.amount > 0)
    .sort((left, right) => {
      const valueDifference = right.category.reward.dollars - left.category.reward.dollars;
      if (valueDifference !== 0) {
        return valueDifference;
      }

      const cardOrderDifference = left.cardOrder - right.cardOrder;
      if (cardOrderDifference !== 0) {
        return cardOrderDifference;
      }

      return left.category.priority - right.category.priority;
    })
    .slice(0, Math.max(0, limit));
}
