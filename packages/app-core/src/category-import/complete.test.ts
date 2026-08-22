import { describe, expect, it, vi } from 'vitest';

import { categoryImportProviderFailureMessage, completeCategoryImportChat } from './complete';
import { defaultModelFor } from './providers';

describe('completeCategoryImportChat', () => {
  it('defaults OpenAI to GPT-5.6 Luna', () => {
    expect(defaultModelFor('openai')).toBe('gpt-5.6-luna');
    expect(defaultModelFor('openrouter')).toBe('openai/gpt-5.6-luna');
    expect(defaultModelFor('opencode')).toBe('minimax-m3');
  });

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
      model: 'gpt-5.6-luna',
      system: 'sys',
      user: 'user',
      fetchImpl,
    })).rejects.toThrow('OpenAI API key was rejected.');
  });

  it('sends Luna at max reasoning effort', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        model?: string;
        reasoning_effort?: string;
        temperature?: number;
      };
      expect(body).toMatchObject({
        model: 'gpt-5.6-luna',
        reasoning_effort: 'max',
      });
      expect(body.temperature).toBeUndefined();
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"buckets":[]}' } }],
      }), { status: 200 });
    }) as typeof fetch;

    await expect(completeCategoryImportChat({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-5.6-luna',
      system: 'sys',
      user: 'user',
      fetchImpl,
    })).resolves.toBe('{"buckets":[]}');
  });

  it('omits temperature for GPT-5.6 Terra and Sol', async () => {
    for (const model of ['gpt-5.6-terra', 'gpt-5.6-sol', 'openai/gpt-5.6-sol']) {
      const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          model?: string;
          reasoning_effort?: string;
          temperature?: number;
        };
        expect(body.model).toBe(model);
        expect(body.temperature).toBeUndefined();
        expect(body.reasoning_effort).toBeUndefined();
        return new Response(JSON.stringify({
          choices: [{ message: { content: '{"buckets":[]}' } }],
        }), { status: 200 });
      }) as typeof fetch;

      await expect(completeCategoryImportChat({
        provider: model.startsWith('openai/') ? 'openrouter' : 'openai',
        apiKey: 'sk-test',
        model,
        system: 'sys',
        user: 'user',
        fetchImpl,
      })).resolves.toBe('{"buckets":[]}');
    }
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
