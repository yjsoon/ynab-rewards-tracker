import { describe, expect, it, vi } from 'vitest';

import { YnabClient } from './client';

describe('YnabClient', () => {
  it('uses YNAB plans endpoints while preserving budget-facing methods', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { plans: [] } }),
    });

    const client = new YnabClient({
      accessToken: 'test-token',
      fetchImpl,
    });

    await client.getBudgets();

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.ynab.com/v1/plans',
      expect.any(Object),
    );
  });

  it('uses plans paths for plan-scoped resources', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { accounts: [] } }),
    });

    const client = new YnabClient({
      accessToken: 'test-token',
      fetchImpl,
    });

    await client.getAccounts('plan-1', { lastKnowledgeOfServer: 42 });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.ynab.com/v1/plans/plan-1/accounts?last_knowledge_of_server=42',
      expect.any(Object),
    );
  });

  it('accepts legacy budget response keys for compatibility', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          budgets: [
            {
              id: 'budget-1',
              name: 'Legacy Budget',
              last_modified_on: '2026-01-01T00:00:00Z',
            },
          ],
        },
      }),
    });

    const client = new YnabClient({
      accessToken: 'test-token',
      fetchImpl,
    });

    await expect(client.getBudgets()).resolves.toEqual([
      {
        id: 'budget-1',
        name: 'Legacy Budget',
        last_modified_on: '2026-01-01T00:00:00Z',
      },
    ]);
  });

  it('throws when the plans response shape is unexpected', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { default_plan: null } }),
    });

    const client = new YnabClient({
      accessToken: 'test-token',
      fetchImpl,
    });

    await expect(client.getBudgets()).rejects.toThrow(
      'Unexpected YNAB plans response: missing plans array',
    );
  });
});
