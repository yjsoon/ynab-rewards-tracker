import { beforeEach, describe, expect, it, vi } from "vitest";

import { storage } from "./storage";
import { YnabClient } from "./ynab-client";

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

describe("YnabClient cache bypass", () => {
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

    storage.clearAll();
    vi.restoreAllMocks();
  });

  it("forces a fresh transactions request when bypassCache is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { transactions: [] } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new YnabClient("pat-transactions");

    await client.getTransactions("budget-1", { since_date: "2026-04-01" });
    await client.getTransactions("budget-1", { since_date: "2026-04-01" });
    await client.getTransactions("budget-1", {
      since_date: "2026-04-01",
      bypassCache: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips the persisted account cache when bypassCache is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { accounts: [{ id: "account-1", name: "Main Card" }] },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new YnabClient("pat-accounts");

    await client.getAccounts("budget-2");
    await client.getAccounts("budget-2");
    await client.getAccounts("budget-2", { bypassCache: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
