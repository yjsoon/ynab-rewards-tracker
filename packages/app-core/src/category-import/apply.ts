import type { CreditCard } from '../storage/types';
import {
  createSpendingTierId,
  createSubcategoryId,
} from '../storage/normalisers';
import type { CardCategoryPatch, CategoryImportProposal } from './types';

export function applyCategoryProposal(input: {
  card: CreditCard;
  proposal: CategoryImportProposal;
}): CardCategoryPatch {
  const now = new Date().toISOString();
  const patch: CardCategoryPatch = {
    subcategoriesEnabled: true,
    subcategories: input.proposal.subcategories.map((subcategory, index) => ({
      id: createSubcategoryId(),
      name: subcategory.name,
      flagColor: subcategory.flagColor,
      rewardValue: subcategory.rewardValue,
      milesBlockSize: subcategory.milesBlockSize,
      minimumSpend: subcategory.minimumSpend,
      maximumSpend: subcategory.maximumSpend,
      priority: index,
      active: true,
      excludeFromRewards: subcategory.excludeFromRewards,
      createdAt: now,
      updatedAt: now,
    })),
  };

  const limits = input.proposal.cardLimits;
  if (limits) {
    patch.earningRate = limits.earningRate;
    patch.earningBlockSize = limits.earningBlockSize;
    patch.minimumSpend = limits.minimumSpend;
    patch.maximumSpend = limits.maximumSpend;
  }

  if (input.proposal.spendingTiers) {
    patch.spendingTiers = input.proposal.spendingTiers.map((tier) => ({
      id: createSpendingTierId(),
      spendThreshold: tier.spendThreshold,
      earningRate: tier.earningRate,
      maximumSpend: tier.maximumSpend,
    }));
  }

  return patch;
}
