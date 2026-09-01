import { describe, expect, it } from 'vitest';

import { buildRewardsDashboard, type CardDashboardProjection } from '@ynab-counter/app-core/rewards-engine';
import type { MonthlyQualificationBreakdown } from '@ynab-counter/app-core/storage';

import { createDemoStorageFixture } from '@/lib/demo-data';
import { cardAttentionStatus, daysLeftInPeriod, qualificationRow } from './attention';

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

describe('qualificationRow', () => {
  const formatting = { currencyRounded: (value: number) => `$${value}` };

  function month(
    start: string,
    spend: number,
    status: MonthlyQualificationBreakdown['status'],
  ): MonthlyQualificationBreakdown {
    return { start, end: start.replace(/-01$/, '-28'), spend, minimumSpend: 500, status };
  }

  function row(
    status: 'pending' | 'met' | 'failed',
    months: MonthlyQualificationBreakdown[],
    asOf = '2026-09-01',
  ) {
    return qualificationRow({
      card: {
        rewardPeriod: {
          monthCount: 3,
          anchorDate: '2026-07-01',
          monthlyMinimumSpend: 500,
        },
      },
      calculation: {
        monthlyMinimumSpend: 500,
        qualificationStatus: status,
        monthlyQualifications: months,
      },
      calculationPeriod: { asOf, end: '2026-09-30' },
    } as CardDashboardProjection, formatting);
  }

  it('keeps this month and notes earlier months already met', () => {
    expect(row('pending', [
      month('2026-07-01', 551, 'met'),
      month('2026-08-01', 500, 'met'),
      month('2026-09-01', 0, 'pending'),
    ])).toEqual({
      tone: 'attention',
      label: 'This month: $0 of $500 · 2 of 3 months met',
    });
  });

  it('keeps this month visible when a completed month missed', () => {
    expect(row('failed', [
      month('2026-07-01', 400, 'failed'),
      month('2026-08-01', 500, 'met'),
      month('2026-09-01', 80, 'pending'),
    ])).toEqual({
      tone: 'destructive',
      label: 'This month: $80 of $500 · 1 of 3 months missed',
    });
  });
});
