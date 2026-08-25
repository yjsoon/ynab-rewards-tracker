import { describe, expect, it } from 'vitest';

import {
  createProviderMigrationSnapshot,
  providerMigrationSnapshotsMatch,
  validateProviderMigration,
} from './providerMigration';

describe('provider migration snapshots', () => {
  it('compares account IDs without depending on order or duplicates', () => {
    const expected = createProviderMigrationSnapshot({
      selectedBudgetId: 'budget-1',
      trackedAccountIds: ['account-2', 'account-1', 'account-1'],
      linkedCardAccountIds: ['account-3'],
    });

    expect(providerMigrationSnapshotsMatch({
      selectedBudgetId: 'budget-1',
      trackedAccountIds: ['account-1', 'account-2'],
      linkedCardAccountIds: ['account-3', 'account-3'],
    }, expected)).toBe(true);
    expect(providerMigrationSnapshotsMatch({
      ...expected,
      linkedCardAccountIds: ['different-account'],
    }, expected)).toBe(false);
  });
});

describe('validateProviderMigration', () => {
  const currentConnection = {
    selectedBudgetId: 'budget-1',
    trackedAccountIds: ['account-1'],
    linkedCardAccountIds: ['account-1', 'account-2'],
  };

  it('accepts a target that preserves the budget and every linked card account', () => {
    expect(validateProviderMigration({
      ...currentConnection,
      budgets: [{ id: 'budget-1', name: 'My budget' }],
      accounts: [{ id: 'account-2' }, { id: 'account-1' }],
    })).toEqual({
      ok: true,
      budget: { id: 'budget-1', name: 'My budget' },
    });
  });

  it('rejects a target without the current budget', () => {
    expect(validateProviderMigration({
      ...currentConnection,
      budgets: [{ id: 'different-budget', name: 'Another budget' }],
      accounts: [{ id: 'account-1' }, { id: 'account-2' }],
    })).toEqual({ ok: false, reason: 'budget-not-found' });
  });

  it('reports every tracked or linked account missing from the target', () => {
    expect(validateProviderMigration({
      ...currentConnection,
      trackedAccountIds: ['account-3', 'account-1'],
      budgets: [{ id: 'budget-1', name: 'My budget' }],
      accounts: [{ id: 'account-1' }],
    })).toEqual({
      ok: false,
      reason: 'accounts-not-found',
      missingAccountIds: ['account-2', 'account-3'],
    });
  });
});
