import { describe, expect, it, vi } from 'vitest';

import { categoryImportProviderFailureMessage, completeCategoryImportChat } from './complete';
import { defaultModelFor, getCategoryImportProvider, resolveCategoryImportEndpoint } from './providers';

describe('category-import models', () => {
  it('defaults OpenAI and OpenRouter to GPT-5.6 Luna, and OpenCode to Luna', () => {
    expect(defaultModelFor('openai')).toBe('gpt-5.6-luna');
    expect(defaultModelFor('openrouter')).toBe('openai/gpt-5.6-luna');
    expect(defaultModelFor('opencode')).toBe('gpt-5.6-luna');
  });

  it('keeps OpenRouter to Luna, DeepSeek Flash, and Gemini Flash', () => {
    const values = getCategoryImportProvider('openrouter').models.map((model) => model.value);
    expect(values).toEqual([
      'openai/gpt-5.6-luna',
      '~deepseek/deepseek-v4-flash-latest',
      'google/gemini-3.5-flash-lite',
      '~google/gemini-flash-latest',
    ]);
    expect(values.some((value) => value.includes('claude') || value.includes('sol') || value.includes('terra')))
      .toBe(false);
  });

  it('routes OpenCode Luna and Muse Spark through Responses, including Go', () => {
    expect(resolveCategoryImportEndpoint('opencode', 'gpt-5.6-luna')).toEqual({
      apiModel: 'gpt-5.6-luna',
      url: 'https://opencode.ai/zen/v1/responses',
      transport: 'responses',
    });
    expect(resolveCategoryImportEndpoint('opencode', 'go/gpt-5.6-luna')).toEqual({
      apiModel: 'gpt-5.6-luna',
      url: 'https://opencode.ai/zen/go/v1/responses',
      transport: 'responses',
    });
    expect(resolveCategoryImportEndpoint('opencode', 'muse-spark-1.2-contributor-free')).toEqual({
      apiModel: 'muse-spark-1.2-contributor-free',
      url: 'https://opencode.ai/zen/v1/responses',
      transport: 'responses',
    });
    expect(resolveCategoryImportEndpoint('opencode', 'go/muse-spark-1.2-contributor')).toEqual({
      apiModel: 'muse-spark-1.2-contributor',
      url: 'https://opencode.ai/zen/go/v1/responses',
      transport: 'responses',
    });
    expect(resolveCategoryImportEndpoint('opencode', 'go/minimax-m3')).toEqual({
      apiModel: 'minimax-m3',
      url: 'https://opencode.ai/zen/go/v1/messages',
      transport: 'messages',
    });
  });
});

describe('completeCategoryImportChat', () => {
  it('posts listed OpenCode chat models to Zen chat-completions', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe('https://opencode.ai/zen/v1/chat/completions');
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"buckets":[]}' } }],
      }), { status: 200 });
    }) as typeof fetch;

    await expect(completeCategoryImportChat({
      provider: 'opencode',
      apiKey: 'zen-test',
      model: 'minimax-m3',
      system: 'sys',
      user: 'user',
      fetchImpl,
    })).resolves.toBe('{"buckets":[]}');
  });

  it('posts OpenCode Luna to Zen Responses at max effort', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://opencode.ai/zen/v1/responses');
      const body = JSON.parse(String(init?.body)) as {
        model?: string;
        instructions?: string;
        input?: string;
        reasoning?: { effort?: string };
        reasoning_effort?: string;
        messages?: unknown;
      };
      expect(body).toMatchObject({
        model: 'gpt-5.6-luna',
        instructions: 'sys',
        input: 'user',
        reasoning: { effort: 'max' },
      });
      expect(body.reasoning_effort).toBeUndefined();
      expect(body.messages).toBeUndefined();
      return new Response(JSON.stringify({
        output_text: '{"buckets":[]}',
      }), { status: 200 });
    }) as typeof fetch;

    await expect(completeCategoryImportChat({
      provider: 'opencode',
      apiKey: 'zen-test',
      model: 'gpt-5.6-luna',
      system: 'sys',
      user: 'user',
      fetchImpl,
    })).resolves.toBe('{"buckets":[]}');
  });

  it('posts MiniMax Go to the Anthropic messages endpoint', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://opencode.ai/zen/go/v1/messages');
      const headers = new Headers(init?.headers);
      expect(headers.get('anthropic-version')).toBe('2023-06-01');
      const body = JSON.parse(String(init?.body)) as {
        model?: string;
        max_tokens?: number;
        messages?: Array<{ role?: string }>;
      };
      expect(body).toMatchObject({
        model: 'minimax-m3',
        max_tokens: 8192,
      });
      expect(body.messages?.[0]?.role).toBe('user');
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: '{"buckets":[]}' }],
      }), { status: 200 });
    }) as typeof fetch;

    await expect(completeCategoryImportChat({
      provider: 'opencode',
      apiKey: 'zen-test',
      model: 'go/minimax-m3',
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

  it('sends OpenAI Luna at max reasoning effort', async () => {
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
