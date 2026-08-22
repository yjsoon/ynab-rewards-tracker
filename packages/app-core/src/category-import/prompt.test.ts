import { describe, expect, it } from 'vitest';

import { buildCategoryImportPrompt } from './prompt';

describe('buildCategoryImportPrompt', () => {
  it('forbids flag assignment and names the card type', () => {
    const prompt = buildCategoryImportPrompt({
      cardType: 'miles',
      instructions: 'UOB PPV, keep contactless at 4',
    });

    expect(prompt.system.toLowerCase()).toContain('do not assign ynab flags');
    expect(prompt.user).toContain('Card type is miles (miles per dollar)');
    expect(prompt.system).toContain('at most 6 earning buckets plus a catch-all');

    const cashbackPrompt = buildCategoryImportPrompt({ cardType: 'cashback' });
    expect(cashbackPrompt.user).toContain('Card type is cashback (%)');
  });
});
