import { describe, expect, it } from 'vitest';

import { createDefaultStorage } from '../storage';
import {
  createCloudSyncPayload,
  parseCloudSyncPayload,
  resolveCloudSyncDirtyMarker,
} from './payload';

describe('Cloud Sync payloads', () => {
  it('clears only the dirty marker represented by a completed snapshot', () => {
    expect(resolveCloudSyncDirtyMarker('snapshot', 'snapshot')).toBeUndefined();
    expect(resolveCloudSyncDirtyMarker('snapshot', 'newer-edit')).toBe('newer-edit');
    expect(resolveCloudSyncDirtyMarker(undefined, 'newer-edit')).toBe('newer-edit');
  });

  it('exclude credentials, recovery codes, API keys, transactions and calculations', () => {
    const data = createDefaultStorage();
    data.ynab.pat = 'secret-pat';
    data.ynab.selectedBudgetId = 'budget-1';
    data.settings = {
      currency: 'SGD',
      cloudSyncMnemonic: 'secret phrase',
      cloudSyncLocalChangedAt: '2026-07-31T01:00:00Z',
      rememberCloudSyncCode: true,
      autoSyncEnabled: true,
      statementFormatter: { apiKeys: { openai: 'secret-key', opencode: 'zen-secret' } },
    };
    data.calculations = [{
      cardId: 'card-1', ruleId: 'rule-1', period: '2026-07', totalSpend: 10,
      eligibleSpend: 10, rewardEarned: 1, rewardType: 'cashback', minimumMet: true,
      maximumExceeded: false, shouldStopUsing: false,
    }];
    data.cachedData = { lastUpdated: '2026-07-31T00:00:00Z' };

    const payload = createCloudSyncPayload(data);
    expect(payload.ynab.pat).toBeUndefined();
    expect(payload.settings.cloudSyncMnemonic).toBeUndefined();
    expect(payload.settings.cloudSyncLocalChangedAt).toBeUndefined();
    expect(payload.settings.statementFormatter?.apiKeys).toBeUndefined();
    expect(payload.calculations).toEqual([]);
    expect(payload.cachedData).toBeUndefined();
    expect(payload.ynab.selectedBudgetId).toBe('budget-1');
  });

  it('accepts a web-shaped snapshot but strips local-only fields on restore', () => {
    const parsed = parseCloudSyncPayload({
      ynab: { pat: 'must-not-import', selectedBudgetId: 'budget-1', trackedAccountIds: ['a1'] },
      cards: [],
      rules: [],
      tagMappings: [],
      calculations: [{ secret: 'stale' }],
      themeGroups: [],
      hiddenCards: [],
      settings: {
        currency: 'SGD',
        cloudSyncMnemonic: 'must-not-import',
        cloudSyncLocalChangedAt: '2026-07-31T01:00:00Z',
        statementFormatter: { apiKeys: { openai: 'must-not-import', opencode: 'must-not-import' } },
      },
      cachedData: { transactions: [{ secret: true }] },
    });

    expect(parsed.ynab.pat).toBeUndefined();
    expect(parsed.ynab.selectedBudgetId).toBe('budget-1');
    expect(parsed.settings.currency).toBe('SGD');
    expect(parsed.settings.cloudSyncMnemonic).toBeUndefined();
    expect(parsed.settings.cloudSyncLocalChangedAt).toBeUndefined();
    expect(parsed.settings.statementFormatter?.apiKeys).toBeUndefined();
    expect(parsed.calculations).toEqual([]);
    expect(parsed.cachedData).toBeUndefined();
  });

  it('rejects malformed decrypted data before it reaches storage', () => {
    expect(() => parseCloudSyncPayload({ rules: [], settings: {} })).toThrow('cards');
    expect(() => parseCloudSyncPayload({ cards: [], settings: {} })).toThrow('rules');
  });
});
