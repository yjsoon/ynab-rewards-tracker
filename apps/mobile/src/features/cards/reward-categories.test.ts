import { describe, expect, it } from 'vitest';

import { buildRewardsDashboard } from '@ynab-counter/app-core/rewards-engine';
import { createDemoStorageFixture } from '@/lib/demo-data';

import { rankCardUses } from './reward-categories';

function demoDashboard() {
  const now = new Date('2026-08-02T12:00:00');
  const fixture = createDemoStorageFixture(now);
  const transactions = fixture.cachedData.dashboardTransactions?.[0]?.transactions ?? [];
  return {
    fixture,
    dashboard: buildRewardsDashboard(fixture.cards, transactions, fixture.settings, now),
  };
}

describe('rankCardUses', () => {
  it('ranks factual earning options without returning capped cards', () => {
    const { dashboard, fixture } = demoDashboard();

    const uses = rankCardUses(dashboard.cards, fixture.settings);

    expect(uses.map((item) => item.card.card.id)).toEqual([
      'demo-card-orbit',
      'demo-card-ember',
      'demo-card-tide',
    ]);
    expect(uses.map((item) => [item.use.label, item.rankGroup])).toEqual([
      ['Everyday spend', 'current'],
      ['Groceries', 'building'],
      ['Everyday spend', 'cap_limited'],
    ]);
    expect(uses.some((item) => item.card.card.id === 'demo-card-summit')).toBe(false);
  });

  it('does not invent everyday spend when enabled tiers are unavailable', () => {
    const { dashboard, fixture } = demoDashboard();
    const ember = dashboard.cards.find((item) => item.card.id === 'demo-card-ember');
    expect(ember).toBeDefined();

    const uses = rankCardUses([{
      ...ember!,
      rewardCategories: ember!.rewardCategories.map((category) => ({
        ...category,
        excluded: true,
      })),
    }], fixture.settings);

    expect(uses).toEqual([]);
  });

  it.each([
    { remaining: 5, expected: true },
    { remaining: 2, expected: false },
  ])('keeps a block card only when a whole block fits with $remaining room', ({
    remaining,
    expected,
  }) => {
    const { dashboard, fixture } = demoDashboard();
    const orbit = dashboard.cards.find((item) => item.card.id === 'demo-card-orbit');
    expect(orbit).toBeDefined();

    const uses = rankCardUses([{
      ...orbit!,
      status: 'near_cap',
      maximum: {
        ...orbit!.maximum,
        target: 1_000,
        remaining,
        reached: false,
      },
    }], fixture.settings);

    expect(uses.length > 0).toBe(expected);
  });

  it.each([
    { room: 100, expected: true },
    { room: 80, expected: true },
    { room: 79, expected: false },
  ])('includes a near-cap minimum only when it is reachable with $room room', ({
    room,
    expected,
  }) => {
    const { dashboard, fixture } = demoDashboard();
    const ember = dashboard.cards.find((item) => item.card.id === 'demo-card-ember');
    expect(ember).toBeDefined();

    const uses = rankCardUses([{
      ...ember!,
      status: 'near_cap',
      maximum: {
        ...ember!.maximum,
        target: 500,
        remaining: room,
        reached: false,
      },
    }], fixture.settings);

    expect(uses.length > 0).toBe(expected);
    if (expected) {
      expect(uses[0]?.rankGroup).toBe('building');
    }
  });
});
