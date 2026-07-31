import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildRewardsDashboard,
  projectTransactions,
} from '@ynab-counter/app-core/rewards-engine';

import {
  DEMO_SESSION_CREDENTIAL,
  createDemoStorageFixture,
  getDemoPortfolioStatuses,
} from './demo-data';

const REFERENCE_DATE = new Date(2026, 6, 31, 12, 0, 0);

describe('mobile simulator fixture', () => {
  it('covers every high-signal overview state with the production projection', () => {
    assert.deepEqual(getDemoPortfolioStatuses(REFERENCE_DATE), [
      'building',
      'earning',
      'near_cap',
      'capped',
    ]);

    const fixture = createDemoStorageFixture(REFERENCE_DATE);
    const transactions = fixture.cachedData.dashboardTransactions?.[0]?.transactions ?? [];
    const dashboard = buildRewardsDashboard(
      fixture.cards,
      transactions,
      fixture.settings,
      REFERENCE_DATE,
    );

    assert.equal(dashboard.totals.cardCount, 4);
    assert.deepEqual({
      building: dashboard.totals.statusCounts.building,
      earning: dashboard.totals.statusCounts.earning,
      near_cap: dashboard.totals.statusCounts.near_cap,
      capped: dashboard.totals.statusCounts.capped,
    }, {
      building: 1,
      earning: 1,
      near_cap: 1,
      capped: 1,
    });
    assert.ok(dashboard.totals.nativeRewards.cashback > 0);
    assert.ok(dashboard.totals.nativeRewards.miles > 0);
  });

  it('includes earning, excluded, block-rounded, and incoming activity', () => {
    const fixture = createDemoStorageFixture(REFERENCE_DATE);
    const cache = fixture.cachedData.dashboardTransactions?.[0];
    const projections = projectTransactions(
      cache?.transactions ?? [],
      fixture.cards,
      fixture.settings,
      new Map(cache?.accounts.map(({ id, name }) => [id, name] as const)),
    );

    assert.ok(projections.some(({ status }) => status === 'earning'));
    assert.ok(projections.some(({ status }) => status === 'incoming'));
    assert.ok(projections.some(({ noRewardReason }) => noRewardReason === 'excluded'));
    assert.ok(projections.some(({ blockInfo }) => blockInfo?.size === 5));
  });

  it('uses only a clearly invalid session marker for connected demo UI', () => {
    const fixture = createDemoStorageFixture(REFERENCE_DATE);

    assert.equal(fixture.pat, DEMO_SESSION_CREDENTIAL);
    assert.ok(fixture.pat.includes('not-a-ynab-token'));
    assert.equal(fixture.settings.statementFormatter?.apiKeys, undefined);
    assert.equal(fixture.settings.cloudSyncMnemonic, undefined);
  });
});
