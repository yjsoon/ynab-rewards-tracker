import { describe, expect, it } from 'vitest';

import { createDefaultStorage } from '../storage';
import {
  STORAGE_KEY_PORTABILITY,
  createCloudSyncPayload,
  parseCloudSyncPayload,
  resolveCloudSyncDirtyMarker,
} from './payload';

function keysWithKind(
  kind: (typeof STORAGE_KEY_PORTABILITY)[keyof typeof STORAGE_KEY_PORTABILITY],
) {
  return (Object.keys(STORAGE_KEY_PORTABILITY) as Array<keyof typeof STORAGE_KEY_PORTABILITY>)
    .filter((key) => STORAGE_KEY_PORTABILITY[key] === kind);
}

describe('Cloud Sync payloads', () => {
  it('clears only the dirty marker represented by a completed snapshot', () => {
    expect(resolveCloudSyncDirtyMarker('snapshot', 'snapshot')).toBeUndefined();
    expect(resolveCloudSyncDirtyMarker('snapshot', 'newer-edit')).toBe('newer-edit');
    expect(resolveCloudSyncDirtyMarker(undefined, 'newer-edit')).toBe('newer-edit');
  });

  it('exclude credentials, recovery codes, API keys, transactions and calculations', () => {
    const data = createDefaultStorage();
    data.ynab.pat = 'secret-pat';
    data.ynab.howmuchToken = 'secret-howmuch';
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
    expect(payload.ynab.howmuchToken).toBeUndefined();
    expect(payload.settings.cloudSyncMnemonic).toBeUndefined();
    expect(payload.settings.cloudSyncLocalChangedAt).toBeUndefined();
    expect(payload.settings.statementFormatter?.apiKeys).toBeUndefined();
    expect(payload.calculations).toEqual([]);
    expect(payload.cachedData).toBeUndefined();
    expect(payload.ynab.selectedBudgetId).toBe('budget-1');
  });

  it('accepts a web-shaped snapshot but strips local-only fields on restore', () => {
    const parsed = parseCloudSyncPayload({
      ynab: { pat: 'must-not-import', howmuchToken: 'must-not-import', selectedBudgetId: 'budget-1', trackedAccountIds: ['a1'] },
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
    expect(parsed.ynab.howmuchToken).toBeUndefined();
    expect(parsed.ynab.selectedBudgetId).toBe('budget-1');
    expect(parsed.settings.currency).toBe('SGD');
    expect(parsed.settings.cloudSyncMnemonic).toBeUndefined();
    expect(parsed.settings.cloudSyncLocalChangedAt).toBeUndefined();
    expect(parsed.settings.statementFormatter?.apiKeys).toBeUndefined();
    expect(parsed.calculations).toEqual([]);
    expect(parsed.cachedData).toBeUndefined();
  });

  it('includes every portable key and omits every device-local key', () => {
    const payload = createCloudSyncPayload(createDefaultStorage());

    for (const key of keysWithKind('portable')) {
      expect(key in payload).toBe(true);
    }
    for (const key of keysWithKind('device-local')) {
      expect(key in payload).toBe(false);
    }
    expect(payload.calculations).toEqual([]);
  });

  it('round-trips portable configuration including nested card fields', () => {
    const data = createDefaultStorage();
    data.cards = [{
      id: 'card-1',
      name: 'Rewards',
      issuer: 'Bank',
      type: 'cashback',
      ynabAccountId: 'acct-1',
      featured: true,
      earningRate: 1,
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        monthlyMinimumSpend: 200,
      },
      spendingTiers: [
        { id: 'tier-1', spendThreshold: 1000, earningRate: 4 },
      ],
    }];
    data.rules = [{
      id: 'rule-1',
      cardId: 'card-1',
      name: 'Dining',
      rewardType: 'cashback',
      rewardValue: 4,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      active: true,
      priority: 0,
    }];
    data.tagMappings = [{
      id: 'map-1',
      cardId: 'card-1',
      ynabTag: 'dining',
      rewardCategory: 'Dining',
    }];
    data.themeGroups = [{
      id: 'theme-1',
      name: 'Dining',
      priority: 0,
      subcategories: [],
      cards: [{ cardId: 'card-1' }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }];
    data.hiddenCards = [{
      cardId: 'card-1',
      hiddenUntil: '2027-12-31T00:00:00.000Z',
      reason: 'maximum_spend_reached',
    }];
    data.settings.currency = 'SGD';

    const parsed = parseCloudSyncPayload(createCloudSyncPayload(data));

    expect(parsed.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'card-1',
        rewardPeriod: {
          monthCount: 3,
          anchorDate: '2026-01-01',
          monthlyMinimumSpend: 200,
        },
        spendingTiers: [
          expect.objectContaining({ id: 'tier-1', spendThreshold: 1000, earningRate: 4 }),
        ],
      }),
    ]));
    expect(parsed.rules).toEqual(data.rules);
    expect(parsed.tagMappings).toEqual(data.tagMappings);
    expect(parsed.themeGroups).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'theme-1', name: 'Dining' }),
    ]));
    expect(parsed.hiddenCards).toEqual(data.hiddenCards);
    expect(parsed.settings.currency).toBe('SGD');
  });

  it('parses an old fat web dump and drops secrets and caches', () => {
    const parsed = parseCloudSyncPayload({
      ynab: {
        pat: 'legacy-pat',
        selectedBudgetId: 'budget-1',
        selectedBudgetName: 'Main',
        trackedAccountIds: ['acct-1'],
      },
      cards: [{
        id: 'card-1',
        name: 'Rewards',
        issuer: 'Bank',
        type: 'cashback',
        ynabAccountId: 'acct-1',
        featured: true,
      }],
      rules: [],
      tagMappings: [],
      calculations: [{
        cardId: 'card-1',
        ruleId: 'rule-1',
        period: '2026-07',
        totalSpend: 10,
        eligibleSpend: 10,
        rewardEarned: 1,
        rewardType: 'cashback',
        minimumMet: true,
        maximumExceeded: false,
        shouldStopUsing: false,
      }],
      themeGroups: [],
      hiddenCards: [],
      settings: {
        currency: 'SGD',
        cloudSyncMnemonic: 'legacy phrase',
        rememberCloudSyncCode: true,
        autoSyncEnabled: true,
        statementFormatter: { apiKeys: { openai: 'legacy-key' } },
      },
      cachedData: {
        lastUpdated: '2026-07-31T00:00:00Z',
        transactions: [{ id: 'txn-1' }],
      },
    });

    expect(parsed.ynab.pat).toBeUndefined();
    expect(parsed.settings.cloudSyncMnemonic).toBeUndefined();
    expect(parsed.settings.statementFormatter?.apiKeys).toBeUndefined();
    expect(parsed.calculations).toEqual([]);
    expect(parsed.cachedData).toBeUndefined();
    expect(parsed.cards[0]?.id).toBe('card-1');
    expect(parsed.settings.currency).toBe('SGD');
  });

  it('rejects malformed decrypted data before it reaches storage', () => {
    expect(() => parseCloudSyncPayload({ rules: [], settings: {} })).toThrow('cards');
    expect(() => parseCloudSyncPayload({ cards: [], settings: {} })).toThrow('rules');
  });
});
