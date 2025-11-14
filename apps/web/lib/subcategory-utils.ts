import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from './ynab-constants';
import type { CardSubcategory } from './storage';
import { createSubcategoryId, normaliseNumber } from '@ynab-counter/app-core/storage';

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
      id: sub.id || createSubcategoryId(),
      flagColor: flagColour,
      name: sub.name?.trim() || fallbackName,
      rewardValue: normaliseNumber(sub.rewardValue) ?? rewardFallback,
      milesBlockSize: normaliseNumber(sub.milesBlockSize),
      minimumSpend: normaliseNumber(sub.minimumSpend === 0 ? 0 : sub.minimumSpend),
      maximumSpend: normaliseNumber(sub.maximumSpend === 0 ? 0 : sub.maximumSpend),
      active: sub.active !== false,
      excludeFromRewards: sub.excludeFromRewards === true,
      priority: index,
      createdAt: sub.createdAt ?? now,
      updatedAt: now,
    };
  });
}
