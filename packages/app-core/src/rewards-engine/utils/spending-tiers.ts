import type {
  CardSpendingTier,
  CreditCard,
  SpendingTierSubcategory,
} from '../../storage/types';
import { createSpendingTierId } from '../../storage/normalisers';

export interface CardSpendingLevel {
  id: string | null;
  isBase: boolean;
  spendThreshold: number;
  earningRate: number | null;
  maximumSpend: number | null;
  subcategories: SpendingTierSubcategory[];
}

export interface ResolvedCardSpendingTier {
  activeLevel: CardSpendingLevel | null;
  nextLevel: CardSpendingLevel | null;
  hasNextSpendingTier: boolean;
  effectiveCard: CreditCard;
  minimumSpendMet: boolean;
}

function configuredThreshold(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function configuredNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function baseSubcategories(card: CreditCard): SpendingTierSubcategory[] {
  return (card.subcategories ?? []).map((subcategory) => ({
    subcategoryId: subcategory.id,
    rewardValue: subcategory.rewardValue,
    maximumSpend: subcategory.maximumSpend ?? null,
  }));
}

export function getCardSpendingLevels(card: CreditCard): CardSpendingLevel[] {
  const baseLevel: CardSpendingLevel = {
    id: null,
    isBase: true,
    spendThreshold: configuredThreshold(card.minimumSpend),
    earningRate: configuredNumber(card.earningRate),
    maximumSpend: configuredNumber(card.maximumSpend),
    subcategories: baseSubcategories(card),
  };
  const additionalLevels = (card.spendingTiers ?? []).map((tier) => ({
    id: tier.id,
    isBase: false,
    spendThreshold: configuredThreshold(tier.spendThreshold),
    earningRate: configuredNumber(tier.earningRate),
    maximumSpend: configuredNumber(tier.maximumSpend),
    subcategories: tier.subcategories ?? [],
  }));

  // Stable sorting keeps an explicitly configured tier after the base level at
  // the same threshold, so the user's additional level wins deterministically.
  return [baseLevel, ...additionalLevels].sort(
    (left, right) => left.spendThreshold - right.spendThreshold,
  );
}

function applyLevel(card: CreditCard, level: CardSpendingLevel): CreditCard {
  const overrides = new Map(
    level.subcategories.map((subcategory) => [subcategory.subcategoryId, subcategory] as const),
  );

  return {
    ...card,
    earningRate: level.earningRate,
    minimumSpend: level.spendThreshold,
    maximumSpend: level.maximumSpend,
    subcategories: card.subcategories?.map((subcategory) => {
      const override = overrides.get(subcategory.id);
      return override
        ? {
            ...subcategory,
            rewardValue: override.rewardValue,
            maximumSpend: override.maximumSpend ?? null,
          }
        : subcategory;
    }),
  };
}

/**
 * Resolve the highest reward level reached by total qualifying period spend.
 * If no level has been reached, the lowest configured level is used only to
 * describe the target while rewards remain locked.
 */
export function resolveCardSpendingTier(
  card: CreditCard,
  totalSpend: number,
): ResolvedCardSpendingTier {
  const levels = getCardSpendingLevels(card);
  const activeLevel = levels.reduce<CardSpendingLevel | null>(
    (active, level) => totalSpend >= level.spendThreshold ? level : active,
    null,
  );
  const targetLevel = activeLevel ?? levels[0];
  const nextLevel = levels.find((level) => level.spendThreshold > totalSpend) ?? null;

  return {
    activeLevel,
    nextLevel,
    hasNextSpendingTier: Boolean(card.spendingTiers?.length && nextLevel),
    effectiveCard: applyLevel(card, targetLevel),
    minimumSpendMet: activeLevel !== null,
  };
}

export function createSpendingTier(
  card: CreditCard,
  spendThreshold: number,
): CardSpendingTier {
  return {
    id: createSpendingTierId(),
    spendThreshold,
    earningRate: configuredNumber(card.earningRate),
    maximumSpend: configuredNumber(card.maximumSpend),
    subcategories: baseSubcategories(card),
  };
}
