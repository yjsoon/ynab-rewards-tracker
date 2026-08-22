import { normaliseCategoryImportName } from './names';

export function relinkSpendingTierOverrides<
  Tier extends { subcategories?: Array<{ subcategoryId: string }> },
>(input: {
  spendingTiers: Tier[];
  previousSubcategories: Array<{ id: string; name: string }>;
  nextSubcategories: Array<{ id: string; name: string }>;
}): Tier[] {
  const previousNameById = new Map(
    input.previousSubcategories.map((subcategory) => [
      subcategory.id,
      normaliseCategoryImportName(subcategory.name),
    ]),
  );
  const nextIdByName = new Map(
    input.nextSubcategories.map((subcategory) => [
      normaliseCategoryImportName(subcategory.name),
      subcategory.id,
    ]),
  );
  const nextIds = new Set(input.nextSubcategories.map((subcategory) => subcategory.id));

  return input.spendingTiers.map((tier) => ({
    ...tier,
    subcategories: (tier.subcategories ?? []).flatMap((override) => {
      const nextId = nextIds.has(override.subcategoryId)
        ? override.subcategoryId
        : nextIdByName.get(previousNameById.get(override.subcategoryId) ?? '');
      if (!nextId) {
        return [];
      }
      return [{ ...override, subcategoryId: nextId }];
    }),
  }));
}
