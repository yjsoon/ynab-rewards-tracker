import { describe, expect, it } from 'vitest';

import { buildRewardsDashboard } from '@ynab-counter/app-core/rewards-engine';
import { createDemoStorageFixture } from '@/lib/demo-data';

import { collectRewardCategories } from './reward-categories';

describe('collectRewardCategories', () => {
  it('skips capped cards and keeps live reward categories', () => {
    const now = new Date('2026-08-02T12:00:00');
    const fixture = createDemoStorageFixture(now);
    const transactions = fixture.cachedData.dashboardTransactions?.[0]?.transactions ?? [];
    const dashboard = buildRewardsDashboard(fixture.cards, transactions, fixture.settings, now);

    const categories = collectRewardCategories(dashboard.cards);
    const cardIds = [...new Set(categories.map((item) => item.card.card.id))];

    expect(cardIds).not.toContain('demo-card-summit');
    expect(categories.length).toBeGreaterThan(0);
    expect(categories.every((item) => item.card.status !== 'capped')).toBe(true);
  });
});
