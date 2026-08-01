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

  it("preserves the local PAT, budget, and tracked accounts when a cloud payload has no YNAB selection", () => {
    const service = new StorageService();

    service.setPAT("local-pat");
    service.setSelectedBudget("budget-local", "Local Budget");
    service.setTrackedAccountIds(["account-local"]);

    service.importSettings(JSON.stringify({ ...importedBase, ynab: {} }));

    expect(service.getPAT()).toBe("local-pat");
    expect(service.getSelectedBudget()).toEqual({
      id: "budget-local",
      name: "Local Budget",
    });
    expect(service.getTrackedAccountIds()).toEqual(["account-local"]);
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
  });

  it("ignores array-shaped imported YNAB settings", () => {
    const service = new StorageService();

    service.setPAT("local-pat");
    service.setSelectedBudget("budget-local", "Local Budget");
    service.setTrackedAccountIds(["account-local"]);

    service.importSettings(JSON.stringify({ ...importedBase, ynab: [] }));

    expect(service.getPAT()).toBe("local-pat");
    expect(service.getSelectedBudget()).toEqual({
      id: "budget-local",
      name: "Local Budget",
    });
    expect(service.getTrackedAccountIds()).toEqual(["account-local"]);
  });

  it("treats empty imported budget fields as absent and reconstructs tracked accounts from imported cards", () => {
    const service = new StorageService();

    service.setPAT("local-pat");
    service.setSelectedBudget("budget-local", "Local Budget");

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
      id: "budget-local",
      name: "Local Budget",
    });
    expect(service.getTrackedAccountIds()).toEqual(["account-card"]);
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
