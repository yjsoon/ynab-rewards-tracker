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

const UNPARSEABLE: Extract<CategoryImportFailure, { kind: 'unparseable' }> = {
  kind: 'unparseable',
  message: 'The model did not return usable categories.',
};

export function parseCategoryImportResponse(raw: string): ParseCategoryImportResult {
  const objectText = extractFirstJsonObject(stripFences(raw));
  if (!objectText) {
    return UNPARSEABLE;
  }

  let value: unknown;
  try {
    value = JSON.parse(objectText);
  } catch {
    return UNPARSEABLE;
  }

  if (!isRecord(value)) {
    return UNPARSEABLE;
  }

  const cardLimits = parseCardLimits(value.cardLimits);
  const buckets = parseBuckets(value.buckets);
  const spendingTiers = parseSpendingTiers(value.spendingTiers);
  const notes = parseNotes(value.notes);
  if (!cardLimits.ok || !buckets.ok || !spendingTiers.ok || !notes.ok) {
    return UNPARSEABLE;
  }

  return {
    kind: 'ok',
    parsed: {
      cardLimits: cardLimits.value,
      buckets: buckets.value,
      spendingTiers: spendingTiers.value,
      notes: notes.value,
    },
  };
}

function stripFences(raw: string): string {
  return raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
}

function extractFirstJsonObject(text: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
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
      if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        return text.slice(start, index + 1);
      }
    }
  }
  return null;
}

type ParsedValue<Value> =
  | { ok: true; value: Value }
  | { ok: false };

function parseBuckets(value: unknown): ParsedValue<CategoryBucketDraft[]> {
  if (!Array.isArray(value)) {
    return { ok: false };
  }

  const buckets: CategoryBucketDraft[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return { ok: false };
    }

    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const rewardValue = parseNumber(entry.rewardValue);
    const milesBlockSize = parseNullableNumber(entry.milesBlockSize, true);
    const minimumSpend = parseNullableNumber(entry.minimumSpend);
    const maximumSpend = parseNullableNumber(entry.maximumSpend);
    if (
      !name
      || !rewardValue.ok
      || !milesBlockSize.ok
      || !minimumSpend.ok
      || !maximumSpend.ok
      || typeof entry.excludeFromRewards !== 'boolean'
      || (entry.inclusion !== null && typeof entry.inclusion !== 'string')
    ) {
      return { ok: false };
    }

    buckets.push({
      name,
      rewardValue: rewardValue.value,
      milesBlockSize: milesBlockSize.value,
      minimumSpend: minimumSpend.value,
      maximumSpend: maximumSpend.value,
      excludeFromRewards: entry.excludeFromRewards,
      inclusion: typeof entry.inclusion === 'string'
        ? entry.inclusion.trim() || null
        : null,
    });
  }

  return { ok: true, value: buckets };
}

function parseCardLimits(value: unknown): ParsedValue<ProposedCardLimits | null> {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (!isRecord(value)) {
    return { ok: false };
  }

  const earningRate = parseNullableNumber(value.earningRate);
  const earningBlockSize = parseNullableNumber(value.earningBlockSize, true);
  const minimumSpend = parseNullableNumber(value.minimumSpend);
  const maximumSpend = parseNullableNumber(value.maximumSpend);
  if (!earningRate.ok || !earningBlockSize.ok || !minimumSpend.ok || !maximumSpend.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      earningRate: earningRate.value,
      earningBlockSize: earningBlockSize.value,
      minimumSpend: minimumSpend.value,
      maximumSpend: maximumSpend.value,
    },
  };
}

function parseSpendingTiers(value: unknown): ParsedValue<ProposedSpendingTier[] | null> {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (!Array.isArray(value)) {
    return { ok: false };
  }

  const tiers: ProposedSpendingTier[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return { ok: false };
    }

    const spendThreshold = parseNumber(entry.spendThreshold);
    const earningRate = parseNullableNumber(entry.earningRate);
    const maximumSpend = parseNullableNumber(entry.maximumSpend);
    if (!spendThreshold.ok || !earningRate.ok || !maximumSpend.ok) {
      return { ok: false };
    }

    tiers.push({
      spendThreshold: spendThreshold.value,
      earningRate: earningRate.value,
      maximumSpend: maximumSpend.value,
    });
  }

  return { ok: true, value: tiers };
}

function parseNotes(value: unknown): ParsedValue<string[]> {
  if (
    !Array.isArray(value)
    || !value.every((entry): entry is string => typeof entry === 'string')
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: value
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  };
}

function parseNumber(value: unknown): ParsedValue<number> {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return { ok: false };
  }
  return { ok: true, value };
}

function parseNullableNumber(
  value: unknown,
  positive = false,
): ParsedValue<number | null> {
  if (value === null) {
    return { ok: true, value: null };
  }
  const parsed = parseNumber(value);
  if (!parsed.ok || (positive && parsed.value === 0)) {
    return { ok: false };
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
