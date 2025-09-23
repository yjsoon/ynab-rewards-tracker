import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from './ynab-constants';
import type { CardSubcategory } from './storage';

const generateId = () =>
  (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `subcat-${Math.random().toString(36).slice(2, 10)}`;

const normaliseNumber = (value: unknown, fallback: number | null = null): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallback;
};

export function prepareSubcategoriesForSave(
  subcategories: CardSubcategory[] | undefined,
  rewardFallback: number
): CardSubcategory[] {
  const list = Array.isArray(subcategories) ? subcategories : [];

  return list.map((sub, index) => {
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
      minimumSpend:
        normaliseNumber(sub.minimumSpend, sub.minimumSpend === 0 ? 0 : null),
      maximumSpend:
        normaliseNumber(sub.maximumSpend, sub.maximumSpend === 0 ? 0 : null),
      active: sub.active !== false,
      excludeFromRewards: sub.excludeFromRewards === true, // Preserve exclude flag
      priority: index,
      createdAt: sub.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });
}
