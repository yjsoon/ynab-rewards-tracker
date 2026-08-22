import type { CardSubcategory, CreditCard } from '../storage/types';
import { createSubcategoryId } from '../storage/normalisers';
import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from '../ynab/constants';
import { normaliseCategoryImportName } from './names';
import type {
  CategoryBucketDraft,
  CategoryImportProposal,
  ExistingCategoryImportSubcategory,
  ParsedCategoryImport,
} from './types';

const COLOUR_ORDER: YnabFlagColor[] = YNAB_FLAG_COLORS.map((flag) => flag.value);

const CATCH_ALL_NAMES = new Set([
  'everything else',
  'everything',
  'other',
  'others',
  'catch-all',
  'catch all',
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
  existingSubcategories?: ExistingCategoryImportSubcategory[];
}): CategoryImportProposal {
  const notes = [...input.parsed.notes];
  const existingByName = new Map(
    (input.existingSubcategories ?? []).map((subcategory) => [
      normaliseCategoryImportName(subcategory.name),
      subcategory,
    ]),
  );

  const catchAllBuckets = input.parsed.buckets.filter((bucket) => isCatchAll(bucket));
  const earningBuckets = input.parsed.buckets.filter((bucket) => !isCatchAll(bucket));
  const catchAllBucket = catchAllBuckets[0];
  for (const extra of catchAllBuckets.slice(1)) {
    rememberInclusion(notes, extra);
    notes.push(`${extra.name} did not fit the six flag colours.`);
  }

  const usedFlags = new Set<YnabFlagColor>();
  const usedIds = new Set<string>();
  const subcategories: CardSubcategory[] = [];

  for (const bucket of earningBuckets) {
    rememberInclusion(notes, bucket);
    const existing = claimExisting(existingByName.get(normaliseCategoryImportName(bucket.name)), usedIds);
    const flagColor = nextFlag(usedFlags, existing?.flagColor);
    if (!flagColor) {
      notes.push(`${bucket.name} did not fit the six flag colours.`);
      continue;
    }
    usedFlags.add(flagColor);
    subcategories.push(toSubcategory(bucket, flagColor, subcategories.length, existing, usedIds));
  }

  const fallbackRate = catchAllBucket?.rewardValue
    ?? (typeof input.earningRate === 'number' ? input.earningRate : 0);
  const fallbackName = catchAllBucket?.name ?? 'Everything else';
  const fallbackBucket = catchAllBucket ?? {
    name: fallbackName,
    rewardValue: fallbackRate,
    milesBlockSize: null,
    minimumSpend: null,
    maximumSpend: null,
    excludeFromRewards: false,
    inclusion: null,
  };
  if (catchAllBucket) {
    rememberInclusion(notes, catchAllBucket);
  }
  const existingFallback = claimExisting(
    existingByName.get(normaliseCategoryImportName(fallbackBucket.name))
      ?? (input.existingSubcategories ?? []).find((subcategory) => (
        subcategory.flagColor === UNFLAGGED_FLAG.value
      )),
    usedIds,
  );
  subcategories.push(toSubcategory(
    fallbackBucket,
    UNFLAGGED_FLAG.value,
    subcategories.length,
    existingFallback,
    usedIds,
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
  return CATCH_ALL_NAMES.has(normaliseCategoryImportName(bucket.name));
}

function claimExisting(
  existing: ExistingCategoryImportSubcategory | undefined,
  usedIds: Set<string>,
): ExistingCategoryImportSubcategory | undefined {
  if (!existing) {
    return undefined;
  }
  if (existing.id && usedIds.has(existing.id)) {
    return { ...existing, id: undefined };
  }
  return existing;
}

function rememberInclusion(notes: string[], bucket: CategoryBucketDraft): void {
  if (bucket.inclusion) {
    notes.push(`${bucket.name} includes ${bucket.inclusion}`);
  }
}

function toSubcategory(
  bucket: CategoryBucketDraft,
  flagColor: YnabFlagColor,
  priority: number,
  existing: Partial<Pick<CardSubcategory, 'id' | 'createdAt'>> | undefined,
  usedIds: Set<string>,
): CardSubcategory {
  const now = new Date().toISOString();
  const id = existing?.id && !usedIds.has(existing.id)
    ? existing.id
    : createSubcategoryId();
  usedIds.add(id);
  return {
    id,
    name: bucket.name,
    flagColor,
    rewardValue: bucket.excludeFromRewards ? 0 : bucket.rewardValue,
    milesBlockSize: bucket.milesBlockSize,
    minimumSpend: bucket.minimumSpend,
    maximumSpend: bucket.maximumSpend,
    priority,
    active: true,
    excludeFromRewards: bucket.excludeFromRewards,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}
