import type { CategoryImportProposal } from '@ynab-counter/app-core/category-import';
import type { CardSubcategory, CategoryImportProvider, CreditCard } from '@ynab-counter/app-core/storage/types';

export async function requestCategoryImport(input: {
  provider: CategoryImportProvider;
  model: string;
  apiKey: string;
  cardType: CreditCard['type'];
  instructions: string;
  termsUrl: string;
  earningRate?: number | null;
  existingSubcategories?: Array<Pick<CardSubcategory, 'name' | 'flagColor'>>;
}): Promise<CategoryImportProposal> {
  const response = await fetch('/api/category-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const payload = await response.json() as { proposal?: CategoryImportProposal; error?: string };
  if (!response.ok || !payload.proposal) {
    throw new Error(payload.error || 'Could not create those categories.');
  }
  return payload.proposal;
}
