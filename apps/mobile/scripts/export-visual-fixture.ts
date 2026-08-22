import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SimpleRewardsCalculator } from '@ynab-counter/app-core/rewards-engine';
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  STORAGE_VERSION_KEY,
} from '@ynab-counter/app-core/storage';
import type { CreditCard, DashboardTransactionsCacheEntry } from '@ynab-counter/app-core/storage';

import { createDemoStorageFixture } from '../src/lib/demo-data';

const REFERENCE_MS = Date.UTC(2026, 6, 31, 12, 0, 0);
const LOOKBACK_DAYS = 30;
const FETCHED_AT_OFFSET_MS = 20_000;

function formatDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveRewardDataSinceDate(
  cards: CreditCard[],
  lookbackDays: number,
  referenceDate: Date,
): string {
  const lookbackStart = new Date(referenceDate);
  lookbackStart.setDate(lookbackStart.getDate() - lookbackDays);
  const periodStarts = cards.map((card) => (
    SimpleRewardsCalculator.calculatePeriod(card, lookbackStart).start
  ));
  return [formatDateValue(lookbackStart), ...periodStarts].sort()[0];
}

const referenceDate = new Date(REFERENCE_MS);
const fixture = createDemoStorageFixture(referenceDate);
const fetchedAt = new Date(REFERENCE_MS - FETCHED_AT_OFFSET_MS).toISOString();
const webSinceDate = resolveRewardDataSinceDate(
  fixture.cards,
  LOOKBACK_DAYS,
  referenceDate,
);

const dashboardEntries: DashboardTransactionsCacheEntry[] = (
  fixture.cachedData.dashboardTransactions ?? []
).map((entry) => ({
  ...entry,
  fetchedAt,
  isComplete: true,
}));

const existing = dashboardEntries[0];
if (existing && existing.sinceDate !== webSinceDate) {
  dashboardEntries.push({
    ...existing,
    sinceDate: webSinceDate,
    fetchedAt,
    isComplete: true,
  });
}

const storage = {
  ynab: {
    pat: fixture.pat,
    lastSync: fetchedAt,
    selectedBudgetId: fixture.selectedBudget.id,
    selectedBudgetName: fixture.selectedBudget.name,
    trackedAccountIds: fixture.trackedAccountIds,
  },
  cards: fixture.cards,
  rules: fixture.rules,
  tagMappings: fixture.tagMappings,
  calculations: fixture.calculations,
  themeGroups: fixture.themeGroups,
  settings: {
    ...fixture.settings,
    theme: 'light' as const,
  },
  hiddenCards: fixture.hiddenCards,
  cachedData: {
    ...fixture.cachedData,
    lastUpdated: fetchedAt,
    dashboardTransactions: dashboardEntries,
  },
};

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../../../scripts/dashboard-visual/generated');
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, 'web-storage.json'), `${JSON.stringify({
  [STORAGE_KEY]: storage,
  [STORAGE_VERSION_KEY]: STORAGE_VERSION,
  theme: 'light',
}, null, 2)}\n`);

writeFileSync(join(outDir, 'ynab-stub.json'), `${JSON.stringify({
  budgets: fixture.budgets,
  accounts: fixture.accounts,
  transactions: existing?.transactions ?? [],
}, null, 2)}\n`);

writeFileSync(join(outDir, 'meta.json'), `${JSON.stringify({
  referenceMs: REFERENCE_MS,
  referenceIso: referenceDate.toISOString(),
  webSinceDate,
  mobileSinceDate: existing?.sinceDate ?? null,
  viewport: { width: 390, height: 844 },
}, null, 2)}\n`);

process.stdout.write(`${outDir}\n`);
