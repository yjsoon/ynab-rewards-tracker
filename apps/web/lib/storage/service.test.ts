import { beforeEach, describe, expect, it, vi } from "vitest";

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
