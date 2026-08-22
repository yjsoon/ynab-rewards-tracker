import type { CreditCard } from '../storage/types';
import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from '../ynab/constants';
import type {
  CategoryBucketDraft,
  CategoryImportProposal,
  ParsedCategoryImport,
  ProposedSubcategory,
} from './types';

const COLOUR_ORDER: YnabFlagColor[] = YNAB_FLAG_COLORS.map((flag) => flag.value);

const CATCH_ALL_NAMES = new Set([
  'everything else',
  'everything',
  'other',
  'others',
  'catch all',
  'catchall',
  'default',
  'default bucket',
  'unflagged',
  'all other spend',
  'all other spending',
  'all other purchases',
  'other spend',
  'other spending',
  'other purchases',
]);

export function compileCategoryProposal(input: {
  parsed: ParsedCategoryImport;
  cardType: CreditCard['type'];
  earningRate?: number | null;
}): CategoryImportProposal {
  const notes = [...input.parsed.notes];
  const catchAllIndex = input.parsed.buckets.findIndex((bucket) => isCatchAll(bucket));
  const catchAllBucket = catchAllIndex >= 0 ? input.parsed.buckets[catchAllIndex] : undefined;
  const subcategories: ProposedSubcategory[] = [];
  let colourIndex = 0;

  input.parsed.buckets.forEach((bucket, index) => {
    rememberInclusion(notes, bucket);
    if (index === catchAllIndex) {
      subcategories.push(toSubcategory(
        bucket,
        UNFLAGGED_FLAG.value,
        subcategories.length,
      ));
      return;
    }

    const flagColor = COLOUR_ORDER[colourIndex];
    if (!flagColor) {
      notes.push(
        `${bucket.name} earns ${bucket.rewardValue} but did not fit the six YNAB flag colours.`,
      );
      return;
    }
    colourIndex += 1;
    subcategories.push(toSubcategory(bucket, flagColor, subcategories.length));
  });

  if (!catchAllBucket) {
    subcategories.push(toSubcategory(
      {
        name: 'Everything else',
        rewardValue: typeof input.earningRate === 'number' ? input.earningRate : 0,
        milesBlockSize: null,
        minimumSpend: null,
        maximumSpend: null,
        excludeFromRewards: false,
        inclusion: null,
      },
      UNFLAGGED_FLAG.value,
      subcategories.length,
    ));
  }

  return {
    cardType: input.cardType,
    cardLimits: input.parsed.cardLimits,
    subcategories,
    spendingTiers: input.parsed.spendingTiers,
    notes,
  };
}

function isCatchAll(bucket: CategoryBucketDraft): boolean {
  return CATCH_ALL_NAMES.has(normaliseName(bucket.name));
}

function rememberInclusion(notes: string[], bucket: CategoryBucketDraft): void {
  if (bucket.inclusion) {
    notes.push(`${bucket.name} includes ${bucket.inclusion}`);
  }
}

function normaliseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function toSubcategory(
  bucket: CategoryBucketDraft,
  flagColor: YnabFlagColor,
  priority: number,
): ProposedSubcategory {
  return {
    ...bucket,
    flagColor,
    priority,
    active: true,
  };
}
