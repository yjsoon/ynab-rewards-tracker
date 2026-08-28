import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "@ynab-counter/app-core/storage";

import {
  CLOUD_SYNC_CONFLICT_EVENT,
  CLOUD_SYNC_CONFLICT_STORAGE_KEY,
} from "../cloud-sync/conflict-state";
import { StorageService } from "./service";
import type { CreditCard } from "./types";

type LocalStorageMock = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function createLocalStorageMock(): LocalStorageMock {
  const store = new Map<string, string>();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) ?? null : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function readStoredYnab(): Record<string, unknown> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    throw new Error("Expected storage to be populated");
  }

  return JSON.parse(stored).ynab;
}

describe("StorageService clearAll", () => {
  it("clears the persistent Cloud Sync conflict marker and updates its banner", () => {
    const localStorageMock = createLocalStorageMock();
    const dispatchEvent = vi.fn();

    Object.defineProperty(globalThis, "window", {
      value: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent,
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      configurable: true,
      writable: true,
    });

    localStorage.setItem(STORAGE_KEY, "stored data");
    localStorage.setItem(CLOUD_SYNC_CONFLICT_STORAGE_KEY, "1");

    new StorageService().clearAll();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CLOUD_SYNC_CONFLICT_STORAGE_KEY)).toBeNull();
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: CLOUD_SYNC_CONFLICT_EVENT }),
    );
  });
});

describe("StorageService provider migration", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: createLocalStorageMock(),
      configurable: true,
      writable: true,
    });
  });

  it("switches credentials while preserving the selected budget and tracked accounts", () => {
    const service = new StorageService();
    service.setPAT("ynab-pat");
    service.setSelectedBudget("budget-1", "My budget");
    service.setTrackedAccountIds(["account-1", "account-2"]);
    service.setCachedData({ transactions: [{ id: "transaction-1" }] });

    service.migrateToHowMuch("howmuch-api-key", {
      selectedBudgetId: "budget-1",
      trackedAccountIds: ["account-1", "account-2"],
      linkedCardAccountIds: [],
    });

    expect(service.getBudgetProvider()).toBe("howmuch");
    expect(service.getPAT()).toBe("howmuch-token:howmuch-api-key");
    expect(service.getSelectedBudget()).toEqual({ id: "budget-1", name: "My budget" });
    expect(service.getTrackedAccountIds()).toEqual(["account-1", "account-2"]);
    expect(service.getCachedData()).toBeUndefined();
    expect(readStoredYnab()).toMatchObject({ pat: "ynab-pat" });
  });

  it("leaves YNAB active when the cutover cannot be persisted", () => {
    const service = new StorageService();
    service.setPAT("ynab-pat");
    service.setSelectedBudget("budget-1", "My budget");
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(() => service.migrateToHowMuch("howmuch-api-key", {
      selectedBudgetId: "budget-1",
      trackedAccountIds: [],
      linkedCardAccountIds: [],
    })).toThrow("Quota exceeded");
    setItem.mockRestore();

    expect(service.getBudgetProvider()).toBe("ynab");
    expect(service.getPAT()).toBe("ynab-pat");
    expect(service.getSelectedBudget()).toEqual({ id: "budget-1", name: "My budget" });
  });

  it("rejects the cutover if connection mappings changed after verification", () => {
    const service = new StorageService();
    service.setPAT("ynab-pat");
    service.setSelectedBudget("budget-1", "My budget");
    service.setTrackedAccountIds(["account-1"]);
    const verified = {
      selectedBudgetId: "budget-1",
      trackedAccountIds: ["account-1"],
      linkedCardAccountIds: [] as string[],
    };
    service.setTrackedAccountIds(["account-1", "account-2"]);

    expect(() => service.migrateToHowMuch("howmuch-api-key", verified)).toThrow(
      "Rewards settings changed during verification",
    );
    expect(service.getBudgetProvider()).toBe("ynab");
    expect(service.getPAT()).toBe("ynab-pat");
  });
});

describe("StorageService budget accounts cache", () => {
  beforeEach(() => {
    const localStorageMock = createLocalStorageMock();

    Object.defineProperty(globalThis, "window", {
      value: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      configurable: true,
      writable: true,
    });
  });

  it("scopes cached accounts by the provided credential key", () => {
    const service = new StorageService();
    const accounts = [{ id: "account-1", name: "Main Card" }];

    service.setBudgetAccountsCache("budget-1", accounts, undefined, "pat-a");

    expect(
      service.getBudgetAccountsCache("budget-1", 5 * 60 * 1000, "pat-a"),
    ).toEqual(accounts);
    expect(
      service.getBudgetAccountsCache("budget-1", 5 * 60 * 1000, "pat-b"),
    ).toBeNull();
  });

  it("does not reuse legacy unscoped cache entries for scoped lookups", () => {
    const service = new StorageService();
    const accounts = [{ id: "account-1", name: "Main Card" }];

    service.setBudgetAccountsCache("budget-1", accounts);

    expect(
      service.getBudgetAccountsCache("budget-1", 5 * 60 * 1000, "pat-a"),
    ).toBeNull();
    expect(service.getBudgetAccountsCache("budget-1")).toEqual(accounts);
  });

  it("throws and avoids reporting success when localStorage writes fail", () => {
    const localStorageMock = createLocalStorageMock();
    vi.spyOn(localStorageMock, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      configurable: true,
      writable: true,
    });

    const service = new StorageService();

    expect(() => service.updateSettings({ currency: "SGD" })).toThrow(
      "Quota exceeded",
    );
  });
});

describe("StorageService dashboard transactions cache", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: createLocalStorageMock(),
      configurable: true,
      writable: true,
    });
  });

  it("updates every cached snapshot for a transaction flag mutation", () => {
    const service = new StorageService();
    service.setCachedData({ flagNames: { blue: "Travel" } });
    for (const sinceDate of ["2026-07-01", "2026-08-01"]) {
      service.setDashboardTransactionsCache({
        budgetId: "budget-1",
        sinceDate,
        fetchedAt: "2026-08-09T00:00:00.000Z",
        trackedAccountIds: [],
        accounts: [{ id: "account-1", name: "Rewards Card" }],
        transactions: [{
          id: "transaction-1",
          account_id: "account-1",
          amount: -1000,
          date: "2026-08-05",
          flag_color: "red",
          flag_name: "Dining",
        }],
      });
    }

    service.updateDashboardTransactionFlag(
      "budget-1",
      "transaction-1",
      "blue",
    );

    expect(service.getCachedData()?.dashboardTransactions).toHaveLength(2);
    expect(service.getCachedData()?.dashboardTransactions?.every(
      (entry) => entry.transactions[0]?.flag_color === "blue"
        && entry.transactions[0]?.flag_name === "Travel",
    )).toBe(true);
  });
});

describe("StorageService exportSettings", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: createLocalStorageMock(),
      configurable: true,
      writable: true,
    });
  });

  it("omits pat, cachedData, and non-empty calculations while including cards", () => {
    const service = new StorageService();
    service.setPAT("secret-pat");
    service.saveCard({
      id: "card-account-1",
      name: "Rewards Card",
      issuer: "Bank",
      type: "cashback",
      ynabAccountId: "account-1",
      featured: true,
      earningRate: 1,
    });
    service.setCachedData({ lastUpdated: "2026-08-01T00:00:00.000Z" });
    service.saveCalculation({
      cardId: "card-account-1",
      ruleId: "rule-1",
      period: "2026-07",
      totalSpend: 10,
      eligibleSpend: 10,
      rewardEarned: 1,
      rewardType: "cashback",
      minimumMet: true,
      maximumExceeded: false,
      shouldStopUsing: false,
    });

    service.updateSettings({
      cloudSyncKeyId: "key-1",
      cloudSyncLastSyncedAt: "2026-08-01T00:00:00.000Z",
    });

    const exported = JSON.parse(service.exportSettings());

    expect(exported.ynab?.pat).toBeUndefined();
    expect("cachedData" in exported).toBe(false);
    expect(exported.calculations).toEqual([]);
    expect(exported.settings.cloudSyncKeyId).toBeUndefined();
    expect(exported.settings.cloudSyncLastSyncedAt).toBeUndefined();
    expect(exported.settings.cloudSyncLocalChangedAt).toBeUndefined();
    expect(service.getSettings().cloudSyncLocalChangedAt).toEqual(expect.any(String));
    expect(exported.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "card-account-1" }),
    ]));
  });
});

describe("StorageService importSettings", () => {
  beforeEach(() => {
    const localStorageMock = createLocalStorageMock();

    Object.defineProperty(globalThis, "window", {
      value: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      configurable: true,
      writable: true,
    });
  });

  const importedBase = {
    cards: [],
    rules: [],
    tagMappings: [],
    calculations: [],
    themeGroups: [],
    settings: {
      theme: "dark",
    },
  };

  function buildCard(accountId: string): CreditCard {
    return {
      id: `card-${accountId}`,
      name: "Rewards Card",
      issuer: "Bank",
      type: "cashback",
      ynabAccountId: accountId,
      featured: true,
      earningRate: 1,
    };
  }

  it("keeps the local PAT when a portable snapshot has no YNAB selection", () => {
    const service = new StorageService();

    service.setPAT("local-pat");
    service.setSelectedBudget("budget-local", "Local Budget");
    service.setTrackedAccountIds(["account-local"]);

    service.importSettings(JSON.stringify({ ...importedBase, ynab: {} }));

    expect(service.getPAT()).toBe("local-pat");
    expect(service.getSelectedBudget()).toEqual({
      id: undefined,
      name: undefined,
    });
    expect(service.getTrackedAccountIds()).toEqual([]);
  });

  it("clears the device-local dashboard cache when the import omits it", () => {
    const service = new StorageService();
    service.setCachedData({
      lastUpdated: "2026-08-01T00:00:00.000Z",
      dashboardTransactions: [{
        budgetId: "budget-local",
        sinceDate: "2026-07-01",
        fetchedAt: "2026-08-01T00:00:00.000Z",
        trackedAccountIds: ["account-local"],
        accounts: [],
        transactions: [],
        isComplete: false,
      }],
    });

    service.importSettings(JSON.stringify({ ...importedBase, ynab: {} }));

    expect(service.getCachedData()).toBeUndefined();
    expect(service.getCalculations()).toEqual([]);
  });

  it("preserves local YNAB metadata when importing partial connection settings", () => {
    const service = new StorageService();

    service.setPAT("local-pat");
    service.setSelectedBudget("budget-local", "Local Budget");

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      throw new Error("Expected storage to be populated");
    }

    const storage = JSON.parse(stored);
    storage.ynab.lastSync = "2026-05-22T01:02:03.000Z";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));

    new StorageService().importSettings(JSON.stringify({ ...importedBase, ynab: {} }));

    expect(readStoredYnab().lastSync).toBe("2026-05-22T01:02:03.000Z");
    expect(readStoredYnab().selectedBudgetId).toBeUndefined();
  });

  it("ignores array-shaped imported YNAB settings and still keeps the local PAT", () => {
    const service = new StorageService();

    service.setPAT("local-pat");
    service.setSelectedBudget("budget-local", "Local Budget");
    service.setTrackedAccountIds(["account-local"]);

    service.importSettings(JSON.stringify({ ...importedBase, ynab: [] }));

    expect(service.getPAT()).toBe("local-pat");
    expect(service.getSelectedBudget()).toEqual({
      id: undefined,
      name: undefined,
    });
    expect(service.getTrackedAccountIds()).toEqual([]);
  });

  it("treats an empty portable YNAB selection as a deletion instead of reconstructing from cards", () => {
    const service = new StorageService();

    service.setPAT("local-pat");
    service.setSelectedBudget("budget-local", "Local Budget");
    service.setTrackedAccountIds(["account-local"]);

    service.importSettings(
      JSON.stringify({
        ...importedBase,
        ynab: {
          selectedBudgetId: "",
          selectedBudgetName: "",
          trackedAccountIds: [],
        },
        cards: [buildCard("account-card")],
      }),
    );

    expect(service.getPAT()).toBe("local-pat");
    expect(service.getSelectedBudget()).toEqual({
      id: undefined,
      name: undefined,
    });
    expect(service.getTrackedAccountIds()).toEqual([]);
    expect(service.getCards().map((card) => card.id)).toEqual(["card-account-card"]);
  });

  it("uses valid YNAB connection fields from the imported payload", () => {
    const service = new StorageService();

    service.setPAT("local-pat");
    service.setSelectedBudget("budget-local", "Local Budget");
    service.setTrackedAccountIds(["account-local"]);

    service.importSettings(
      JSON.stringify({
        ...importedBase,
        ynab: {
          selectedBudgetId: "budget-cloud",
          selectedBudgetName: "Cloud Budget",
          trackedAccountIds: ["account-cloud"],
        },
      }),
    );

    expect(service.getPAT()).toBe("local-pat");
    expect(service.getSelectedBudget()).toEqual({
      id: "budget-cloud",
      name: "Cloud Budget",
    });
    expect(service.getTrackedAccountIds()).toEqual(["account-cloud"]);
  });

  it("trims imported YNAB budget and tracked account fields", () => {
    const service = new StorageService();

    service.setPAT("local-pat");

    service.importSettings(
      JSON.stringify({
        ...importedBase,
        ynab: {
          selectedBudgetId: " budget-cloud ",
          selectedBudgetName: " Cloud Budget ",
          trackedAccountIds: [" account-b ", "account-a", "account-a ", "  ", 123],
        },
      }),
    );

    expect(service.getSelectedBudget()).toEqual({
      id: "budget-cloud",
      name: "Cloud Budget",
    });
    expect(service.getTrackedAccountIds()).toEqual(["account-a", "account-b"]);
  });

  it("does not persist secrets or caches from an old fat dump and keeps the local PAT", () => {
    const service = new StorageService();
    service.setPAT("local-pat");
    service.saveCalculation({
      cardId: "card-local",
      ruleId: "rule-local",
      period: "2026-07",
      totalSpend: 20,
      eligibleSpend: 20,
      rewardEarned: 2,
      rewardType: "cashback",
      minimumMet: true,
      maximumExceeded: false,
      shouldStopUsing: false,
    });
    service.setCachedData({ lastUpdated: "2026-08-01T00:00:00.000Z" });

    service.importSettings(JSON.stringify({
      ...importedBase,
      ynab: { pat: "file-pat" },
      calculations: [{
        cardId: "card-file",
        ruleId: "rule-file",
        period: "2026-07",
        totalSpend: 10,
        eligibleSpend: 10,
        rewardEarned: 1,
        rewardType: "cashback",
        minimumMet: true,
        maximumExceeded: false,
        shouldStopUsing: false,
      }],
      cachedData: {
        lastUpdated: "2026-07-31T00:00:00.000Z",
        transactions: [{ id: "txn-1" }],
      },
      settings: {
        theme: "dark",
        cloudSyncMnemonic: "file phrase",
      },
    }));

    expect(service.getPAT()).toBe("local-pat");
    expect(service.getCachedData()).toBeUndefined();
    expect(service.getCalculations()).toEqual([]);
  });

  it("keeps the local HowMuch token and provider across a portable import", () => {
    const service = new StorageService();
    service.setSelectedBudget("budget-1", "My budget");
    service.setTrackedAccountIds(["account-1"]);
    service.migrateToHowMuch("howmuch-api-key", {
      selectedBudgetId: "budget-1",
      trackedAccountIds: ["account-1"],
      linkedCardAccountIds: [],
    });

    service.importSettings(JSON.stringify({
      ...importedBase,
      ynab: {
        selectedBudgetId: "budget-imported",
        selectedBudgetName: "Imported budget",
        trackedAccountIds: ["account-imported"],
        howmuchToken: "file-howmuch",
      },
    }));

    expect(service.getBudgetProvider()).toBe("howmuch");
    expect(service.getPAT()).toBe("howmuch-token:howmuch-api-key");
    expect(service.getSelectedBudget()).toEqual({
      id: "budget-imported",
      name: "Imported budget",
    });
    expect(readStoredYnab().howmuchToken).toBe("howmuch-api-key");
  });

  it("keeps Cloud Sync lineage and marks the imported payload dirty", () => {
    const service = new StorageService();
    service.updateSettings({
      cloudSyncKeyId: "key-1",
      cloudSyncLastSyncedAt: "2026-08-01T00:00:00.000Z",
      cloudSyncMnemonic: "one two three",
      rememberCloudSyncCode: true,
      autoSyncEnabled: true,
    });
    service.saveCard(buildCard("account-local"));

    service.importSettings(JSON.stringify({
      ...importedBase,
      ynab: {},
      cards: [buildCard("account-imported")],
      settings: { currency: "GBP" },
    }));

    expect(service.getSettings()).toMatchObject({
      currency: "GBP",
      cloudSyncKeyId: "key-1",
      cloudSyncLastSyncedAt: "2026-08-01T00:00:00.000Z",
      cloudSyncMnemonic: "one two three",
      rememberCloudSyncCode: true,
      autoSyncEnabled: true,
    });
    expect(service.getSettings().cloudSyncLocalChangedAt).toEqual(expect.any(String));
    expect(service.getCards().map((card) => card.id)).toEqual(["card-account-imported"]);
  });

  it("replaces a missing portable field with parse defaults instead of keeping the local value", () => {
    const service = new StorageService();
    service.hideCard("card-stale", "2027-12-31T00:00:00.000Z");
    expect(service.getHiddenCards()).toEqual([
      expect.objectContaining({ cardId: "card-stale" }),
    ]);

    service.importSettings(JSON.stringify({ ...importedBase, ynab: {} }));

    expect(service.getHiddenCards()).toEqual([]);
  });

  it("removes stored budget fields when setSelectedBudget is called with an empty value", () => {
    const service = new StorageService();

    service.setSelectedBudget("budget-local", "Local Budget");
    service.setSelectedBudget("", "");

    expect(service.getSelectedBudget()).toEqual({
      id: undefined,
      name: undefined,
    });
  });
});

describe("StorageService Cloud Sync dirtiness", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: createLocalStorageMock(),
      configurable: true,
      writable: true,
    });
  });

  it("marks payload changes but not device-only Cloud Sync metadata", () => {
    const service = new StorageService();

    service.updateSettings({ cloudSyncKeyId: "key-1", cloudSyncLastSyncedAt: "revision-1" });
    expect(service.getSettings().cloudSyncLocalChangedAt).toBeUndefined();

    service.updateSettings({ currency: "SGD" });
    expect(service.getSettings().cloudSyncLocalChangedAt).toEqual(expect.any(String));
  });

  it("clears only the marker belonging to the completed snapshot", () => {
    const service = new StorageService();
    service.updateSettings({ currency: "SGD" });
    const snapshotMarker = service.getSettings().cloudSyncLocalChangedAt;

    service.updateSettings({ theme: "dark" });
    const laterMarker = service.getSettings().cloudSyncLocalChangedAt;
    expect(laterMarker).not.toBe(snapshotMarker);

    service.completeCloudSyncSnapshot(snapshotMarker, {
      cloudSyncKeyId: "key-1",
      cloudSyncLastSyncedAt: "revision-1",
    });

    expect(service.getSettings()).toMatchObject({
      cloudSyncKeyId: "key-1",
      cloudSyncLastSyncedAt: "revision-1",
      cloudSyncLocalChangedAt: laterMarker,
    });
  });
});
