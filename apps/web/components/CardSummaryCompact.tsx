"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SimpleRewardsCalculator } from "@/lib/rewards-engine";
import { YnabClient } from "@/lib/ynab-client";
import { useSelectedBudget, useSettings } from "@/hooks/useLocalStorage";
import { hasMinimumSpendRequirement } from "@/lib/minimum-spend-helpers";
import { CurrencyAmount } from "@/components/CurrencyAmount";
import { SpendingProgressBar } from "@/components/SpendingProgressBar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshBadge } from "@/components/RefreshBadge";
import type { CreditCard } from "@/lib/storage";
import type { Transaction } from "@/types/transaction";

interface CardSummaryCompactProps {
  card: CreditCard;
  pat?: string;
  prefetchedTransactions?: Transaction[];
  onHideCard?: (cardId: string, hiddenUntil: string) => void;
  isRefreshing?: boolean;
}

export function CardSummaryCompact({ card, pat, prefetchedTransactions, onHideCard, isRefreshing }: CardSummaryCompactProps) {
  const { settings } = useSettings();
  const { selectedBudget } = useSelectedBudget();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const period = useMemo(() => SimpleRewardsCalculator.calculatePeriod(card), [card]);

  const loadTransactions = useCallback(async () => {
    if (prefetchedTransactions) {
      const cardTxns = prefetchedTransactions.filter((txn) =>
        txn.account_id === card.ynabAccountId && txn.date >= period.start && txn.date <= period.end
      );
      setTransactions(cardTxns);
      setLoading(false);
      return;
    }

    if (!pat || !card.ynabAccountId) {
      setLoading(false);
      return;
    }

    if (!selectedBudget.id) {
      setLoading(false);
      return;
    }

    const client = new YnabClient(pat);
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const allTxns = await client.getTransactions(selectedBudget.id, {
        since_date: period.start,
        signal: controller.signal,
      });
      const cardTxns = allTxns.filter(
        (txn: Transaction) => txn.account_id === card.ynabAccountId && txn.date <= period.end
      );
      setTransactions(cardTxns);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "AbortError") {
        console.error("Failed to load transactions:", error);
      }
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }, [prefetchedTransactions, pat, card.ynabAccountId, period, selectedBudget.id]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  const summary = useMemo(() => {
    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      transactions,
      period,
      settings || undefined
    );

    const now = new Date();
    const end = new Date(period.end);
    const diff = end.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));

    return {
      totalSpend: calculation.totalSpend,
      minimumSpend: calculation.minimumSpend,
      minimumSpendMet: calculation.minimumSpendMet,
      maximumSpend: calculation.maximumSpend,
      maximumSpendExceeded: calculation.maximumSpendExceeded,
      daysRemaining,
    };
  }, [card, transactions, period, settings]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <div className="h-3 w-24 rounded bg-muted/40 animate-pulse" />
        <div className="h-2 rounded bg-muted/30 animate-pulse" />
        <div className="h-3 w-32 rounded bg-muted/40 animate-pulse" />
      </div>
    );
  }

  const { totalSpend, minimumSpend, minimumSpendMet, maximumSpend, maximumSpendExceeded, daysRemaining } = summary;

  const currency = settings?.currency;
  const hasMinimum = hasMinimumSpendRequirement(minimumSpend);
  const minimumTarget = typeof minimumSpend === "number" && minimumSpend > 0 ? minimumSpend : 0;
  const clampedProgress = hasMinimum && minimumTarget > 0
    ? Math.min(1, Math.max(0, totalSpend / minimumTarget))
    : 0;
  const progressPercent = Math.round(clampedProgress * 100);

  const hasMaximum = typeof maximumSpend === "number" && maximumSpend > 0;
  const maximumTarget = hasMaximum ? maximumSpend : 0;
  const remainingToMaximum = hasMaximum ? Math.max(0, maximumTarget - totalSpend) : 0;
  const exceededAmount = hasMaximum ? Math.max(0, totalSpend - maximumTarget) : 0;

  const statusClass = hasMinimum
    ? minimumSpendMet
      ? "text-emerald-600 dark:text-emerald-300"
      : "text-amber-600 dark:text-amber-300"
    : "text-muted-foreground";

  const statusLabel = hasMinimum
    ? minimumSpendMet
      ? "Met"
      : `${progressPercent}%`
    : undefined;

  return (
    <div className="relative flex h-full flex-col gap-2.5">
      <RefreshBadge isRefreshing={isRefreshing} />
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Spent</span>
        <span className="text-base font-semibold">
          <CurrencyAmount value={totalSpend} currency={currency} />
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <SpendingProgressBar
          totalSpend={totalSpend}
          minimumSpend={minimumSpend}
          maximumSpend={maximumSpend}
          currency={currency}
          showLabels={false}
          showWarnings={false}
          className="h-2"
        />

        {hasMinimum ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Minimum <CurrencyAmount value={minimumTarget} currency={currency} />
            </span>
            <span className={cn("font-medium", statusClass)}>
              {statusLabel ?? (minimumSpendMet ? "Met" : `${progressPercent}%`)}
            </span>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">No minimum requirement</div>
        )}

        {hasMaximum && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Cap <CurrencyAmount value={maximumTarget} currency={currency} />
            </span>
            {maximumSpendExceeded ? (
              <span className="text-red-600 dark:text-red-400">
                +<CurrencyAmount value={exceededAmount} currency={currency} />
              </span>
            ) : remainingToMaximum > 0 ? (
              <span>
                <CurrencyAmount value={remainingToMaximum} currency={currency} /> left
              </span>
            ) : (
              <span>At cap</span>
            )}
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {daysRemaining} {daysRemaining === 1 ? "day" : "days"} left in cycle
          </span>
        </div>

        {maximumSpendExceeded && onHideCard && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs -mx-2 text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onHideCard(card.id, period.end);
            }}
          >
            Hide until next cycle
          </Button>
        )}
      </div>
    </div>
  );
}