import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/category-import', () => {
  it('rejects malformed JSON', async () => {
    const response = await POST(new Request('https://example.test/api/category-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid payload' });
  });

  it('rejects a missing API key', async () => {
    const response = await POST(new Request('https://example.test/api/category-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        cardType: 'cashback',
        instructions: '4% dining',
      }),
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Add an OpenAI API key.',
    });
  });

  it('rejects a private terms URL before any model call', async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);

    const response = await POST(new Request('https://example.test/api/category-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'opencode',
        apiKey: 'zen-test',
        cardType: 'miles',
        termsUrl: 'http://127.0.0.1/terms',
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ kind: 'invalid_url' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns a compiled proposal when the model responds', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                cardLimits: null,
                buckets: [
                  { name: 'Dining', rewardValue: 4 },
                  { name: 'Everything else', rewardValue: 0.3 },
                ],
                spendingTiers: null,
                notes: [],
              }),
            },
          }],
        }));
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const response = await POST(new Request('https://example.test/api/category-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        apiKey: 'sk-test',
        cardType: 'cashback',
        instructions: '4% dining',
      }),
    }));

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      proposal?: { subcategories?: Array<{ name: string }> };
    };
    expect(payload.proposal?.subcategories?.map((subcategory) => subcategory.name)).toEqual([
      'Dining',
      'Everything else',
    ]);
  });
});
