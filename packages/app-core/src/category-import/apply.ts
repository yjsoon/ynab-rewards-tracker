import type { CreditCard } from '../storage/types';
import { createSpendingTierId } from '../storage/normalisers';
import type { CardCategoryPatch, CategoryImportProposal } from './types';

export function applyCategoryProposal(input: {
  card: CreditCard;
  proposal: CategoryImportProposal;
}): CardCategoryPatch {
  const patch: CardCategoryPatch = {
    subcategoriesEnabled: true,
    subcategories: input.proposal.subcategories.map((subcategory, index) => ({
      ...subcategory,
      priority: index,
    })),
  };

  const limits = input.proposal.cardLimits;
  if (limits) {
    if (limits.earningRate !== null) patch.earningRate = limits.earningRate;
    if (limits.earningBlockSize !== null) patch.earningBlockSize = limits.earningBlockSize;
    if (limits.minimumSpend !== null) patch.minimumSpend = limits.minimumSpend;
    if (limits.maximumSpend !== null) patch.maximumSpend = limits.maximumSpend;
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
