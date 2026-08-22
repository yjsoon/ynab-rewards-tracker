import type { CreditCard } from '../storage/types';
import type {
  CategoryBucketDraft,
  CategoryImportFailure,
  ParsedCategoryImport,
  ProposedCardLimits,
  ProposedSpendingTier,
} from './types';

export type ParseCategoryImportResult =
  | { kind: 'ok'; parsed: ParsedCategoryImport }
  | Extract<CategoryImportFailure, { kind: 'unparseable' }>;

export function parseCategoryImportResponse(
  raw: string,
  _cardType: CreditCard['type'],
): ParseCategoryImportResult {
  const objectText = extractFirstJsonObject(stripFences(raw));
  if (!objectText) {
    return { kind: 'unparseable', message: 'The model did not return usable categories.' };
  }

  let value: unknown;
  try {
    value = JSON.parse(objectText);
  } catch {
    return { kind: 'unparseable', message: 'The model did not return usable categories.' };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { kind: 'unparseable', message: 'The model did not return usable categories.' };
  }

  const record = value as Record<string, unknown>;
  const buckets = parseBuckets(record.buckets);
  if (!buckets) {
    return { kind: 'unparseable', message: 'The model did not return usable categories.' };
  }

  return {
    kind: 'ok',
    parsed: {
      cardLimits: parseCardLimits(record.cardLimits),
      buckets,
      spendingTiers: parseSpendingTiers(record.spendingTiers),
      notes: parseNotes(record.notes),
    },
  };
}

function stripFences(raw: string): string {
  return raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
}

function extractFirstJsonObject(text: string): string | null {
  let depth = 0;
  let start = -1;
  let inString: '"' | "'" | null = null;
  let escape = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\' && inString) {
      escape = true;
      continue;
    }
    if (inString) {
      if (char === inString) {
        inString = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      continue;
    }
    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        return text.slice(start, index + 1);
      }
    }
  }
  return null;
}

function parseBuckets(value: unknown): CategoryBucketDraft[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const buckets: CategoryBucketDraft[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const rewardValue = finiteNumber(record.rewardValue);
    if (!name || rewardValue === null || rewardValue < 0) {
      continue;
    }
    buckets.push({
      name,
      rewardValue,
      milesBlockSize: optionalPositiveNumber(record.milesBlockSize),
      minimumSpend: optionalNumber(record.minimumSpend),
      maximumSpend: optionalNumber(record.maximumSpend),
      excludeFromRewards: record.excludeFromRewards === true,
      inclusion: typeof record.inclusion === 'string' && record.inclusion.trim()
        ? record.inclusion.trim()
        : null,
    });
  }

  return buckets.length > 0 ? buckets : null;
}

function parseCardLimits(value: unknown): ProposedCardLimits | null {
  if (value == null) {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return {
    earningRate: optionalNumber(record.earningRate),
    earningBlockSize: optionalPositiveNumber(record.earningBlockSize),
    minimumSpend: optionalNumber(record.minimumSpend),
    maximumSpend: optionalNumber(record.maximumSpend),
  };
}

function parseSpendingTiers(value: unknown): ProposedSpendingTier[] | null {
  if (value == null) {
    return null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const tiers = value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const spendThreshold = finiteNumber(record.spendThreshold);
    if (spendThreshold === null || spendThreshold < 0) {
      return [];
    }
    return [{
      spendThreshold,
      earningRate: optionalNumber(record.earningRate),
      maximumSpend: optionalNumber(record.maximumSpend),
    }];
  });
  return tiers.length > 0 ? tiers : null;
}

function parseNotes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalNumber(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  return finiteNumber(value);
}

function optionalPositiveNumber(value: unknown): number | null {
  const number = optionalNumber(value);
  return number !== null && number > 0 ? number : null;
}
