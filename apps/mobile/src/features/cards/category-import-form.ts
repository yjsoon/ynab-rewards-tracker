import {
  applyCategoryProposal,
  completeCategoryImportChat,
  fetchCategoryImportTerms,
  parseCategoryImportSource,
  proposeCardCategories,
  type CardCategoryPatch,
  type CategoryImportProposal,
} from '@ynab-counter/app-core/category-import';
import type { ExistingCategoryImportSubcategory } from '@ynab-counter/app-core/category-import';
import type {
  CardSubcategory,
  CategoryImportProvider,
  CreditCard,
} from '@ynab-counter/app-core/storage/types';

export function numberInput(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

export interface CategoryImportFormFields {
  earningRate: string;
  earningBlockSize: string;
  minimumSpend: string;
  maximumSpend: string;
  subcategoriesEnabled: boolean;
  tiers: Array<{
    id: string;
    flagColor: CardSubcategory['flagColor'];
    name: string;
    rewardValue: string;
    milesBlockSize: string;
    minimumSpend: string;
    maximumSpend: string;
    priority: number;
    active: boolean;
    excludeFromRewards: boolean;
    createdAt: string;
  }>;
  spendingTiers: Array<{
    id: string;
    spendThreshold: string;
    earningRate: string;
    maximumSpend: string;
    subcategories: Array<{
      subcategoryId: string;
      rewardValue: string;
      maximumSpend: string;
    }>;
  }>;
}

export function applyCategoryPatchToCardForm<Form extends CategoryImportFormFields>(
  form: Form,
  patch: CardCategoryPatch,
): Form {
  return {
    ...form,
    subcategoriesEnabled: true,
    earningRate: patch.earningRate !== undefined ? numberInput(patch.earningRate) : form.earningRate,
    earningBlockSize: patch.earningBlockSize !== undefined
      ? numberInput(patch.earningBlockSize)
      : form.earningBlockSize,
    minimumSpend: patch.minimumSpend !== undefined ? numberInput(patch.minimumSpend) : form.minimumSpend,
    maximumSpend: patch.maximumSpend !== undefined ? numberInput(patch.maximumSpend) : form.maximumSpend,
    tiers: patch.subcategories.map((subcategory) => ({
      id: subcategory.id,
      flagColor: subcategory.flagColor,
      name: subcategory.name,
      rewardValue: numberInput(subcategory.rewardValue),
      milesBlockSize: numberInput(subcategory.milesBlockSize),
      minimumSpend: numberInput(subcategory.minimumSpend),
      maximumSpend: numberInput(subcategory.maximumSpend),
      priority: subcategory.priority,
      active: subcategory.active !== false,
      excludeFromRewards: subcategory.excludeFromRewards ?? false,
      createdAt: subcategory.createdAt,
    })),
    spendingTiers: patch.spendingTiers
      ? patch.spendingTiers.map((tier) => ({
          id: tier.id,
          spendThreshold: numberInput(tier.spendThreshold),
          earningRate: numberInput(tier.earningRate),
          maximumSpend: numberInput(tier.maximumSpend),
          subcategories: (tier.subcategories ?? []).map((subcategory) => ({
            subcategoryId: subcategory.subcategoryId,
            rewardValue: numberInput(subcategory.rewardValue),
            maximumSpend: numberInput(subcategory.maximumSpend),
          })),
        }))
      : relinkSpendingTiers(form.spendingTiers, form.tiers, patch.subcategories),
  };
}

export async function requestMobileCategoryImport(input: {
  provider: CategoryImportProvider;
  model: string;
  apiKey: string;
  cardType: CreditCard['type'];
  instructions: string;
  termsUrl: string;
  earningRate?: number | null;
  existingSubcategories?: ExistingCategoryImportSubcategory[];
}): Promise<CategoryImportProposal> {
  const source = parseCategoryImportSource({
    instructions: input.instructions,
    termsUrl: input.termsUrl,
  });
  if (source.kind !== 'ok') {
    throw new Error(source.message);
  }

  const result = await proposeCardCategories(
    {
      cardType: input.cardType,
      source: source.source,
      earningRate: input.earningRate,
      existingSubcategories: input.existingSubcategories,
    },
    {
      provider: input.provider,
      apiKey: input.apiKey,
      model: input.model,
    },
    {
      fetchText: (url) => fetchCategoryImportTerms({ url }),
      completeChat: (chat) => completeCategoryImportChat(chat),
    },
  );

  if (result.kind !== 'ok') {
    throw new Error(result.message);
  }
  return result.proposal;
}

export function applyImportedProposal(input: {
  card: CreditCard;
  form: CategoryImportFormFields;
  proposal: CategoryImportProposal;
}): CategoryImportFormFields {
  return applyCategoryPatchToCardForm(
    input.form,
    applyCategoryProposal({ card: input.card, proposal: input.proposal }),
  );
}

function relinkSpendingTiers(
  spendingTiers: CategoryImportFormFields['spendingTiers'],
  previousTiers: CategoryImportFormFields['tiers'],
  nextSubcategories: CardCategoryPatch['subcategories'],
): CategoryImportFormFields['spendingTiers'] {
  const previousNameById = new Map(
    previousTiers.map((tier) => [tier.id, normaliseName(tier.name)]),
  );
  const nextIdByName = new Map(
    nextSubcategories.map((subcategory) => [normaliseName(subcategory.name), subcategory.id]),
  );
  const nextIds = new Set(nextSubcategories.map((subcategory) => subcategory.id));

  return spendingTiers.map((tier) => ({
    ...tier,
    subcategories: tier.subcategories.flatMap((override) => {
      const nextId = nextIds.has(override.subcategoryId)
        ? override.subcategoryId
        : nextIdByName.get(previousNameById.get(override.subcategoryId) ?? '');
      if (!nextId) {
        return [];
      }
      return [{ ...override, subcategoryId: nextId }];
    }),
  }));
}

function normaliseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');
}
