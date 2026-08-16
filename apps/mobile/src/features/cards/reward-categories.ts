import type {
  CardDashboardProjection,
  RewardCategoryProjection,
} from '@ynab-counter/app-core/rewards-engine';
import { resolveCardSpendingTier } from '@ynab-counter/app-core/rewards-engine';
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
    | { kind: 'minimum'; remaining: number; resetsOn: string; category: string | null }
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
  allowReachedMaximum = false,
  rateCard: CreditCard = projection.card,
  filterRateCardMaximum = false,
): RewardCategoryProjection | undefined {
  return projection.rewardCategories.reduce<RewardCategoryProjection | undefined>(
    (strongest, category) => {
      const rateSubcategory = rateCard.subcategories?.find(({ id }) => id === category.id);
      const rate = positiveFinite(rateSubcategory?.rewardValue ?? category.rate);
      const rateCardMaximum = positiveFinite(rateSubcategory?.maximumSpend);
      const tierUnavailable = category.excluded ||
        (!allowReachedMaximum && (
          category.maximum.reached || remainingRoom(category.maximum) === 0
        )) || (
          filterRateCardMaximum
          && rateCardMaximum !== null
          && category.spend.total >= rateCardMaximum
        );
      if (rate === null || tierUnavailable) {
        return strongest;
      }
      if (!strongest) {
        return category;
      }

      const categoryMinimumUnmet = category.minimum.target !== null &&
        category.minimum.met === false;
      const strongestMinimumUnmet = strongest.minimum.target !== null &&
        strongest.minimum.met === false;
      if (categoryMinimumUnmet !== strongestMinimumUnmet) {
        return categoryMinimumUnmet ? strongest : category;
      }

      const categoryRate = normalizedRate(
        projection.card.type,
        rate,
        settings,
      );
      const strongestRate = normalizedRate(
        projection.card.type,
        rateCard.subcategories?.find(({ id }) => id === strongest.id)?.rewardValue
          ?? strongest.rate,
        settings,
      );
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

    const spendingTier = resolveCardSpendingTier(
      projection.card,
      projection.spend.total,
    );
    const effectiveCard = spendingTier.effectiveCard;
    const canUnlockHigherLevel = spendingTier.hasNextSpendingTier;
    let selectedTier = effectiveCard.subcategoriesEnabled
      ? selectStrongestTier(projection, settings, canUnlockHigherLevel)
      : undefined;

    const currentLevelCapReached = projection.maximum.reached || Boolean(
      selectedTier?.maximum.reached,
    );
    const buildingNextLevel = currentLevelCapReached && canUnlockHigherLevel;
    const earningCard = buildingNextLevel && spendingTier.nextLevel
      ? resolveCardSpendingTier(
          projection.card,
          spendingTier.nextLevel.spendThreshold,
        ).effectiveCard
      : effectiveCard;
    if (buildingNextLevel && earningCard.subcategoriesEnabled) {
      selectedTier = selectStrongestTier(projection, settings, true, earningCard, true);
    }
    const selectedCategoryRate = selectedTier
      ? earningCard.subcategories?.find(({ id }) => id === selectedTier.id)?.rewardValue
      : null;
    const nativeRate = earningCard.subcategoriesEnabled
      ? positiveFinite(selectedCategoryRate ?? selectedTier?.rate)
      : positiveFinite(earningCard.earningRate);
    if (nativeRate === null || (earningCard.subcategoriesEnabled && !selectedTier)) {
      return [];
    }
    const nextCardCap = positiveFinite(earningCard.maximumSpend);
    const cardRoom = buildingNextLevel
      ? nextCardCap === null
        ? null
        : Math.max(0, nextCardCap - projection.spend.total)
      : remainingRoom(projection.maximum);
    const nextCategoryCap = positiveFinite(
      selectedTier
        ? earningCard.subcategories?.find(({ id }) => id === selectedTier.id)?.maximumSpend
        : null,
    );
    const tierRoom = buildingNextLevel
      ? nextCategoryCap === null
        ? null
        : Math.max(0, nextCategoryCap - (selectedTier?.spend.total ?? 0))
      : selectedTier ? remainingRoom(selectedTier.maximum) : null;
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
    const tierMinimumUnmet = selectedTier?.minimum.target !== null &&
      selectedTier?.minimum.met === false;
    const minimumUnmet = cardMinimumUnmet || tierMinimumUnmet || buildingNextLevel;
    const capLimited = projection.status === 'near_cap' ||
      (selectedTier?.maximum.progress ?? 0) >= 0.8;
    const rankGroup: CardUseRankGroup = minimumUnmet
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
        prospective: minimumUnmet,
      },
      effectiveEarningRoom,
      operational: minimumUnmet
        ? {
            kind: 'minimum',
            remaining: Math.max(
              cardMinimumUnmet ? (projection.minimum.remaining ?? 0) : 0,
              tierMinimumUnmet ? (selectedTier?.minimum.remaining ?? 0) : 0,
              buildingNextLevel
                ? Math.max(
                    0,
                    (spendingTier.nextLevel?.spendThreshold ?? 0) - projection.spend.total,
                  )
                : 0,
            ),
            resetsOn: projection.resetsOn,
            category: tierMinimumUnmet ? (selectedTier?.name ?? null) : null,
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
