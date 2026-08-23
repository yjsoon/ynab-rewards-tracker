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
  return cards.flatMap((card, cardOrder) => card.status === 'capped'
    ? []
    : card.rewardCategories.map((category) => ({
        key: `${card.card.id}:${category.id}`,
        card,
        category,
        cardOrder,
      })));
}
