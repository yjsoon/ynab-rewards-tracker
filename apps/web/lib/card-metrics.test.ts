import { describe, expect, it } from "vitest";

import { filterTransactionsForCardPeriod } from "./card-metrics";

describe("filterTransactionsForCardPeriod", () => {
  it("keeps only transactions for the selected card account within the period", () => {
    const card = { ynabAccountId: "account-1" };
    const transactions = [
      {
        id: "tx-1",
        account_id: "account-1",
        amount: -1000,
        date: "2026-04-01",
      },
      {
        id: "tx-2",
        account_id: "account-1",
        amount: -2000,
        date: "2026-03-31",
      },
      {
        id: "tx-3",
        account_id: "account-2",
        amount: -3000,
        date: "2026-04-02",
      },
      {
        id: "tx-4",
        account_id: "account-1",
        amount: -4000,
        date: "2026-04-15",
      },
    ];

    expect(
      filterTransactionsForCardPeriod(card, transactions, {
        start: "2026-04-01",
        end: "2026-04-10",
      }),
    ).toEqual([transactions[0]]);
  });
});
