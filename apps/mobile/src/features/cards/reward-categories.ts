import type {
  CardDashboardProjection,
  RewardCategoryProjection,
} from '@ynab-counter/app-core/rewards-engine';
import type { AppSettings, CreditCard } from '@ynab-counter/app-core/storage';

export type CardUseRankGroup = 'current' | 'building' | 'cap_limited';

export interface RankedCardUse {
  key: string;
  card: CardDashboardProjection;
  cardOrder: number;
  use: {
    label: string;
    categoryId: string | null;
    flagColor: RewardCategoryProjection['flagColor'] | null;
  };
  rate: {
    type: CreditCard['type'];
    value: number;
    normalized: number;
    blockSize: number | null;
    prospective: boolean;
  };
  effectiveEarningRoom: number | null;
  operational:
    | { kind: 'minimum'; remaining: number; resetsOn: string }
    | { kind: 'cap'; remaining: number }
    | null;
  rankGroup: CardUseRankGroup;
}

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

function positiveFinite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function normalizedRate(
  type: CreditCard['type'],
  rate: number,
  settings: AppSettings,
): number {
  if (type === 'cashback') {
    return rate / 100;
  }

  const configuredValuation = settings.milesValuation;
  const milesValuation = typeof configuredValuation === 'number' &&
    Number.isFinite(configuredValuation)
    ? configuredValuation
    : 0.01;
  return rate * milesValuation;
}

function remainingRoom(
  maximum: CardDashboardProjection['maximum'] | RewardCategoryProjection['maximum'],
): number | null {
  if (maximum.target === null) {
    return null;
  }
  if (maximum.reached || maximum.remaining === null || maximum.remaining <= 0) {
    return 0;
  }
  return maximum.remaining;
}

function selectStrongestTier(
  projection: CardDashboardProjection,
  settings: AppSettings,
): RewardCategoryProjection | undefined {
  return projection.rewardCategories.reduce<RewardCategoryProjection | undefined>(
    (strongest, category) => {
      const rate = positiveFinite(category.rate);
      const tierUnavailable = category.excluded ||
        category.maximum.reached ||
        remainingRoom(category.maximum) === 0 ||
        (category.minimum.target !== null && category.minimum.met === false);
      if (rate === null || tierUnavailable) {
        return strongest;
      }
      if (!strongest) {
        return category;
      }

      const categoryRate = normalizedRate(projection.card.type, rate, settings);
      const strongestRate = normalizedRate(projection.card.type, strongest.rate, settings);
      return categoryRate > strongestRate ? category : strongest;
    },
    undefined,
  );
}

function rankGroupPriority(group: CardUseRankGroup): number {
  switch (group) {
    case 'current': return 0;
    case 'building': return 1;
    case 'cap_limited': return 2;
  }
}

/**
 * Rank each usable card by its strongest currently available earning use.
 * Availability and ordering live here so Overview only formats and navigates.
 */
export function rankCardUses(
  cards: CardDashboardProjection[],
  settings: AppSettings,
): RankedCardUse[] {
  const uses = cards.flatMap<RankedCardUse>((projection, cardOrder) => {
    if (projection.status === 'capped' || projection.status === 'unconfigured') {
      return [];
    }

    const selectedTier = projection.card.subcategoriesEnabled
      ? selectStrongestTier(projection, settings)
      : undefined;
    const nativeRate = projection.card.subcategoriesEnabled
      ? positiveFinite(selectedTier?.rate)
      : positiveFinite(projection.card.earningRate);
    if (nativeRate === null || (projection.card.subcategoriesEnabled && !selectedTier)) {
      return [];
    }

    const cardRoom = remainingRoom(projection.maximum);
    const tierRoom = selectedTier ? remainingRoom(selectedTier.maximum) : null;
    if (cardRoom === 0 || tierRoom === 0) {
      return [];
    }
    const constrainedRooms = [cardRoom, tierRoom].filter(
      (room): room is number => room !== null && room > 0,
    );
    const effectiveEarningRoom = constrainedRooms.length > 0
      ? Math.min(...constrainedRooms)
      : null;
    const blockSize = positiveFinite(selectedTier
      ? selectedTier.blockInfo?.size
      : projection.card.earningBlockSize);
    if (
      blockSize !== null &&
      effectiveEarningRoom !== null &&
      blockSize > effectiveEarningRoom
    ) {
      return [];
    }

    const cardMinimumUnmet = projection.minimum.target !== null &&
      projection.minimum.met === false;
    const capLimited = projection.status === 'near_cap' ||
      (selectedTier?.maximum.progress ?? 0) >= 0.8;
    if (
      cardMinimumUnmet &&
      effectiveEarningRoom !== null &&
      (projection.minimum.remaining ?? 0) > effectiveEarningRoom
    ) {
      return [];
    }
    const rankGroup: CardUseRankGroup = cardMinimumUnmet
      ? 'building'
      : capLimited
        ? 'cap_limited'
        : 'current';

    return [{
      key: projection.card.id,
      card: projection,
      cardOrder,
      use: {
        label: selectedTier?.name ?? 'Everyday spend',
        categoryId: selectedTier?.id ?? null,
        flagColor: selectedTier?.flagColor ?? null,
      },
      rate: {
        type: projection.card.type,
        value: nativeRate,
        normalized: normalizedRate(projection.card.type, nativeRate, settings),
        blockSize,
        prospective: cardMinimumUnmet,
      },
      effectiveEarningRoom,
      operational: cardMinimumUnmet
        ? {
            kind: 'minimum',
            remaining: projection.minimum.remaining ?? 0,
            resetsOn: projection.resetsOn,
          }
        : effectiveEarningRoom !== null
          ? { kind: 'cap', remaining: effectiveEarningRoom }
          : null,
      rankGroup,
    }];
  });

  return uses.sort((left, right) => {
    const groupDifference = rankGroupPriority(left.rankGroup) -
      rankGroupPriority(right.rankGroup);
    if (groupDifference !== 0) {
      return groupDifference;
    }

    const rateDifference = right.rate.normalized - left.rate.normalized;
    if (rateDifference !== 0) {
      return rateDifference;
    }

    return left.cardOrder - right.cardOrder;
  });
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
