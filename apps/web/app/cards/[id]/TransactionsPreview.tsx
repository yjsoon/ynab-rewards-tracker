'use client';

import { useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import type { CreditCard } from "@/lib/storage";
import { useCardTransactions } from "@/hooks/useCardTransactions";
import { useSettings } from "@/hooks/useLocalStorage";
import { projectTransactions } from "@/lib/rewards-engine";
import { absFromMilli } from "@/lib/utils";
import { CurrencyAmount } from "@/components/CurrencyAmount";
import type { ConnectionState } from "@/hooks/useCardTransactions";
import type { Transaction } from "@/types/transaction";

interface Props {
  card: CreditCard;
  lookbackDays?: number;
  periodDataSinceDate?: string;
  prefetchedTransactions?: Transaction[];
  transactionsLoading?: boolean;
  transactionsError?: string;
  onRefresh?: () => Promise<void>;
  connection?: ConnectionState;
}

const LOOKBACK_DAYS = 90;

export default function TransactionsPreview({
  card,
  lookbackDays = LOOKBACK_DAYS,
  periodDataSinceDate,
  prefetchedTransactions,
  transactionsLoading,
  transactionsError,
  onRefresh,
  connection: prefetchedConnection,
}: Props) {
  const hasPrefetchedTransactions = Array.isArray(prefetchedTransactions);
  const cardTransactions = useCardTransactions(
    card,
    { enabled: !hasPrefetchedTransactions, lookbackDays }
  );
  const transactions = prefetchedTransactions ?? cardTransactions.transactions;
  const loading = transactionsLoading ?? cardTransactions.loading;
  const error = transactionsError ?? cardTransactions.error;
  const refresh = onRefresh ?? cardTransactions.refresh;
  const connection = prefetchedConnection ?? cardTransactions.connection;

  const needSetup = !connection.hasPat || !connection.hasBudget;

  const spendingTransactions = useMemo(
    () => transactions.filter((t) => t.amount < 0),
    [transactions]
  );

  const displayedTransactions = useMemo(
    () => spendingTransactions.slice(0, 10),
    [spendingTransactions]
  );

  const totalSpendingCount = spendingTransactions.length;
  const { settings } = useSettings();
  const rewardProjections = useMemo(
    () => new Map(
      projectTransactions(
        transactions,
        [card],
        settings,
        undefined,
        { periodDataSinceDate },
      ).map((projection) => [
        projection.transaction.id,
        projection,
      ] as const),
    ),
    [card, periodDataSinceDate, settings, transactions],
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            Refresh
          </Button>
        </div>
        {needSetup ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4" />
            <p className="text-lg mb-2">YNAB not configured</p>
            <p>Connect to YNAB to see your transactions</p>
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/settings">Configure YNAB Connection</Link>
            </Button>
          </div>
        ) : loading && transactions.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Calendar className="h-6 w-6 mr-2" /> Loading transactions...
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">
            Failed to load transactions: {error}
          </div>
        ) : totalSpendingCount === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-3" />
            <p>
              No spending transactions found in the last {lookbackDays} days.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {displayedTransactions.map((txn) => {
                const amount = absFromMilli(txn.amount);
                const projection = rewardProjections.get(txn.id);
                const reward = projection?.reward.amount ?? 0;
                const blockInfo = projection?.blockInfo
                  ? `${projection.blockInfo.count} block${projection.blockInfo.count === 1 ? '' : 's'} × $${projection.blockInfo.size}`
                  : undefined;

                return (
                  <div
                    key={txn.id}
                    className="flex min-w-0 items-start justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="min-w-0 break-words font-medium">{txn.payee_name}</span>
                        {txn.flag_color && (
                          <Badge variant="outline" className="max-w-full whitespace-normal break-words text-xs">
                            {txn.flag_name || txn.flag_color}
                          </Badge>
                        )}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {new Date(txn.date).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="mt-1 break-words text-sm text-muted-foreground">
                        YNAB Category: {txn.category_name || "Uncategorised"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono">
                        <CurrencyAmount value={amount} currency={settings.currency} />
                      </div>
                      {reward > 0 && (
                        <div className="mt-1">
                          <p className="text-xs text-green-600 dark:text-green-400">
                            {card.type === "cashback" ? (
                              <CurrencyAmount value={reward} currency={settings.currency} showPlus />
                            ) : (
                              `+${Math.round(reward)} miles`
                            )}
                          </p>
                          {blockInfo && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {blockInfo}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {totalSpendingCount > 10 && (
              <div className="mt-4 pt-4 border-t text-center">
                <Button variant="outline" asChild>
                  <Link href={`/cards/${card.id}/transactions`}>
                    More transactions ({totalSpendingCount} total)
                  </Link>
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
