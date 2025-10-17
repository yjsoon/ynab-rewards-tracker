"use client";

import { useMemo } from "react";
import {
  useYnabPAT,
  useCreditCards,
  useSelectedBudget,
  useTrackedAccountIds
} from "@/hooks/useLocalStorage";
import { useTrackedTransactions } from "@/hooks/useTrackedTransactions";
import { DashboardLanding } from "@/components/dashboard/DashboardLanding";
import { SetupProgressAlert } from "@/components/dashboard/SetupProgressAlert";
import { RecentTransactionsTable } from "@/components/dashboard/RecentTransactionsTable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

const TRANSACTION_LOOKBACK_DAYS = 60;
const EXTENDED_TRANSACTIONS_LIMIT = 100;

interface SetupStatus {
  pat: boolean;
  budget: boolean;
  accounts: boolean;
  cards: boolean;
}

export default function TransactionsPage() {
  const { pat } = useYnabPAT();
  const { cards } = useCreditCards();
  const { selectedBudget } = useSelectedBudget();
  const { trackedAccountIds } = useTrackedAccountIds();

  const setupStatus: SetupStatus = useMemo(
    () => ({
      pat: Boolean(pat),
      budget: Boolean(selectedBudget.id),
      accounts: trackedAccountIds.length > 0,
      cards: cards.length > 0
    }),
    [pat, selectedBudget.id, trackedAccountIds.length, cards.length]
  );

  const setupProgress = useMemo(
    () => Object.values(setupStatus).filter(Boolean).length,
    [setupStatus]
  );

  const setupPercentage = useMemo(
    () => (setupProgress / 4) * 100,
    [setupProgress]
  );

  const featuredCards = useMemo(
    () => cards.filter((card) => card.featured ?? true),
    [cards]
  );

  const { recentTransactions, accountsMap, loading, error, hasCachedData, refreshing, lastUpdatedAt } = useTrackedTransactions({
    pat,
    selectedBudgetId: selectedBudget.id,
    trackedAccountIds,
    featuredCards,
    lookbackDays: TRANSACTION_LOOKBACK_DAYS,
    recentLimit: EXTENDED_TRANSACTIONS_LIMIT
  });

  const tableLoading = loading && !hasCachedData;

  if (!setupStatus.pat) {
    return <DashboardLanding />;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Transactions</h1>
        <p className="text-muted-foreground">
          Review up to the last {EXTENDED_TRANSACTIONS_LIMIT} transactions from your tracked accounts.
        </p>
      </div>

      {setupProgress < 4 && (
        <SetupProgressAlert
          setupStatus={setupStatus}
          setupProgress={setupProgress}
          setupPercentage={setupPercentage}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>
            Showing activity from the past {TRANSACTION_LOOKBACK_DAYS} days across your tracked accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecentTransactionsTable
            loading={tableLoading}
            error={error}
            transactions={recentTransactions}
            accountsMap={accountsMap}
            lookbackDays={TRANSACTION_LOOKBACK_DAYS}
            refreshing={refreshing}
            lastUpdatedAt={lastUpdatedAt}
          />
        </CardContent>
      </Card>
    </div>
  );
}
