import { describe, expect, it } from 'vitest';

import { buildCategoryImportPrompt } from './prompt';

describe('buildCategoryImportPrompt', () => {
  it('forbids flag assignment and names the card type', () => {
    const prompt = buildCategoryImportPrompt({
      cardType: 'miles',
      instructions: 'UOB PPV, keep contactless at 4',
    });

    expect(prompt.system.toLowerCase()).toContain('do not assign ynab flags');
    expect(prompt.user).toContain('Card type: miles');
    expect(prompt.user.toLowerCase()).toContain('miles per dollar');
  });
});
