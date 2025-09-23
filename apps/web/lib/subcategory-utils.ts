import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from './ynab-constants';
import type { CardSubcategory } from './storage';

/**
 * Generate a unique ID for a subcategory
 */
const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `subcat-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Normalise a value to a number or return fallback
 */
const normaliseNumber = (value: unknown, fallback: number | null = null): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallback;
};

/**
 * Prepare subcategories for saving, normalising values and ensuring consistency
 */
export function prepareSubcategoriesForSave(
  subcategories: CardSubcategory[] | undefined,
  rewardFallback: number
): CardSubcategory[] {
  if (!Array.isArray(subcategories) || subcategories.length === 0) {
    return [];
  }

  const now = new Date().toISOString();

  return subcategories.map((sub, index) => {
    const flagColour = (sub.flagColor || UNFLAGGED_FLAG.value) as YnabFlagColor;
    const fallbackName =
      flagColour === UNFLAGGED_FLAG.value
        ? UNFLAGGED_FLAG.label
        : YNAB_FLAG_COLORS.find((flag) => flag.value === flagColour)?.label ?? flagColour;

    return {
      ...sub,
      id: sub.id || generateId(),
      flagColor: flagColour,
      name: sub.name?.trim() || fallbackName,
      rewardValue: normaliseNumber(sub.rewardValue, rewardFallback) ?? rewardFallback,
      milesBlockSize: normaliseNumber(sub.milesBlockSize, null),
      minimumSpend: normaliseNumber(sub.minimumSpend, sub.minimumSpend === 0 ? 0 : null),
      maximumSpend: normaliseNumber(sub.maximumSpend, sub.maximumSpend === 0 ? 0 : null),
      active: sub.active !== false,
      excludeFromRewards: sub.excludeFromRewards === true,
      priority: index,
      createdAt: sub.createdAt ?? now,
      updatedAt: now,
    };
  });
}
