import { describe, expect, it } from "vitest";

import type { CreditCard } from "./storage";
import { SimpleRewardsCalculator } from "./rewards-engine";
import {
  buildRewardCategoryNamesByFlag,
  filterCardSpendingTransactions,
  filterTransactionsForCardPeriod,
  filterTransactionsForSubcategory,
  getCardAttentionStatus,
  resolveCardTransactionDateRange,
  resolveRewardDataSinceDate,
} from "./card-metrics";

describe("getCardAttentionStatus", () => {
  const card: CreditCard = {
    id: "tiered-card",
    name: "Tiered card",
    issuer: "Bank",
    type: "cashback",
    ynabAccountId: "account-1",
    featured: true,
    earningRate: 6,
    minimumSpend: 50,
    maximumSpend: 20,
    spendingTiers: [{
      id: "higher-tier",
      spendThreshold: 100,
      earningRate: 8,
      maximumSpend: 30,
    }],
  };
  const period = { start: "2026-08-01", end: "2026-08-31", label: "August" };

  it("does not present an intermediate cap as the final card cap", () => {
    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, [{
      id: "between-tiers",
      account_id: card.ynabAccountId,
      amount: -80_000,
      date: "2026-08-10",
    }], period);

    expect(calculation.maximumSpendExceeded).toBe(true);
    expect(getCardAttentionStatus(card, calculation)).toBe("earning");
  });

  it("keeps the highest tier cap terminal", () => {
    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, [{
      id: "highest-tier",
      account_id: card.ynabAccountId,
      amount: -120_000,
      date: "2026-08-10",
    }], period);

    expect(getCardAttentionStatus(card, calculation)).toBe("at-cap");
  });
});

describe("resolveCardTransactionDateRange", () => {
  const card: CreditCard = {
    id: "card-1",
    name: "Rewards card",
    issuer: "Bank",
    type: "cashback",
    ynabAccountId: "account-1",
    billingCycle: {
      type: "billing",
      dayOfMonth: 15,
    },
    featured: true,
  };
  const referenceDate = new Date(2026, 7, 9, 12);

  it.each([
    ["this-billing-cycle", "2026-07-15", "2026-08-09"],
    ["last-billing-cycle", "2026-06-15", "2026-07-14"],
    ["month-to-date", "2026-08-01", "2026-08-09"],
    ["last-month", "2026-07-01", "2026-07-31"],
    ["last-90-days", "2026-05-11", "2026-08-09"],
  ] as const)("resolves %s", (preset, start, end) => {
    expect(resolveCardTransactionDateRange(card, preset, referenceDate)).toEqual({
      start,
      end,
      isValid: true,
    });
  });

  it("uses an inclusive custom range", () => {
    expect(resolveCardTransactionDateRange(
      card,
      "custom",
      referenceDate,
      "2026-02-03",
      "2026-02-12",
    )).toEqual({
      start: "2026-02-03",
      end: "2026-02-12",
      isValid: true,
    });
  });

  it("marks incomplete and reversed custom ranges as invalid", () => {
    expect(resolveCardTransactionDateRange(
      card,
      "custom",
      referenceDate,
      "2026-02-12",
      "2026-02-03",
    ).isValid).toBe(false);
    expect(resolveCardTransactionDateRange(
      card,
      "custom",
      referenceDate,
      "2026-02-03",
      null,
    ).isValid).toBe(false);
  });

  it("keeps billing-cycle presets contiguous when entering and leaving a promotion", () => {
    const promotionalCard: CreditCard = {
      ...card,
      promotionalPeriod: {
        startDate: "2026-07-01",
        endDate: "2026-09-30",
      },
    };

    expect(resolveCardTransactionDateRange(
      promotionalCard,
      "last-billing-cycle",
      referenceDate,
    )).toEqual({
      start: "2026-06-15",
      end: "2026-06-30",
      isValid: true,
    });
    expect(resolveCardTransactionDateRange(
      promotionalCard,
      "last-billing-cycle",
      new Date(2026, 9, 9, 12),
    )).toEqual({
      start: "2026-07-01",
      end: "2026-09-14",
      isValid: true,
    });
  });

  it("handles a day-31 billing cycle across leap-year February", () => {
    const endOfMonthCard: CreditCard = {
      ...card,
      billingCycle: {
        type: "billing",
        dayOfMonth: 31,
      },
    };

    expect(resolveCardTransactionDateRange(
      endOfMonthCard,
      "this-billing-cycle",
      new Date(2024, 2, 15, 12),
    )).toEqual({
      start: "2024-02-29",
      end: "2024-03-15",
      isValid: true,
    });
    expect(resolveCardTransactionDateRange(
      endOfMonthCard,
      "last-billing-cycle",
      new Date(2024, 2, 15, 12),
    )).toEqual({
      start: "2024-01-31",
      end: "2024-02-28",
      isValid: true,
    });
  });
});

describe("resolveRewardDataSinceDate", () => {
  it("fetches the complete reward period containing the oldest visible date", () => {
    const cards: CreditCard[] = [{
      id: "calendar-card",
      name: "Calendar card",
      issuer: "Bank",
      type: "cashback",
      ynabAccountId: "account-1",
      featured: true,
      billingCycle: { type: "calendar" },
    }, {
      id: "billing-card",
      name: "Billing card",
      issuer: "Bank",
      type: "cashback",
      ynabAccountId: "account-2",
      featured: true,
      billingCycle: { type: "billing", dayOfMonth: 15 },
    }];

    expect(resolveRewardDataSinceDate(
      cards,
      60,
      new Date(2026, 7, 16, 12),
    )).toBe("2026-06-01");
  });
});

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
