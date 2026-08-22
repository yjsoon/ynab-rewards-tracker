import { describe, expect, it, vi } from 'vitest';

import { categoryImportProviderFailureMessage, completeCategoryImportChat } from './complete';

describe('completeCategoryImportChat', () => {
  it('posts to the OpenCode chat-completions URL', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe('https://opencode.ai/zen/v1/chat/completions');
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"buckets":[]}' } }],
      }), { status: 200 });
    }) as typeof fetch;

    await expect(completeCategoryImportChat({
      provider: 'opencode',
      apiKey: 'zen-test',
      model: 'minimax-m2.7',
      system: 'sys',
      user: 'user',
      fetchImpl,
    })).resolves.toBe('{"buckets":[]}');
  });

  it('maps 401 to a British key-rejected message', async () => {
    const fetchImpl = vi.fn(async () => new Response('no', { status: 401 })) as typeof fetch;

    await expect(completeCategoryImportChat({
      provider: 'openai',
      apiKey: 'bad',
      model: 'gpt-4o-mini',
      system: 'sys',
      user: 'user',
      fetchImpl,
    })).rejects.toThrow('OpenAI API key was rejected.');
  });
});

describe('categoryImportProviderFailureMessage', () => {
  it('keeps known provider wording and hides unknown errors', () => {
    expect(categoryImportProviderFailureMessage(new Error('OpenAI API key was rejected.')))
      .toBe('OpenAI API key was rejected.');
    expect(categoryImportProviderFailureMessage(new Error('ECONNRESET')))
      .toBe('The model request failed. Check the API key and try again.');
  });
});
