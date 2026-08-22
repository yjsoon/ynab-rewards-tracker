import { describe, expect, it } from 'vitest';

import { mergeCategoryImportCredentials } from './settings';

describe('mergeCategoryImportCredentials', () => {
  it('keeps keys and models for other providers', () => {
    expect(mergeCategoryImportCredentials(
      {
        provider: 'gemini',
        categoryImportProvider: 'openai',
        apiKeys: { openai: 'sk-old', gemini: 'gem', opencode: 'zen' },
        modelByProvider: { openai: 'gpt-4o-mini', opencode: 'minimax-m2.7' },
        customPrompt: 'keep me',
      },
      { provider: 'opencode', model: 'glm-5.1', apiKey: 'zen-new' },
    )).toEqual({
      provider: 'gemini',
      categoryImportProvider: 'opencode',
      apiKeys: { openai: 'sk-old', gemini: 'gem', opencode: 'zen-new' },
      modelByProvider: { openai: 'gpt-4o-mini', opencode: 'glm-5.1' },
      customPrompt: 'keep me',
    });
  });
});
