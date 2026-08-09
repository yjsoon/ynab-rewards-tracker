import { describe, expect, it } from "vitest";

import type { CreditCard } from "./storage";
import {
  buildRewardCategoryNamesByFlag,
  filterCardSpendingTransactions,
  filterTransactionsForCardPeriod,
  filterTransactionsForSubcategory,
} from "./card-metrics";

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

describe("filterCardSpendingTransactions", () => {
  const card = { ynabAccountId: "account-1" };
  const transactions = [
    {
      id: "in-period-spend",
      account_id: "account-1",
      amount: -1000,
      date: "2026-04-05",
    },
    {
      id: "older-spend",
      account_id: "account-1",
      amount: -2000,
      date: "2026-03-20",
    },
    {
      id: "incoming",
      account_id: "account-1",
      amount: 3000,
      date: "2026-04-06",
    },
    {
      id: "other-account",
      account_id: "account-2",
      amount: -4000,
      date: "2026-04-07",
    },
  ];

  it("retains the legacy recent scope when no billing period is supplied", () => {
    expect(filterCardSpendingTransactions(card, transactions))
      .toEqual([transactions[0], transactions[1]]);
  });

  it("limits dashboard requests to spending within the supplied billing period", () => {
    expect(filterCardSpendingTransactions(card, transactions, {
      start: "2026-04-01",
      end: "2026-04-30",
    })).toEqual([transactions[0]]);
  });
});

describe("filterTransactionsForSubcategory", () => {
  const card: CreditCard = {
    id: "card-1",
    name: "Rewards card",
    issuer: "Bank",
    type: "cashback",
    ynabAccountId: "account-1",
    featured: true,
    subcategoriesEnabled: true,
    subcategories: [
      {
        id: "dining",
        name: "Dining",
        flagColor: "red",
        rewardValue: 5,
        priority: 0,
        active: true,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      {
        id: "everything-else",
        name: "Everything else",
        flagColor: "unflagged",
        rewardValue: 1,
        priority: 1,
        active: true,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ],
  };
  const transactions = [
    {
      id: "red",
      account_id: "account-1",
      amount: -1000,
      date: "2026-04-01",
      flag_color: "red",
    },
    {
      id: "blue-fallback",
      account_id: "account-1",
      amount: -2000,
      date: "2026-04-02",
      flag_color: "blue",
    },
    {
      id: "unflagged",
      account_id: "account-1",
      amount: -3000,
      date: "2026-04-03",
      flag_color: null,
    },
  ];

  it("matches a configured flag category", () => {
    expect(filterTransactionsForSubcategory(card, transactions, "dining"))
      .toEqual([transactions[0]]);
  });

  it("uses the unflagged category for unconfigured and unflagged transactions", () => {
    expect(filterTransactionsForSubcategory(card, transactions, "everything-else"))
      .toEqual([transactions[1], transactions[2]]);
  });

  it("labels inactive and unconfigured flags with the active fallback category", () => {
    const cardWithInactiveDining: CreditCard = {
      ...card,
      subcategories: card.subcategories?.map((subcategory) => (
        subcategory.id === "dining"
          ? { ...subcategory, active: false }
          : subcategory
      )),
    };

    expect(buildRewardCategoryNamesByFlag(cardWithInactiveDining)).toEqual(new Map([
      ["unflagged", "Everything else"],
      ["red", "Everything else"],
      ["orange", "Everything else"],
      ["yellow", "Everything else"],
      ["green", "Everything else"],
      ["blue", "Everything else"],
      ["purple", "Everything else"],
    ]));
  });
});
