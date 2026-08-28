export type ProviderMigrationTarget = {
  id: string;
  name: string;
};

export type ProviderMigrationValidation =
  | { ok: true; budget: ProviderMigrationTarget }
  | { ok: false; reason: 'budget-not-found' }
  | { ok: false; reason: 'accounts-not-found'; missingAccountIds: string[] };

export type ProviderMigrationSnapshot = {
  selectedBudgetId: string;
  trackedAccountIds: string[];
  linkedCardAccountIds: string[];
};

function normaliseIds(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

export function createProviderMigrationSnapshot(
  snapshot: ProviderMigrationSnapshot,
): ProviderMigrationSnapshot {
  return {
    selectedBudgetId: snapshot.selectedBudgetId,
    trackedAccountIds: normaliseIds(snapshot.trackedAccountIds),
    linkedCardAccountIds: normaliseIds(snapshot.linkedCardAccountIds),
  };
}

export function providerMigrationSnapshotsMatch(
  current: ProviderMigrationSnapshot,
  expected: ProviderMigrationSnapshot,
): boolean {
  return JSON.stringify(createProviderMigrationSnapshot(current))
    === JSON.stringify(createProviderMigrationSnapshot(expected));
}

type ValidateProviderMigrationInput = {
  selectedBudgetId: string;
  trackedAccountIds: string[];
  linkedCardAccountIds: string[];
  budgets: ProviderMigrationTarget[];
  accounts: Array<{ id: string }>;
};

export function validateProviderMigration({
  selectedBudgetId,
  trackedAccountIds,
  linkedCardAccountIds,
  budgets,
  accounts,
}: ValidateProviderMigrationInput): ProviderMigrationValidation {
  const budget = budgets.find((candidate) => candidate.id === selectedBudgetId);
  if (!budget) {
    return { ok: false, reason: 'budget-not-found' };
  }

  const targetAccountIds = new Set(accounts.map((account) => account.id));
  const requiredAccountIds = new Set([...trackedAccountIds, ...linkedCardAccountIds]);
  const missingAccountIds = [...requiredAccountIds]
    .filter((accountId) => !targetAccountIds.has(accountId))
    .sort();

  if (missingAccountIds.length > 0) {
    return { ok: false, reason: 'accounts-not-found', missingAccountIds };
  }

  return { ok: true, budget };
}
