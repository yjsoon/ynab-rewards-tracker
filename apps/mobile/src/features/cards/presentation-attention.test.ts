import { describe, expect, it } from 'vitest';

import { buildRewardsDashboard } from '@ynab-counter/app-core/rewards-engine';

import { createDemoStorageFixture } from '@/lib/demo-data';
import { cardAttentionStatus, daysLeftInPeriod } from './attention';

const REFERENCE_DATE = new Date(Date.UTC(2026, 6, 31, 12, 0, 0));

describe('cardAttentionStatus', () => {
  it('maps the demo fixture onto the five web strip slots', () => {
    const fixture = createDemoStorageFixture(REFERENCE_DATE);
    const transactions = fixture.cachedData.dashboardTransactions?.[0]?.transactions ?? [];
    const dashboard = buildRewardsDashboard(
      fixture.cards,
      transactions,
      fixture.settings,
      REFERENCE_DATE,
    );

    expect(dashboard.cards.map((card) => cardAttentionStatus(card))).toEqual([
      'below-minimum',
      'earning',
      'near-cap',
      'at-cap',
    ]);
  });

  it('lets a failed qualification win over other portfolio statuses', () => {
    const fixture = createDemoStorageFixture(REFERENCE_DATE);
    const transactions = fixture.cachedData.dashboardTransactions?.[0]?.transactions ?? [];
    const dashboard = buildRewardsDashboard(
      fixture.cards,
      transactions,
      fixture.settings,
      REFERENCE_DATE,
    );
    const capped = dashboard.cards.find((card) => card.status === 'capped');
    expect(capped).toBeDefined();
    if (!capped) {
      return;
    }

    expect(cardAttentionStatus({
      ...capped,
      calculation: {
        ...capped.calculation,
        qualificationStatus: 'failed',
      },
    })).toBe('qualification-failed');
  });

  it('counts days from the period end, not the reset morning', () => {
    const fixture = createDemoStorageFixture(REFERENCE_DATE);
    const transactions = fixture.cachedData.dashboardTransactions?.[0]?.transactions ?? [];
    const dashboard = buildRewardsDashboard(
      fixture.cards,
      transactions,
      fixture.settings,
      REFERENCE_DATE,
    );
    const ember = dashboard.cards.find((card) => card.card.id === 'demo-card-ember');
    expect(ember).toBeDefined();
    if (!ember) {
      return;
    }

    expect(daysLeftInPeriod(ember.period.end, REFERENCE_DATE)).toBe(0);
    expect(ember.daysRemaining).toBeGreaterThan(0);
  });
});
