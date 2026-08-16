import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultStorage,
  STORAGE_KEY,
  STORAGE_VERSION,
  STORAGE_VERSION_KEY,
} from '@ynab-counter/app-core/storage';
import { RecommendationEngine } from '@ynab-counter/app-core/rewards-engine';

const mocks = vi.hoisted(() => ({
  asyncValues: new Map<string, string>(),
  secureValues: new Map<string, string>(),
  getString: vi.fn(async (key: string) => mocks.asyncValues.get(key) ?? null),
  setString: vi.fn(async (key: string, value: string) => {
    mocks.asyncValues.set(key, value);
  }),
  remove: vi.fn(async (key: string) => {
    mocks.asyncValues.delete(key);
  }),
  getSecure: vi.fn(async (key: string) => mocks.secureValues.get(key) ?? null),
  setSecure: vi.fn(async (key: string, value: string) => {
    mocks.secureValues.set(key, value);
  }),
  deleteSecure: vi.fn(async (key: string) => {
    mocks.secureValues.delete(key);
  }),
}));

vi.mock('./async-storage', () => ({
  AsyncStorageService: {
    getString: mocks.getString,
    setString: mocks.setString,
    remove: mocks.remove,
  },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: mocks.getSecure,
  setItemAsync: mocks.setSecure,
  deleteItemAsync: mocks.deleteSecure,
}));

import { StorageService } from './service';
import { retryExpectedStorageCancellation } from '../contexts/storage-cancellation';

const SECURE_PAT_KEY = 'ynab_counter_pat';
const SECURE_RECOVERY_CODE_KEY = 'ynab_counter_cloud_sync_code';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.asyncValues.clear();
  mocks.secureValues.clear();
  vi.stubGlobal('__DEV__', false);
});

describe('derived reward valuation', () => {
  it('revalues persisted miles calculations before recommendations are read', async () => {
    const initial = createDefaultStorage();
    initial.settings.milesValuation = 0.01;
    initial.calculations = [{
      cardId: 'miles-card',
      ruleId: 'card-miles-card',
      period: '2026-08',
      totalSpend: 100,
      eligibleSpend: 100,
      rewardEarned: 100,
      rewardEarnedDollars: 1,
      rewardType: 'miles',
      minimumMet: true,
      maximumExceeded: false,
      shouldStopUsing: false,
      categoryBreakdowns: [{
        category: 'Dining',
        spend: 100,
        reward: 100,
        rewardDollars: 1,
        capReached: false,
      }],
      subcategoryBreakdowns: [{
        subcategoryId: 'dining',
        name: 'Dining',
        flagColor: 'red',
        totalSpend: 100,
        eligibleSpend: 100,
        rewardEarned: 100,
        rewardEarnedDollars: 1,
        minimumSpendMet: true,
        maximumSpendExceeded: false,
      }],
    }];
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));
    const service = new StorageService();

    await service.updateSettings({ milesValuation: 0.03 });

    const persisted = JSON.parse(await service.exportSettings());
    expect(persisted.calculations[0]).toMatchObject({
      rewardEarned: 100,
      rewardEarnedDollars: 3,
      categoryBreakdowns: [{ reward: 100, rewardDollars: 3 }],
      subcategoryBreakdowns: [{ rewardEarned: 100, rewardEarnedDollars: 3 }],
    });

    const recommendations = RecommendationEngine.generateCardRecommendations([{
      id: 'miles-card',
      name: 'Miles Card',
      issuer: 'Bank',
      type: 'miles',
      featured: true,
      earningRate: 1,
      ynabAccountId: 'account-1',
    }], persisted.calculations);
    expect(recommendations).toEqual([
      expect.objectContaining({
        cardId: 'miles-card',
        reason: 'Good reward rate (3.0%)',
        action: 'use',
      }),
    ]);
  });
});

describe('credential generation ownership', () => {
  it('only reads Expo-safe SecureStore keys while hydrating credentials', async () => {
    const service = new StorageService();

    await service.getPAT();

    expect(mocks.getSecure.mock.calls.map(([key]) => key)).toEqual([
      SECURE_PAT_KEY,
      'ynab_counter_pat_legacy',
      SECURE_PAT_KEY,
    ]);
  });

  it('retries expected credential cancellation while hydration still owns the generation', async () => {
    const hydrate = vi.fn()
      .mockRejectedValueOnce(new Error('Credential read was cancelled.'))
      .mockResolvedValueOnce('hydrated');

    await expect(retryExpectedStorageCancellation(hydrate, () => true))
      .resolves.toBe('hydrated');
    expect(hydrate).toHaveBeenCalledTimes(2);
  });

  it('does not retry storage cancellation after hydration loses ownership', async () => {
    let current = true;
    const hydrate = vi.fn(async () => {
      current = false;
      throw new Error('Storage operation was cancelled.');
    });

    await expect(retryExpectedStorageCancellation(hydrate, () => current))
      .resolves.toBeUndefined();
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it('preserves real hydration failures', async () => {
    const failure = new Error('SecureStore is unavailable.');
    const hydrate = vi.fn().mockRejectedValue(failure);

    await expect(retryExpectedStorageCancellation(hydrate, () => true))
      .rejects.toBe(failure);
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it('bounds repeated expected hydration cancellations', async () => {
    const cancellation = new Error('Credential read was cancelled.');
    const hydrate = vi.fn().mockRejectedValue(cancellation);

    await expect(retryExpectedStorageCancellation(hydrate, () => true))
      .rejects.toBe(cancellation);
    expect(hydrate).toHaveBeenCalledTimes(3);
  });

  it('does not let a late PAT write survive a newer erase', async () => {
    let releaseWrite: (() => void) | undefined;
    const writeStarted = new Promise<void>((resolve) => {
      mocks.setSecure.mockImplementationOnce(async (key: string, value: string) => {
        await new Promise<void>((release) => {
          releaseWrite = release;
          resolve();
        });
        mocks.secureValues.set(key, value);
      });
    });
    const service = new StorageService();
    const connectGeneration = service.captureGeneration();

    const connect = service.setPAT('late-token', connectGeneration);
    await writeStarted;

    service.invalidatePendingOperations();
    const erase = service.clearPAT(service.captureGeneration(), {
      cloudSyncLocalChangedAt: '2026-08-01T00:00:00.000Z',
    });

    releaseWrite?.();

    await expect(connect).rejects.toThrow('cancelled');
    await erase;
    expect(mocks.secureValues.has(SECURE_PAT_KEY)).toBe(false);
  });

  it('persists the dirty marker in the same reset that clears connection data', async () => {
    const initial = createDefaultStorage();
    initial.ynab.selectedBudgetId = 'budget-1';
    initial.ynab.selectedBudgetName = 'Household';
    initial.ynab.trackedAccountIds = ['account-1'];
    initial.calculations = [{
      cardId: 'card-1',
      ruleId: 'rule-1',
      period: '2026-08',
      totalSpend: 100,
      eligibleSpend: 100,
      rewardEarned: 1,
      rewardType: 'cashback',
      minimumMet: true,
      maximumExceeded: false,
      shouldStopUsing: false,
    }];
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));
    mocks.secureValues.set(SECURE_PAT_KEY, 'invalid-token');

    const service = new StorageService();
    const marker = '2026-08-01T00:00:00.000Z';
    await service.clearPAT(service.captureGeneration(), {
      cloudSyncLocalChangedAt: marker,
    });

    const persisted = JSON.parse(mocks.asyncValues.get(STORAGE_KEY)!);
    expect(persisted.settings.cloudSyncLocalChangedAt).toBe(marker);
    expect(persisted.ynab).not.toHaveProperty('selectedBudgetId');
    expect(persisted.ynab.trackedAccountIds).toEqual([]);
    expect(persisted.calculations).toEqual([]);
    expect(mocks.secureValues.has(SECURE_PAT_KEY)).toBe(false);
  });

  it('does not let a late PAT write survive clearing all data', async () => {
    let releaseWrite: (() => void) | undefined;
    const writeStarted = new Promise<void>((resolve) => {
      mocks.setSecure.mockImplementationOnce(async (key: string, value: string) => {
        await new Promise<void>((release) => {
          releaseWrite = release;
          resolve();
        });
        mocks.secureValues.set(key, value);
      });
    });
    const service = new StorageService();
    const connect = service.setPAT('late-token', service.captureGeneration());
    await writeStarted;

    const erase = service.clearAll();
    releaseWrite?.();

    await expect(connect).rejects.toThrow('cancelled');
    await erase;
    expect(mocks.secureValues.has(SECURE_PAT_KEY)).toBe(false);
  });

  it('does not let a late recovery-code write survive clearing all data', async () => {
    let releaseWrite: (() => void) | undefined;
    const writeStarted = new Promise<void>((resolve) => {
      mocks.setSecure.mockImplementationOnce(async (key: string, value: string) => {
        await new Promise<void>((release) => {
          releaseWrite = release;
          resolve();
        });
        mocks.secureValues.set(key, value);
      });
    });
    const service = new StorageService();
    const remember = service.setRecoveryCode(
      'late recovery phrase',
      service.captureGeneration(),
    );
    await writeStarted;

    const erase = service.clearAll();
    releaseWrite?.();

    await expect(remember).rejects.toThrow('cancelled');
    await erase;
    expect(mocks.secureValues.has(SECURE_RECOVERY_CODE_KEY)).toBe(false);
  });

  it('makes credential reads wait for an in-progress reset', async () => {
    mocks.secureValues.set(SECURE_PAT_KEY, 'old-token');
    let releaseDelete: (() => void) | undefined;
    const deleteStarted = new Promise<void>((resolve) => {
      mocks.deleteSecure.mockImplementationOnce(async (key: string) => {
        await new Promise<void>((release) => {
          releaseDelete = release;
          resolve();
        });
        mocks.secureValues.delete(key);
      });
    });
    const service = new StorageService();
    const clear = service.clearPAT(service.captureGeneration());
    await deleteStarted;

    let readSettled = false;
    const read = service.getPAT().finally(() => {
      readSettled = true;
    });
    await Promise.resolve();
    expect(readSettled).toBe(false);

    releaseDelete?.();
    await clear;
    await expect(read).resolves.toBeUndefined();
  });

  it('keeps an explicitly entered PAT over an embedded legacy PAT migration', async () => {
    const initial = createDefaultStorage();
    initial.ynab.pat = 'embedded-old-token';
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));

    const service = new StorageService();
    await service.setPAT('explicit-new-token', service.captureGeneration());

    expect(mocks.secureValues.get(SECURE_PAT_KEY)).toBe('explicit-new-token');
    const persisted = JSON.parse(mocks.asyncValues.get(STORAGE_KEY)!);
    expect(persisted.ynab).not.toHaveProperty('pat');
  });
});

describe('snapshot restore publication ownership', () => {
  it('cancels bulk replacements that began before a restore boundary', async () => {
    const initial = createDefaultStorage();
    initial.settings.currency = 'SGD';
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));

    const service = new StorageService();
    await service.getSettings();

    const staleReplacements = [
      service.replaceCards([]),
      service.replaceRules([]),
      service.replaceThemeGroups([]),
      service.replaceTagMappings([]),
      service.replaceHiddenCards([]),
    ];
    service.invalidatePendingOperations();

    await Promise.all(staleReplacements.map(async (replacement) => {
      await expect(replacement).rejects.toThrow('cancelled');
    }));

    const persisted = JSON.parse(mocks.asyncValues.get(STORAGE_KEY)!);
    expect(persisted.settings.currency).toBe('SGD');
  });

  it('discards bulk replacement drafts cancelled after mutation', async () => {
    const initial = createDefaultStorage();
    initial.cards = [{
      id: 'original-card',
      name: 'Original card',
      issuer: 'Original bank',
      type: 'cashback',
      featured: true,
      earningRate: 1,
      ynabAccountId: 'original-account',
    }];
    initial.rules = [{
      id: 'original-rule',
      cardId: 'original-card',
      name: 'Original rule',
      rewardType: 'cashback',
      rewardValue: 1,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      active: true,
      priority: 0,
    }];
    initial.tagMappings = [{
      id: 'original-mapping',
      cardId: 'original-card',
      ynabTag: 'original',
      rewardCategory: 'general',
    }];
    initial.themeGroups = [{
      id: 'original-group',
      name: 'Original group',
      subcategories: [],
      cards: [{ cardId: 'original-card' }],
      priority: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    }];
    initial.hiddenCards = [{
      cardId: 'original-card',
      hiddenUntil: '2099-08-01T00:00:00.000Z',
      reason: 'maximum_spend_reached',
    }];
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));

    const service = new StorageService();
    await service.getSettings();
    const staleReplacements = [
      service.replaceCards([]),
      service.replaceRules([]),
      service.replaceThemeGroups([]),
      service.replaceTagMappings([]),
      service.replaceHiddenCards([]),
    ];

    // Let every replacement build its draft and enqueue its write, then cross
    // the publication boundary before the queued writes can begin.
    await Promise.resolve();
    service.invalidatePendingOperations();

    await Promise.all(staleReplacements.map(async (replacement) => {
      await expect(replacement).rejects.toThrow('cancelled');
    }));

    expect((await service.getCards()).map((card) => card.id)).toEqual(['original-card']);
    expect((await service.getRules()).map((rule) => rule.id)).toEqual(['original-rule']);
    expect((await service.getThemeGroups()).map((group) => group.id)).toEqual(['original-group']);
    expect((await service.getTagMappings()).map((mapping) => mapping.id)).toEqual(['original-mapping']);
    expect((await service.getHiddenCards()).map((hidden) => hidden.cardId)).toEqual(['original-card']);

    const persisted = JSON.parse(mocks.asyncValues.get(STORAGE_KEY)!);
    expect(persisted.cards.map((card: { id: string }) => card.id)).toEqual(['original-card']);
    expect(persisted.rules.map((rule: { id: string }) => rule.id)).toEqual(['original-rule']);
    expect(persisted.themeGroups.map((group: { id: string }) => group.id)).toEqual(['original-group']);
    expect(persisted.tagMappings.map((mapping: { id: string }) => mapping.id)).toEqual(['original-mapping']);
    expect(persisted.hiddenCards.map((hidden: { cardId: string }) => hidden.cardId)).toEqual(['original-card']);
  });

  it('preserves a later unrelated edit when replacement persistence is already running', async () => {
    const initial = createDefaultStorage();
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));
    const service = new StorageService();
    await service.getSettings();

    let releaseWrite: (() => void) | undefined;
    const writeStarted = new Promise<void>((resolve) => {
      mocks.setString.mockImplementationOnce(async (key: string, value: string) => {
        resolve();
        await new Promise<void>((release) => {
          releaseWrite = release;
        });
        mocks.asyncValues.set(key, value);
      });
    });
    const replacement = service.replaceRules([{
      id: 'replacement-rule',
      cardId: 'card-1',
      name: 'Replacement rule',
      rewardType: 'cashback',
      rewardValue: 2,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      active: true,
      priority: 0,
    }]);
    await writeStarted;

    const unrelatedEdit = service.updateSettings({ currency: 'SGD' });
    await Promise.resolve();
    releaseWrite?.();
    await Promise.all([replacement, unrelatedEdit]);

    expect((await service.getRules()).map((rule) => rule.id)).toEqual(['replacement-rule']);
    expect((await service.getSettings()).currency).toBe('SGD');
    const persisted = JSON.parse(mocks.asyncValues.get(STORAGE_KEY)!);
    expect(persisted.rules.map((rule: { id: string }) => rule.id)).toEqual(['replacement-rule']);
    expect(persisted.settings.currency).toBe('SGD');
  });

  it('applies a later replacement over the latest completed unrelated edit', async () => {
    const initial = createDefaultStorage();
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));
    const service = new StorageService();
    await service.getSettings();

    let releaseWrite: (() => void) | undefined;
    const writeStarted = new Promise<void>((resolve) => {
      mocks.setString.mockImplementationOnce(async (key: string, value: string) => {
        resolve();
        await new Promise<void>((release) => {
          releaseWrite = release;
        });
        mocks.asyncValues.set(key, value);
      });
    });
    const unrelatedEdit = service.updateSettings({ currency: 'SGD' });
    await writeStarted;

    const replacement = service.replaceRules([{
      id: 'replacement-rule',
      cardId: 'card-1',
      name: 'Replacement rule',
      rewardType: 'cashback',
      rewardValue: 2,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      active: true,
      priority: 0,
    }]);
    await Promise.resolve();
    releaseWrite?.();
    await Promise.all([unrelatedEdit, replacement]);

    expect((await service.getRules()).map((rule) => rule.id)).toEqual(['replacement-rule']);
    expect((await service.getSettings()).currency).toBe('SGD');
    const persisted = JSON.parse(mocks.asyncValues.get(STORAGE_KEY)!);
    expect(persisted.rules.map((rule: { id: string }) => rule.id)).toEqual(['replacement-rule']);
    expect(persisted.settings.currency).toBe('SGD');
  });

  it('rejects YNAB card and calculation publishers from before the restore boundary', async () => {
    const initial = createDefaultStorage();
    const restored = createDefaultStorage();
    restored.cards = [{
      id: 'restored-card',
      name: 'Restored card',
      issuer: 'Restored bank',
      type: 'cashback',
      featured: true,
      earningRate: 2,
      ynabAccountId: 'restored-account',
    }];
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));

    const service = new StorageService();
    const stalePublisherGeneration = service.captureGeneration();
    const restoreGeneration = service.invalidatePendingOperations();
    await service.importSettings(JSON.stringify(restored), {
      expectedGeneration: restoreGeneration,
    });

    await expect(service.saveCard({
      id: 'stale-card',
      name: 'Stale card',
      issuer: 'Old bank',
      type: 'cashback',
      featured: true,
      earningRate: 1,
      ynabAccountId: 'stale-account',
    }, stalePublisherGeneration)).rejects.toThrow('cancelled');
    await expect(service.replaceCalculations([{
      cardId: 'stale-card',
      ruleId: 'card-stale-card',
      period: '2026-08',
      totalSpend: 100,
      eligibleSpend: 100,
      rewardEarned: 1,
      rewardType: 'cashback',
      minimumMet: true,
      maximumExceeded: false,
      shouldStopUsing: false,
    }], stalePublisherGeneration)).rejects.toThrow('cancelled');

    const persisted = JSON.parse(await service.exportSettings());
    expect(persisted.cards.map((card: { id: string }) => card.id)).toEqual(['restored-card']);
    expect(persisted.calculations).toEqual([]);
  });
});

describe('settings import dirty-marker preconditions', () => {
  it('accepts options containing only the restore generation', async () => {
    const initial = createDefaultStorage();
    const imported = createDefaultStorage();
    imported.settings.currency = 'SGD';
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));

    const service = new StorageService();
    await service.importSettings(JSON.stringify(imported), {
      expectedGeneration: service.captureGeneration(),
    });

    const persisted = JSON.parse(await service.exportSettings());
    expect(persisted.settings.currency).toBe('SGD');
  });

  it('allows a generation-owned manual restore while preserving its dirty marker', async () => {
    const initial = createDefaultStorage();
    initial.settings.cloudSyncLocalChangedAt = '2026-08-01T01:00:00.000Z';
    const imported = createDefaultStorage();
    imported.cards = [{
      id: 'manual-restore-card',
      name: 'Manual restore card',
      issuer: 'Imported bank',
      type: 'cashback',
      featured: true,
      earningRate: 2,
      ynabAccountId: 'manual-account',
    }];
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));

    const service = new StorageService();
    const restoreGeneration = service.invalidatePendingOperations();
    await service.importSettings(JSON.stringify(imported), {
      expectedGeneration: restoreGeneration,
    });

    const persisted = JSON.parse(await service.exportSettings());
    expect(persisted.cards.map((card: { id: string }) => card.id)).toEqual([
      'manual-restore-card',
    ]);
    expect(persisted.settings.cloudSyncLocalChangedAt).toBe(
      '2026-08-01T01:00:00.000Z',
    );
  });

  it('enforces an explicitly supplied dirty-marker precondition', async () => {
    const initial = createDefaultStorage();
    initial.settings.cloudSyncLocalChangedAt = '2026-08-01T02:00:00.000Z';
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));

    const service = new StorageService();
    await expect(service.importSettings(JSON.stringify(createDefaultStorage()), {
      expectedGeneration: service.captureGeneration(),
      expectedCloudSyncLocalChangedAt: null,
    })).rejects.toThrow('Local settings changed during Cloud Sync');

    await expect(service.importSettings(JSON.stringify(createDefaultStorage()), {
      expectedGeneration: service.captureGeneration(),
      expectedCloudSyncLocalChangedAt: '2026-08-01T02:00:00.000Z',
    })).resolves.toBeUndefined();
  });

  it('reports parse and top-level shape failures as invalid settings files', async () => {
    const service = new StorageService();

    await expect(service.importSettings('{not json')).rejects.toThrow(
      'Invalid settings file',
    );
    await expect(service.importSettings('[]')).rejects.toThrow(
      'Invalid settings file',
    );
  });

  it('preserves a storage cancellation instead of reporting an invalid file', async () => {
    const service = new StorageService();
    const staleGeneration = service.captureGeneration();
    service.invalidatePendingOperations();

    await expect(service.importSettings(JSON.stringify(createDefaultStorage()), {
      expectedGeneration: staleGeneration,
    })).rejects.toThrow('Storage operation was cancelled');
  });

  it('keeps cached and persisted settings unchanged when import persistence fails', async () => {
    const initial = createDefaultStorage();
    initial.settings.currency = 'SGD';
    const imported = createDefaultStorage();
    imported.settings.currency = 'USD';
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));

    const service = new StorageService();
    await service.getSettings();
    mocks.setString.mockRejectedValueOnce(new Error('disk write failed'));

    await expect(service.importSettings(JSON.stringify(imported))).rejects.toThrow(
      'Invalid settings file',
    );

    const cached = JSON.parse(await service.exportSettings());
    const persisted = JSON.parse(mocks.asyncValues.get(STORAGE_KEY)!);
    expect(cached.settings.currency).toBe('SGD');
    expect(persisted.settings.currency).toBe('SGD');
  });

  it('does not expose internal storage failures through the import error', async () => {
    mocks.getString.mockRejectedValueOnce(new Error('database unavailable'));
    const service = new StorageService();

    await expect(service.importSettings(JSON.stringify(createDefaultStorage())))
      .rejects.toThrow('Invalid settings file');
  });

  it('imports over the latest completed local replacement without losing it', async () => {
    const initial = createDefaultStorage();
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));
    const replacementCard = {
      id: 'replacement-card',
      name: 'Replacement card',
      issuer: 'Replacement bank',
      type: 'cashback' as const,
      featured: true,
      earningRate: 2,
      ynabAccountId: 'replacement-account',
    };
    const service = new StorageService();
    await service.getSettings();

    let releaseWrite: (() => void) | undefined;
    const writeStarted = new Promise<void>((resolve) => {
      mocks.setString.mockImplementationOnce(async (key: string, value: string) => {
        await new Promise<void>((release) => {
          releaseWrite = release;
          resolve();
        });
        mocks.asyncValues.set(key, value);
      });
    });

    const replace = service.replaceCards([replacementCard]);
    await writeStarted;
    const importing = service.importSettings(JSON.stringify({
      settings: { currency: 'USD' },
    }));
    releaseWrite?.();
    await Promise.all([replace, importing]);

    const cached = JSON.parse(await service.exportSettings());
    const persisted = JSON.parse(mocks.asyncValues.get(STORAGE_KEY)!);
    expect(cached.cards.map((card: { id: string }) => card.id)).toEqual(['replacement-card']);
    expect(cached.settings.currency).toBe('USD');
    expect(persisted.cards.map((card: { id: string }) => card.id)).toEqual(['replacement-card']);
    expect(persisted.settings.currency).toBe('USD');
  });

  it('lets a later local replacement build on a completed import', async () => {
    const initial = createDefaultStorage();
    initial.settings.currency = 'SGD';
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));
    const replacementCard = {
      id: 'local-card',
      name: 'Local card',
      issuer: 'Local bank',
      type: 'cashback' as const,
      featured: true,
      earningRate: 3,
      ynabAccountId: 'local-account',
    };
    const service = new StorageService();
    await service.getSettings();

    let releaseWrite: (() => void) | undefined;
    const writeStarted = new Promise<void>((resolve) => {
      mocks.setString.mockImplementationOnce(async (key: string, value: string) => {
        await new Promise<void>((release) => {
          releaseWrite = release;
          resolve();
        });
        mocks.asyncValues.set(key, value);
      });
    });

    const importing = service.importSettings(JSON.stringify({
      settings: { currency: 'USD' },
    }));
    await writeStarted;
    const replace = service.replaceCards([replacementCard]);
    releaseWrite?.();
    await Promise.all([importing, replace]);

    const cached = JSON.parse(await service.exportSettings());
    const persisted = JSON.parse(mocks.asyncValues.get(STORAGE_KEY)!);
    expect(cached.settings.currency).toBe('USD');
    expect(cached.cards.map((card: { id: string }) => card.id)).toEqual(['local-card']);
    expect(persisted.settings.currency).toBe('USD');
    expect(persisted.cards.map((card: { id: string }) => card.id)).toEqual(['local-card']);
  });

  it('does not recheck import lineage after a sync snapshot completes during native persistence', async () => {
    const snapshotMarker = '2026-08-01T05:00:00.000Z';
    const syncedAt = '2026-08-01T05:01:00.000Z';
    const initial = createDefaultStorage();
    initial.settings.currency = 'SGD';
    initial.settings.cloudSyncLocalChangedAt = snapshotMarker;
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));
    const service = new StorageService();
    await service.getSettings();

    let releaseWrite: (() => void) | undefined;
    const writeStarted = new Promise<void>((resolve) => {
      mocks.setString.mockImplementationOnce(async (key: string, value: string) => {
        await new Promise<void>((release) => {
          releaseWrite = release;
          resolve();
        });
        mocks.asyncValues.set(key, value);
      });
    });

    const importing = service.importSettings(JSON.stringify({
      settings: { currency: 'USD' },
    }), {
      expectedCloudSyncLocalChangedAt: snapshotMarker,
      expectedGeneration: service.captureGeneration(),
    });
    await writeStarted;
    const completingSnapshot = service.completeCloudSyncSnapshot(snapshotMarker, {
      cloudSyncKeyId: 'cloud-key',
      cloudSyncLastSyncedAt: syncedAt,
    });
    releaseWrite?.();

    await expect(importing).resolves.toBeUndefined();
    await expect(completingSnapshot).resolves.toMatchObject({
      currency: 'USD',
      cloudSyncKeyId: 'cloud-key',
      cloudSyncLastSyncedAt: syncedAt,
    });

    const cached = JSON.parse(await service.exportSettings());
    const persisted = JSON.parse(mocks.asyncValues.get(STORAGE_KEY)!);
    for (const snapshot of [cached, persisted]) {
      expect(snapshot.settings.currency).toBe('USD');
      expect(snapshot.settings.cloudSyncKeyId).toBe('cloud-key');
      expect(snapshot.settings.cloudSyncLastSyncedAt).toBe(syncedAt);
      expect(snapshot.settings).not.toHaveProperty('cloudSyncLocalChangedAt');
    }
  });
});

describe('replaceCards cascade', () => {
  it('returns pruned hiddenCards so React state can stay in sync', async () => {
    const initial = createDefaultStorage();
    initial.cards = [{
      id: 'keep-card',
      name: 'Keep',
      issuer: 'Test',
      type: 'cashback',
      featured: true,
      earningRate: 1,
      ynabAccountId: 'account-keep',
    }, {
      id: 'drop-card',
      name: 'Drop',
      issuer: 'Test',
      type: 'cashback',
      featured: true,
      earningRate: 1,
      ynabAccountId: 'account-drop',
    }];
    initial.hiddenCards = [{
      cardId: 'keep-card',
      hiddenUntil: '2099-08-01T00:00:00.000Z',
      reason: 'maximum_spend_reached',
    }, {
      cardId: 'drop-card',
      hiddenUntil: '2099-08-01T00:00:00.000Z',
      reason: 'maximum_spend_reached',
    }];
    mocks.asyncValues.set(STORAGE_VERSION_KEY, STORAGE_VERSION);
    mocks.asyncValues.set(STORAGE_KEY, JSON.stringify(initial));

    const service = new StorageService();
    await service.getSettings();
    const replacement = await service.replaceCards([initial.cards[0]!]);

    expect(replacement.hiddenCards?.map((entry) => entry.cardId)).toEqual(['keep-card']);
    expect((await service.getHiddenCards()).map((entry) => entry.cardId)).toEqual(['keep-card']);
  });
});
