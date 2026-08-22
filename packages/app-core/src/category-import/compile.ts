import type { CardSubcategory, CreditCard } from '../storage/types';
import { createSubcategoryId } from '../storage/normalisers';
import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from '../ynab/constants';
import type { CategoryBucketDraft, CategoryImportProposal, ParsedCategoryImport } from './types';

const COLOUR_ORDER: YnabFlagColor[] = YNAB_FLAG_COLORS.map((flag) => flag.value);

const CATCH_ALL_NAMES = new Set([
  'everything else',
  'everything',
  'other',
  'others',
  'catch-all',
  'catchall',
  'default',
  'unflagged',
  'all other spend',
  'all other spending',
]);

export function compileCategoryImport(input: {
  parsed: ParsedCategoryImport;
  cardType: CreditCard['type'];
  earningRate?: number | null;
  existingSubcategories?: Array<Pick<CardSubcategory, 'name' | 'flagColor'>>;
}): CategoryImportProposal {
  const notes = [...input.parsed.notes];
  const existingByName = new Map(
    (input.existingSubcategories ?? []).map((subcategory) => [
      normaliseName(subcategory.name),
      subcategory.flagColor,
    ]),
  );

  const catchAllIndex = input.parsed.buckets.findIndex((bucket) => isCatchAll(bucket));
  const catchAllBucket = catchAllIndex >= 0 ? input.parsed.buckets[catchAllIndex] : undefined;
  const earningBuckets = input.parsed.buckets.filter((_, index) => index !== catchAllIndex);

  const usedFlags = new Set<YnabFlagColor>();
  const subcategories: CardSubcategory[] = [];

  for (const bucket of earningBuckets) {
    const preferred = existingByName.get(normaliseName(bucket.name));
    const flagColor = nextFlag(usedFlags, preferred);
    if (!flagColor) {
      notes.push(`${bucket.name} did not fit the six flag colours.`);
      continue;
    }
    usedFlags.add(flagColor);
    subcategories.push(toSubcategory(bucket, flagColor, subcategories.length));
  }

  const fallbackRate = catchAllBucket?.rewardValue
    ?? (typeof input.earningRate === 'number' ? input.earningRate : 0);
  const fallbackName = catchAllBucket?.name ?? 'Everything else';
  subcategories.push(toSubcategory(
    catchAllBucket ?? {
      name: fallbackName,
      rewardValue: fallbackRate,
      milesBlockSize: null,
      minimumSpend: null,
      maximumSpend: null,
      excludeFromRewards: false,
      inclusion: null,
    },
    UNFLAGGED_FLAG.value,
    subcategories.length,
  ));

  return {
    cardType: input.cardType,
    cardLimits: input.parsed.cardLimits,
    subcategories,
    spendingTiers: input.parsed.spendingTiers,
    notes,
  };
}

function nextFlag(
  used: Set<YnabFlagColor>,
  preferred?: YnabFlagColor,
): YnabFlagColor | undefined {
  if (preferred && preferred !== UNFLAGGED_FLAG.value && !used.has(preferred)) {
    return preferred;
  }
  return COLOUR_ORDER.find((flag) => !used.has(flag));
}

function isCatchAll(bucket: CategoryBucketDraft): boolean {
  return CATCH_ALL_NAMES.has(normaliseName(bucket.name));
}

function normaliseName(name: string): string {
  return name.trim().toLowerCase();
}

function toSubcategory(
  bucket: CategoryBucketDraft,
  flagColor: YnabFlagColor,
  priority: number,
): CardSubcategory {
  const now = new Date().toISOString();
  return {
    id: createSubcategoryId(),
    name: bucket.name,
    flagColor,
    rewardValue: bucket.excludeFromRewards ? 0 : bucket.rewardValue,
    milesBlockSize: bucket.milesBlockSize,
    minimumSpend: bucket.minimumSpend,
    maximumSpend: bucket.maximumSpend,
    priority,
    active: true,
    excludeFromRewards: bucket.excludeFromRewards,
    createdAt: now,
    updatedAt: now,
  };
}
