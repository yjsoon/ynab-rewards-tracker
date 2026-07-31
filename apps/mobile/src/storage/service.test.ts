import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultStorage,
  STORAGE_KEY,
  STORAGE_VERSION,
  STORAGE_VERSION_KEY,
} from '@ynab-counter/app-core/storage';

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

const SECURE_PAT_KEY = 'ynab_counter_pat';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.asyncValues.clear();
  mocks.secureValues.clear();
  vi.stubGlobal('__DEV__', false);
});

describe('PAT generation ownership', () => {
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
