import { beforeEach, describe, expect, it, vi } from "vitest";

import { StorageService } from "./service";

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
