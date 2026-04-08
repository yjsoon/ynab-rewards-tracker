"use client";

import { useMemo, useState, useEffect } from "react";
import {
  useYnabPAT,
  useCreditCards,
  useSelectedBudget,
  useTrackedAccountIds,
  useSettings,
} from "@/hooks/useLocalStorage";
import { useTrackedTransactions } from "@/hooks/useTrackedTransactions";
import { DashboardLanding } from "@/components/dashboard/DashboardLanding";
import { SetupProgressAlert } from "@/components/dashboard/SetupProgressAlert";
import { EnhancedTransactionsTable } from "@/components/transactions/EnhancedTransactionsTable";
import { storage } from "@/lib/storage";
import { YnabClient } from "@/lib/ynab-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { YnabFlagColor } from "@/lib/ynab-constants";

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
  const { settings } = useSettings();
  const [customFlagNames, setCustomFlagNames] = useState<
    Partial<Record<YnabFlagColor, string>>
  >({});

  const setupStatus: SetupStatus = useMemo(
    () => ({
      pat: Boolean(pat),
      budget: Boolean(selectedBudget.id),
      accounts: trackedAccountIds.length > 0,
      cards: cards.length > 0,
    }),
    [pat, selectedBudget.id, trackedAccountIds.length, cards.length],
  );

  const setupProgress = useMemo(
    () => Object.values(setupStatus).filter(Boolean).length,
    [setupStatus],
  );

  const setupPercentage = useMemo(
    () => (setupProgress / 4) * 100,
    [setupProgress],
  );

  const featuredCards = useMemo(
    () => cards.filter((card) => card.featured ?? true),
    [cards],
  );

  const {
    recentTransactions,
    accountsMap,
    loading,
    error,
    hasCachedData,
    refreshing,
    lastUpdatedAt,
    refresh,
  } = useTrackedTransactions({
    pat,
    selectedBudgetId: selectedBudget.id,
    trackedAccountIds,
    featuredCards,
    lookbackDays: TRANSACTION_LOOKBACK_DAYS,
    recentLimit: EXTENDED_TRANSACTIONS_LIMIT,
  });

  const tableLoading = loading && !hasCachedData;

  // Fetch custom flag names
  useEffect(() => {
    const budgetId = selectedBudget.id;
    if (!pat || !budgetId) {
      return;
    }

    const storedFlagNames = storage.getFlagNames();
    if (Object.keys(storedFlagNames).length > 0) {
      setCustomFlagNames(storedFlagNames);
    }

    let cancelled = false;

    const fetchFlagNames = async () => {
      try {
        const client = new YnabClient(pat);
        const names = await client.getCustomFlagNames(budgetId);
        if (cancelled) {
          return;
        }

        if (Object.keys(names).length > 0) {
          storage.mergeFlagNames(names);
        }

        setCustomFlagNames(names);
      } catch (err) {
        console.warn("Failed to fetch custom flag names", err);
      }
    };

    void fetchFlagNames();

    return () => {
      cancelled = true;
    };
  }, [pat, selectedBudget.id]);

  if (!setupStatus.pat) {
    return <DashboardLanding />;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="space-y-2 mb-6">
        <h1 className="text-3xl font-bold">Transactions</h1>
        <p className="text-muted-foreground">
          Review up to the last {EXTENDED_TRANSACTIONS_LIMIT} transactions from
          your tracked accounts.
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
            Showing activity from the past {TRANSACTION_LOOKBACK_DAYS} days
            across your tracked accounts. Expand any transaction to view details
            and edit its flag colour.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EnhancedTransactionsTable
            loading={tableLoading}
            error={error}
            transactions={recentTransactions}
            accountsMap={accountsMap}
            cards={cards}
            settings={settings}
            lookbackDays={TRANSACTION_LOOKBACK_DAYS}
            refreshing={refreshing}
            lastUpdatedAt={lastUpdatedAt}
            customFlagNames={customFlagNames}
            selectedBudgetId={selectedBudget.id}
            pat={pat}
            onTransactionUpdated={refresh}
          />
        </CardContent>
      </Card>
    </div>
  );
}
