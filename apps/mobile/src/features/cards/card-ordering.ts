import type { CardDashboardProjection } from '@ynab-counter/app-core/rewards-engine';

function applyOrdering(
  cards: CardDashboardProjection[],
  order: string[] | undefined,
): CardDashboardProjection[] {
  if (!order?.length) {
    return cards;
  }

  const byId = new Map(cards.map((projection) => [projection.card.id, projection] as const));
  const seen = new Set<string>();
  const ordered: CardDashboardProjection[] = [];

  for (const id of order) {
    const match = byId.get(id);
    if (match && !seen.has(id)) {
      ordered.push(match);
      seen.add(id);
    }
  }

  for (const projection of cards) {
    if (!seen.has(projection.card.id)) {
      ordered.push(projection);
    }
  }

  return ordered;
}

export function orderCardProjections(
  cards: CardDashboardProjection[],
  allOrder?: string[],
  cashbackOrder?: string[],
  milesOrder?: string[],
): CardDashboardProjection[] {
  if (allOrder?.length) {
    return applyOrdering(cards, allOrder);
  }

  if (cashbackOrder?.length || milesOrder?.length) {
    const cashback = applyOrdering(
      cards.filter(({ card }) => card.type === 'cashback'),
      cashbackOrder,
    );
    const miles = applyOrdering(
      cards.filter(({ card }) => card.type === 'miles'),
      milesOrder,
    );
    return [...cashback, ...miles];
  }

  return cards;
}

export function orderTypedCardProjections(
  cards: CardDashboardProjection[],
  cashbackOrder?: string[],
  milesOrder?: string[],
): CardDashboardProjection[] {
  const cashback = applyOrdering(
    cards.filter(({ card }) => card.type === 'cashback'),
    cashbackOrder,
  );
  const miles = applyOrdering(
    cards.filter(({ card }) => card.type === 'miles'),
    milesOrder,
  );
  return [...cashback, ...miles];
}
