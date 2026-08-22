import type { CardSubcategory, CreditCard } from '../storage/types';

export function buildCategoryImportPrompt(input: {
  cardType: CreditCard['type'];
  instructions?: string;
  termsText?: string;
  existingNames?: string[];
}): { system: string; user: string } {
  const unit = input.cardType === 'cashback'
    ? 'cashback percent (for example 4 means 4%)'
    : 'miles per dollar';

  const system = [
    'You extract credit-card reward categories from terms and user instructions.',
    'Return one JSON object and nothing else.',
    'Do not assign YNAB flags or colours. The app maps categories onto flags.',
    'Prefer at most six earning categories plus one catch-all for everything else.',
    'Put leftover categories that will not fit in notes.',
    'Use the card reward unit exactly. Do not invent a second currency.',
  ].join(' ');

  const sections = [
    `Card type: ${input.cardType}. rewardValue is ${unit}.`,
    'JSON shape:',
    '{',
    '  "cardLimits": { "earningRate": number|null, "earningBlockSize": number|null, "minimumSpend": number|null, "maximumSpend": number|null } | null,',
    '  "buckets": [{ "name": string, "rewardValue": number, "milesBlockSize": number|null, "minimumSpend": number|null, "maximumSpend": number|null, "excludeFromRewards": boolean, "inclusion": string|null }],',
    '  "spendingTiers": [{ "spendThreshold": number, "earningRate": number|null, "maximumSpend": number|null }] | null,',
    '  "notes": string[]',
    '}',
  ];

  if (input.existingNames && input.existingNames.length > 0) {
    sections.push(`Existing category names: ${input.existingNames.join(', ')}.`);
  }
  if (input.instructions) {
    sections.push(`User instructions:\n${input.instructions}`);
  }
  if (input.termsText) {
    sections.push(`Card terms:\n${input.termsText}`);
  }

  return { system, user: sections.join('\n\n') };
}

export function existingNamesFrom(
  subcategories?: Array<Pick<CardSubcategory, 'name'>>,
): string[] {
  if (!subcategories) {
    return [];
  }
  return subcategories
    .map((subcategory) => subcategory.name.trim())
    .filter((name) => name.length > 0);
}
