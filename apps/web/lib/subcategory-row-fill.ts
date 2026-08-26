export function hasSubcategoryMaximum(
  maximumSpend: number | null | undefined,
): maximumSpend is number {
  return typeof maximumSpend === 'number' && maximumSpend > 0;
}

export function uncappedSubcategoryScale(
  entries: ReadonlyArray<{
    totalSpend: number;
    maximumSpend?: number | null;
  }>,
): number {
  return entries.reduce((maxSpend, entry) => {
    if (hasSubcategoryMaximum(entry.maximumSpend)) {
      return maxSpend;
    }
    return Math.max(maxSpend, entry.totalSpend);
  }, 0);
}

/**
 * Row fill for the compact subcategory list.
 * Capped rows show progress toward their own maximum.
 * Uncapped rows scale against the largest uncapped spend so the list uses
 * the full row width instead of each row's share of a many-way split.
 */
export function subcategoryRowFillPercent(input: {
  totalSpend: number;
  maximumSpend?: number | null;
  uncappedScale: number;
}): number {
  if (hasSubcategoryMaximum(input.maximumSpend)) {
    if (input.totalSpend <= 0) {
      return 0;
    }
    return Math.min(100, (input.totalSpend / input.maximumSpend) * 100);
  }

  if (input.uncappedScale <= 0 || input.totalSpend <= 0) {
    return 0;
  }

  return Math.min(100, (input.totalSpend / input.uncappedScale) * 100);
}
