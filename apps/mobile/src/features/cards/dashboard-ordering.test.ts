import { describe, expect, it } from 'vitest';

import type { CardDashboardProjection } from '@ynab-counter/app-core/rewards-engine';

import { orderCardProjections, orderTypedCardProjections } from './card-ordering';

function stub(id: string, type: 'cashback' | 'miles'): CardDashboardProjection {
  return { card: { id, type } } as CardDashboardProjection;
}

describe('orderTypedCardProjections', () => {
  const cards = [
    stub('cash-b', 'cashback'),
    stub('miles-b', 'miles'),
    stub('cash-a', 'cashback'),
    stub('miles-a', 'miles'),
  ];

  it('applies cashback and miles sequences independently', () => {
    expect(orderTypedCardProjections(
      cards,
      ['cash-a', 'cash-b'],
      ['miles-a', 'miles-b'],
    ).map((projection) => projection.card.id)).toEqual([
      'cash-a',
      'cash-b',
      'miles-a',
      'miles-b',
    ]);
  });

  it('keeps type groups even when an all-card order exists on the shared helper', () => {
    expect(orderCardProjections(
      cards,
      ['miles-b', 'cash-b', 'miles-a', 'cash-a'],
      ['cash-a', 'cash-b'],
      ['miles-a', 'miles-b'],
    ).map((projection) => projection.card.id)).toEqual([
      'miles-b',
      'cash-b',
      'miles-a',
      'cash-a',
    ]);
    expect(orderTypedCardProjections(
      cards,
      ['cash-a', 'cash-b'],
      ['miles-a', 'miles-b'],
    ).map((projection) => projection.card.id)).toEqual([
      'cash-a',
      'cash-b',
      'miles-a',
      'miles-b',
    ]);
  });
});
