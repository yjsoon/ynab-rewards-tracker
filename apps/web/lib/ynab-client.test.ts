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

  it("keeps provider credentials separate when switching in both directions", () => {
    storage.setPAT("ynab-pat");
    storage.setBudgetProvider("howmuch");
    expect(storage.getPAT()).toBeUndefined();

    storage.setPAT("howmuch-api-key");
    expect(storage.getPAT()).toBe("howmuch-token:howmuch-api-key");

    storage.setBudgetProvider("ynab");
    expect(storage.getPAT()).toBe("ynab-pat");

    storage.setBudgetProvider("howmuch");
    expect(storage.getPAT()).toBe("howmuch-token:howmuch-api-key");
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
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ynab/plans/budget-1/transactions?since_date=2026-04-01",
      expect.any(Object),
    );
  });

  it("forwards the HowMuch account token and follows transaction pages", async () => {
    storage.setBudgetProvider("howmuch");
    storage.setPAT("howmuch-api-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { transactions: [{ id: "one" }], has_more: true, next_offset: 250 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { transactions: [{ id: "two" }], has_more: false, next_offset: null } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new YnabClient(storage.getPAT()!);
    const transactions = await client.getTransactions("plan-1");

    expect(transactions.map((transaction) => transaction.id)).toEqual(["one", "two"]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/ynab/plans/plan-1/transactions?limit=250&offset=0",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer howmuch-token:howmuch-api-key",
        }),
      }),
    );
  });

  it("rejects a non-progressing HowMuch transaction cursor", async () => {
    storage.setBudgetProvider("howmuch");
    storage.setPAT("howmuch-api-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { transactions: [], has_more: true, next_offset: 0 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new YnabClient(storage.getPAT()!);

    await expect(client.getTransactions("plan-1")).rejects.toThrow(
      "Invalid HowMuch transaction pagination cursor",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("routes flag updates through the provider-bound client", async () => {
    storage.setBudgetProvider("howmuch");
    storage.setPAT("howmuch-api-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { transaction: { id: "txn-1", flag_color: "green" } } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new YnabClient(storage.getPAT()!);
    await client.updateTransactionFlag("plan-1", "txn-1", "green");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ynab/plans/plan-1/transactions/txn-1",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: "Bearer howmuch-token:howmuch-api-key",
        }),
      }),
    );
  });

  it("surfaces HowMuch error.detail when a transaction update fails", async () => {
    storage.setBudgetProvider("howmuch");
    storage.setPAT("howmuch-api-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          id: "400",
          name: "bad_request",
          detail: "Category not found",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new YnabClient(storage.getPAT()!);

    await expect(client.updateTransactionFlag("plan-1", "txn-1", "green")).rejects.toThrow(
      "Category not found",
    );
  });

  it("includes the HTTP status when the provider returns a non-JSON error body", async () => {
    storage.setBudgetProvider("howmuch");
    storage.setPAT("howmuch-api-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("Unexpected token < in JSON");
      },
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new YnabClient(storage.getPAT()!);

    await expect(client.updateTransactionFlag("plan-1", "txn-1", "green")).rejects.toThrow(
      "HTTP 502",
    );
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
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ynab/plans/budget-2/accounts",
      expect.any(Object),
    );
  });

  it("preserves JSON error messages from the YNAB proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "invalid token" }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new YnabClient("pat-error");

    await expect(client.getBudgets()).rejects.toThrow("invalid token");
  });

  it("throws when the plans response shape is unexpected", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { default_plan: null } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new YnabClient("pat-plans");

    await expect(client.getBudgets()).rejects.toThrow(
      "Unexpected YNAB plans response: missing plans array",
    );
  });

  it("throws when the plan response shape is unexpected", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { server_knowledge: 1 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new YnabClient("pat-plan");

    await expect(client.getBudget("budget-1")).rejects.toThrow(
      "Unexpected YNAB plan response: missing plan object",
    );
  });
});
