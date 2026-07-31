import { describe, expect, it } from 'vitest';

import { createDemoStorageFixture } from '@/lib/demo-data';
import { createLocalFlagUpdatePublication } from '@/features/activity/flag-update-publication';
import { selectCurrentCardCalculations } from '@ynab-counter/app-core/rewards-engine/utils/recommendation-helpers';

describe('complete-cache card edit publication', () => {
  it('rebuilds the current calculation consumed by Recommendations', () => {
    const now = new Date('2026-08-01T12:00:00.000Z');
    const fixture = createDemoStorageFixture(now);
    const card = fixture.cards.find((candidate) => !candidate.subcategoriesEnabled)!;
    const previous = selectCurrentCardCalculations(
      fixture.cards,
      fixture.calculations,
      now,
    ).find((calculation) => calculation.cardId === card.id)!;
    const cards = fixture.cards.map((candidate) => (
      candidate.id === card.id
        ? { ...candidate, earningRate: (candidate.earningRate ?? 0) * 2 }
        : candidate
    ));

    const publication = createLocalFlagUpdatePublication({
      cacheEntry: fixture.cachedData.dashboardTransactions![0],
      cards,
      settings: fixture.settings,
      calculations: fixture.calculations,
      now,
    });
    const updated = selectCurrentCardCalculations(
      cards,
      publication.calculations,
      now,
    ).find((calculation) => calculation.cardId === card.id)!;

    expect(updated.rewardEarned).toBeCloseTo(previous.rewardEarned * 2);
  });
});
