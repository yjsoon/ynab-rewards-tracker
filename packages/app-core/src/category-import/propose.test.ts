import { describe, expect, it } from 'vitest';

import { proposeCardCategories } from './propose';

describe('proposeCardCategories', () => {
  it('fetches terms, calls the model, and compiles a proposal', async () => {
    const result = await proposeCardCategories(
      {
        cardType: 'cashback',
        source: { kind: 'both', instructions: 'Keep dining at 4%', url: 'https://bank.example/terms' },
        earningRate: 0.3,
      },
      { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' },
      {
        fetchText: async () => '<html><p>4% dining, 0.3% everything else</p></html>',
        completeChat: async ({ system, user }) => {
          expect(system.toLowerCase()).toContain('do not assign ynab flags');
          expect(user).toContain('Keep dining at 4%');
          expect(user).toContain('4% dining');
          return JSON.stringify({
            cardLimits: null,
            buckets: [
              { name: 'Dining', rewardValue: 4, milesBlockSize: null, minimumSpend: null, maximumSpend: null, excludeFromRewards: false, inclusion: null },
              { name: 'Everything else', rewardValue: 0.3, milesBlockSize: null, minimumSpend: null, maximumSpend: null, excludeFromRewards: false, inclusion: null },
            ],
            spendingTiers: null,
            notes: [],
          });
        },
      },
    );

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.proposal.subcategories.map((subcategory) => subcategory.name)).toEqual([
      'Dining',
      'Everything else',
    ]);
  });

  it('maps a fetch throw to fetch_failed', async () => {
    const result = await proposeCardCategories(
      { cardType: 'cashback', source: { kind: 'termsUrl', url: 'https://bank.example/terms' } },
      { provider: 'opencode', apiKey: 'zen', model: 'minimax-m2.7' },
      {
        fetchText: async () => {
          throw new Error('blocked');
        },
        completeChat: async () => {
          throw new Error('should not run');
        },
      },
    );
    expect(result).toEqual({
      kind: 'fetch_failed',
      message: 'Could not read those terms.',
    });
  });
});
