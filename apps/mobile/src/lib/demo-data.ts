import {
  SimpleRewardsCalculator,
  buildRewardsDashboard,
} from '@ynab-counter/app-core/rewards-engine';
import { createRewardCalculationFromSimple } from '@ynab-counter/app-core/rewards-engine/utils/reward-calculation';
import { getEarliestPeriodStart } from '@ynab-counter/app-core/rewards-engine/utils/periods';
import { formatCalculationPeriod } from '@ynab-counter/app-core/storage';
import type {
  AppSettings,
  CardSubcategory,
  CreditCard,
  HiddenCard,
  RewardCalculation,
  RewardRule,
  StorageData,
  TagMapping,
  ThemeGroup,
  Transaction,
} from '@ynab-counter/app-core/storage';
import type {
  YnabAccountSummary,
  YnabBudgetSummary,
} from '@ynab-counter/ynab-client';

/**
 * A deliberately invalid, in-memory-only credential. It makes connected UI
 * paths available in the simulator without containing or persisting a secret.
 */
export const DEMO_SESSION_CREDENTIAL = 'demo-session-only-not-a-ynab-token';

export const DEMO_BUDGET_ID = 'demo-budget-household';

export interface DemoStorageFixture {
  pat: string;
  selectedBudget: { id: string; name: string };
  trackedAccountIds: string[];
  cards: CreditCard[];
  rules: RewardRule[];
  tagMappings: TagMapping[];
  calculations: RewardCalculation[];
  themeGroups: ThemeGroup[];
  hiddenCards: HiddenCard[];
  settings: AppSettings;
  cachedData: NonNullable<StorageData['cachedData']>;
  budgets: YnabBudgetSummary[];
  accounts: YnabAccountSummary[];
  metadata: {
    lastAttemptedSync: string;
    lastSuccessfulSync: string;
    accountsBudgetId: string;
  };
}

function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysBefore(value: Date, count: number): Date {
  const result = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  result.setDate(result.getDate() - count);
  return result;
}

function transactionDate(card: CreditCard, now: Date, daysAgo: number): string {
  const period = SimpleRewardsCalculator.calculatePeriod(card, now);
  const candidate = localDate(daysBefore(now, daysAgo));
  return candidate < period.start ? period.start : candidate;
}

function subcategory(
  id: string,
  name: string,
  flagColor: CardSubcategory['flagColor'],
  rewardValue: number,
  priority: number,
  timestamp: string,
  options: Partial<Pick<
    CardSubcategory,
    'milesBlockSize' | 'minimumSpend' | 'maximumSpend' | 'excludeFromRewards'
  >> = {},
): CardSubcategory {
  return {
    id,
    name,
    flagColor,
    rewardValue,
    priority,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...options,
  };
}

function transaction(params: {
  id: string;
  card: CreditCard;
  now: Date;
  daysAgo: number;
  amount: number;
  payee: string;
  category: string;
  flagColor?: string;
  flagName?: string;
  incoming?: boolean;
  memo?: string;
}): Transaction {
  return {
    id: `demo-transaction-${params.id}`,
    date: transactionDate(params.card, params.now, params.daysAgo),
    amount: Math.round(params.amount * 1000) * (params.incoming ? 1 : -1),
    account_id: params.card.ynabAccountId,
    payee_name: params.payee,
    category_name: params.category,
    memo: params.memo ?? 'Simulator sample — no YNAB data',
    cleared: params.daysAgo > 1 ? 'cleared' : 'uncleared',
    approved: true,
    flag_color: params.flagColor ?? null,
    flag_name: params.flagName ?? null,
  };
}

/**
 * Builds a complete, date-relative dataset for simulator screenshots and manual
 * QA. The same input date always produces the same cards, transactions and
 * reward projections.
 */
export function createDemoStorageFixture(now = new Date()): DemoStorageFixture {
  const syncTime = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
  const timestamp = now.toISOString();

  const cards: CreditCard[] = [
    {
      id: 'demo-card-ember',
      name: 'DEMO · Ember Everyday',
      issuer: 'Demo Bank',
      type: 'cashback',
      ynabAccountId: 'demo-account-ember',
      billingCycle: { type: 'calendar', dayOfMonth: 1 },
      featured: true,
      earningRate: 1,
      earningBlockSize: null,
      minimumSpend: 500,
      maximumSpend: 1_000,
      subcategoriesEnabled: true,
      subcategories: [
        subcategory('demo-subcat-groceries', 'Groceries', 'orange', 8, 1, timestamp, {
          maximumSpend: 500,
        }),
        subcategory('demo-subcat-transit', 'Transit', 'blue', 4, 2, timestamp),
        subcategory('demo-subcat-everything', 'Everything else', 'unflagged', 1, 3, timestamp),
        subcategory('demo-subcat-excluded', 'Fees excluded', 'red', 0, 4, timestamp, {
          excludeFromRewards: true,
        }),
      ],
    },
    {
      id: 'demo-card-orbit',
      name: 'DEMO · Orbit Miles',
      issuer: 'Demo Air',
      type: 'miles',
      ynabAccountId: 'demo-account-orbit',
      billingCycle: { type: 'billing', dayOfMonth: 18 },
      featured: true,
      earningRate: 4,
      earningBlockSize: 5,
      minimumSpend: 300,
      maximumSpend: 1_000,
      subcategoriesEnabled: false,
      subcategories: [],
    },
    {
      id: 'demo-card-tide',
      name: 'DEMO · Tide Cashback',
      issuer: 'Demo Bank',
      type: 'cashback',
      ynabAccountId: 'demo-account-tide',
      billingCycle: { type: 'calendar', dayOfMonth: 1 },
      featured: true,
      earningRate: 3,
      earningBlockSize: null,
      minimumSpend: 300,
      maximumSpend: 1_000,
      subcategoriesEnabled: false,
      subcategories: [],
    },
    {
      id: 'demo-card-summit',
      name: 'DEMO · Summit Miles',
      issuer: 'Demo Premier',
      type: 'miles',
      ynabAccountId: 'demo-account-summit',
      billingCycle: { type: 'billing', dayOfMonth: 24 },
      featured: true,
      earningRate: 1.2,
      earningBlockSize: null,
      minimumSpend: null,
      maximumSpend: 1_000,
      subcategoriesEnabled: false,
      subcategories: [],
    },
  ];

  const [ember, orbit, tide, summit] = cards;
  const transactions: Transaction[] = [
    transaction({
      id: 'ember-groceries', card: ember, now, daysAgo: 0, amount: 125,
      payee: 'Demo Fresh Market', category: 'Groceries', flagColor: 'orange', flagName: 'Bonus · Groceries',
    }),
    transaction({
      id: 'ember-transit', card: ember, now, daysAgo: 1, amount: 95,
      payee: 'Demo Metro', category: 'Transport', flagColor: 'blue', flagName: 'Bonus · Transit',
    }),
    transaction({
      id: 'ember-general', card: ember, now, daysAgo: 3, amount: 200,
      payee: 'Demo Corner Store', category: 'Household',
    }),
    transaction({
      id: 'ember-fee', card: ember, now, daysAgo: 4, amount: 12.9,
      payee: 'Demo Bank Fee', category: 'Fees', flagColor: 'red', flagName: 'No rewards',
    }),
    transaction({
      id: 'orbit-flight', card: orbit, now, daysAgo: 0, amount: 117.9,
      payee: 'Demo Airways', category: 'Travel', flagColor: 'yellow', flagName: 'Travel',
    }),
    transaction({
      id: 'orbit-online', card: orbit, now, daysAgo: 2, amount: 189.2,
      payee: 'Demo Online Shop', category: 'Shopping', flagColor: 'purple', flagName: 'Online',
    }),
    transaction({
      id: 'orbit-dining', card: orbit, now, daysAgo: 5, amount: 153.35,
      payee: 'Demo Noodle House', category: 'Dining Out', flagColor: 'green', flagName: 'Dining',
    }),
    transaction({
      id: 'tide-utilities', card: tide, now, daysAgo: 1, amount: 325.5,
      payee: 'Demo Utilities', category: 'Bills',
    }),
    transaction({
      id: 'tide-groceries', card: tide, now, daysAgo: 3, amount: 284.5,
      payee: 'Demo Grocer', category: 'Groceries', flagColor: 'orange', flagName: 'Groceries',
    }),
    transaction({
      id: 'tide-shopping', card: tide, now, daysAgo: 6, amount: 250,
      payee: 'Demo Department Store', category: 'Shopping',
    }),
    transaction({
      id: 'tide-refund', card: tide, now, daysAgo: 0, amount: 30,
      payee: 'Demo Department Store', category: 'Shopping', incoming: true,
      memo: 'Demo refund',
    }),
    transaction({
      id: 'summit-hotel', card: summit, now, daysAgo: 2, amount: 650,
      payee: 'Demo Harbour Hotel', category: 'Travel', flagColor: 'yellow', flagName: 'Travel',
    }),
    transaction({
      id: 'summit-electronics', card: summit, now, daysAgo: 4, amount: 450,
      payee: 'Demo Electronics', category: 'Shopping', flagColor: 'purple', flagName: 'Online',
    }),
  ];

  const settings: AppSettings = {
    theme: 'auto',
    currency: 'SGD',
    milesValuation: 0.012,
    dashboardViewMode: 'summary',
    groupCardsByType: false,
    cardOrdering: {
      all: cards.map((card) => card.id),
    },
  };

  const rules: RewardRule[] = cards.map((card, index) => {
    const period = SimpleRewardsCalculator.calculatePeriod(card, now);
    return {
      id: `demo-rule-${card.id}`,
      cardId: card.id,
      name: index === 0 ? 'Demo flagged-category rewards' : 'Demo standard earn',
      rewardType: card.type,
      rewardValue: index === 0 ? 8 : card.earningRate ?? 0,
      minimumSpend: card.minimumSpend ?? undefined,
      maximumSpend: card.maximumSpend ?? undefined,
      startDate: period.start,
      endDate: period.end,
      active: true,
      priority: index + 1,
    };
  });

  const tagMappings: TagMapping[] = [
    { id: 'demo-map-groceries', cardId: ember.id, ynabTag: 'orange', rewardCategory: 'Groceries' },
    { id: 'demo-map-transit', cardId: ember.id, ynabTag: 'blue', rewardCategory: 'Transit' },
    { id: 'demo-map-fees', cardId: ember.id, ynabTag: 'red', rewardCategory: 'Fees excluded' },
  ];

  const calculations = cards.map((card) => {
    const period = SimpleRewardsCalculator.calculatePeriod(card, now);
    const cardTransactions = transactions.filter((entry) => entry.account_id === card.ynabAccountId);
    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      cardTransactions,
      period,
      settings,
    );
    return {
      ...createRewardCalculationFromSimple(card, calculation, `demo-rule-${card.id}`),
      period: formatCalculationPeriod(period),
    };
  });

  const accounts: YnabAccountSummary[] = cards.map((card, index) => ({
    id: card.ynabAccountId,
    name: `${card.name} · Demo account`,
    type: 'creditCard',
    on_budget: true,
    closed: false,
    balance: -Math.round([420, 460.45, 830, 1_100][index] * 1000),
    cleared_balance: -Math.round([295, 153.35, 860, 1_100][index] * 1000),
    uncleared_balance: -Math.round([125, 307.1, -30, 0][index] * 1000),
    direct_import_linked: true,
    direct_import_in_error: false,
  }));

  const budget: YnabBudgetSummary = {
    id: DEMO_BUDGET_ID,
    name: 'Demo household',
    last_modified_on: syncTime,
    first_month: `${now.getFullYear()}-01-01`,
    last_month: `${now.getFullYear()}-12-01`,
    currency_format: {
      iso_code: 'SGD',
      example_format: '$123.45',
      decimal_digits: 2,
      decimal_separator: '.',
      symbol_first: true,
      group_separator: ',',
      currency_symbol: '$',
      display_symbol: true,
    },
  };

  const trackedAccountIds = cards.map((card) => card.ynabAccountId);
  const sinceDate = getEarliestPeriodStart(cards, now);

  return {
    pat: DEMO_SESSION_CREDENTIAL,
    selectedBudget: { id: budget.id, name: budget.name },
    trackedAccountIds,
    cards,
    rules,
    tagMappings,
    calculations,
    themeGroups: [],
    hiddenCards: [],
    settings,
    cachedData: {
      lastUpdated: syncTime,
      flagNames: {
        red: 'No rewards',
        orange: 'Bonus · Groceries',
        yellow: 'Travel',
        green: 'Dining',
        blue: 'Bonus · Transit',
        purple: 'Online',
      },
      accounts: [{
        budgetId: budget.id,
        fetchedAt: syncTime,
        scopeKey: trackedAccountIds.slice().sort().join(','),
        accounts: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          type: account.type,
          on_budget: account.on_budget,
          closed: account.closed,
          balance: account.balance,
        })),
      }],
      dashboardTransactions: [{
        budgetId: budget.id,
        sinceDate,
        fetchedAt: syncTime,
        trackedAccountIds,
        isComplete: true,
        transactions,
        accounts: accounts.map(({ id, name }) => ({ id, name })),
      }],
    },
    budgets: [budget],
    accounts,
    metadata: {
      lastAttemptedSync: syncTime,
      lastSuccessfulSync: syncTime,
      accountsBudgetId: budget.id,
    },
  };
}

export function getDemoPortfolioStatuses(now = new Date()): string[] {
  const fixture = createDemoStorageFixture(now);
  const cache = fixture.cachedData.dashboardTransactions?.[0];
  return buildRewardsDashboard(
    fixture.cards,
    cache?.transactions ?? [],
    fixture.settings,
    now,
  ).cards.map((card) => card.status);
}
