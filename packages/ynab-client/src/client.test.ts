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

  it('patches only the flag on one plan transaction', async () => {
    const updatedTransaction = {
      id: 'transaction-1',
      date: '2026-07-31',
      amount: -12500,
      account_id: 'account-1',
      flag_color: 'green' as const,
      flag_name: 'Rewards',
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 209,
      json: async () => ({
        data: {
          transaction_ids: ['transaction-1'],
          transactions: [updatedTransaction],
          server_knowledge: 43,
        },
      }),
    });
    const client = new YnabClient({ accessToken: 'private-token', fetchImpl });

    await expect(
      client.updateTransactionFlag('plan-1', 'transaction-1', 'green'),
    ).resolves.toEqual(updatedTransaction);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.ynab.com/v1/plans/plan-1/transactions',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          transactions: [{ id: 'transaction-1', flag_color: 'green' }],
        }),
      }),
    );

    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      transactions: [{ id: 'transaction-1', flag_color: 'green' }],
    });
    expect(String(request.body)).not.toContain('private-token');
  });

  it('clears a transaction flag with an explicit null value', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 209,
      json: async () => ({
        data: {
          transaction_ids: ['transaction-1'],
          transactions: [],
          server_knowledge: 44,
        },
      }),
    });
    const client = new YnabClient({ accessToken: 'private-token', fetchImpl });

    await client.updateTransactionFlag('plan-1', 'transaction-1', null);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.ynab.com/v1/plans/plan-1/transactions',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          transactions: [{ id: 'transaction-1', flag_color: null }],
        }),
      }),
    );
  });

  it('rejects unsupported flag values before making a request', async () => {
    const fetchImpl = vi.fn();
    const client = new YnabClient({ accessToken: 'private-token', fetchImpl });

    await expect(client.updateTransactionFlag(
      'plan-1',
      'transaction-1',
      'pink' as never,
    )).rejects.toThrow('Unsupported YNAB transaction flag colour');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
