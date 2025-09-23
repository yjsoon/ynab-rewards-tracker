'use client';

import { useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import type { CreditCard } from "@/lib/storage";
import { storage } from "@/lib/storage";
import { useCardTransactions } from "@/hooks/useCardTransactions";
import { SimpleRewardsCalculator } from "@/lib/rewards-engine";
import { absFromMilli } from "@/lib/utils";
import { CurrencyAmount } from "@/components/CurrencyAmount";

interface Props {
  card: CreditCard;
  lookbackDays?: number;
}

const LOOKBACK_DAYS = 90;

export default function TransactionsPreview({ card, lookbackDays = LOOKBACK_DAYS }: Props) {
  const { transactions, loading, error, refresh, connection } = useCardTransactions(
    card,
    { lookbackDays }
  );

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
  const settings = storage.getSettings();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>
              View your recent card transactions
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
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
                const { reward, blockInfo } = SimpleRewardsCalculator.calculateTransactionReward(
                  amount,
                  card,
                  settings
                );

                return (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between p-3 border rounded-md">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{txn.payee_name}</span>
                        {txn.flag_color && (
                          <Badge variant="outline" className="text-xs">
                            {txn.flag_name || txn.flag_color}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(txn.date).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        YNAB Category: {txn.category_name || "Uncategorised"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono">
                        <CurrencyAmount value={amount} currency={settings.currency} />
                      </div>
                      {card.earningRate && (
                        <div className="mt-1">
                          <Badge variant="secondary">
                            {card.type === "cashback" ? (
                              <CurrencyAmount value={reward} currency={settings.currency} showPlus />
                            ) : (
                              `+${Math.round(reward)} miles`
                            )}
                          </Badge>
                          {blockInfo && card.earningBlockSize && (
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
