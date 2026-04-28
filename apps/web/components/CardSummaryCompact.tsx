"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { YnabFlagColor } from "@/lib/ynab-constants";
import { formatDateValue } from "@/lib/dashboard-period";
import { SimpleRewardsCalculator } from "@/lib/rewards-engine";
import { YnabClient } from "@/lib/ynab-client";
import { filterTransactionsForCardPeriod } from "@/lib/card-metrics";
import { useSelectedBudget, useSettings } from "@/hooks/useLocalStorage";
import { hasMinimumSpendRequirement } from "@/lib/minimum-spend-helpers";
import { CurrencyAmount } from "@/components/CurrencyAmount";
import { SpendingProgressBar } from "@/components/SpendingProgressBar";
import { SubcategoryBreakdownCompact } from "@/components/SubcategoryBreakdownCompact";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshBadge } from "@/components/RefreshBadge";
import { storage } from "@/lib/storage";
import type {
  AppSettings,
  CreditCard,
  SummaryViewSubcategoriesPreference,
} from "@/lib/storage";
import type { Transaction } from "@/types/transaction";
import type { PrefetchedCardMetrics } from "@/lib/card-metrics";

const isExpansionMap = (value: unknown): value is Record<string, boolean> =>
  value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value);

interface CardSummaryCompactContentProps {
  card: CreditCard;
  flagNames: Partial<Record<YnabFlagColor, string>>;
  isRefreshing?: boolean;
  isSubcategoryExpanded: boolean;
  metrics: PrefetchedCardMetrics;
  onHideCard?: (cardId: string, hiddenUntil: string) => void;
  onToggleSubcategories?: () => void;
  settings?: AppSettings;
  allowHideCard?: boolean;
}

export function CardSummaryCompactContent({
  card,
  flagNames,
  isRefreshing,
  isSubcategoryExpanded,
  metrics,
  onHideCard,
  onToggleSubcategories,
  settings,
  allowHideCard = true,
}: CardSummaryCompactContentProps) {
  const { calculation, daysRemaining, period } = metrics;
  const {
    totalSpend,
    countedSpend,
    eligibleSpend,
    minimumSpend,
    minimumSpendMet,
    maximumSpend,
    maximumSpendExceeded,
    subcategoryBreakdowns = [],
  } = calculation;
  const currency = settings?.currency;
  const hasBlockRounding = Boolean(
    (typeof card.earningBlockSize === "number" && card.earningBlockSize > 0) ||
      (card.subcategoriesEnabled &&
        card.subcategories?.some(
          (subcategory) =>
            typeof subcategory.milesBlockSize === "number" && subcategory.milesBlockSize > 0
        ))
  );
  const displayedSpend = hasBlockRounding ? countedSpend : totalSpend;
  const hasMinimum = hasMinimumSpendRequirement(minimumSpend);
  const minimumTarget = typeof minimumSpend === "number" && minimumSpend > 0 ? minimumSpend : 0;
  const clampedProgress = hasMinimum && minimumTarget > 0
    ? Math.min(1, Math.max(0, totalSpend / minimumTarget))
    : 0;
  const progressPercent = Math.round(clampedProgress * 100);

  const hasMaximum = typeof maximumSpend === "number" && maximumSpend > 0;
  const maximumTarget = hasMaximum ? maximumSpend : 0;
  const remainingToMaximum = hasMaximum ? Math.max(0, maximumTarget - displayedSpend) : 0;
  const exceededAmount = hasMaximum ? Math.max(0, displayedSpend - maximumTarget) : 0;
  const displayedSubcategoryBreakdowns = hasBlockRounding
    ? subcategoryBreakdowns.map((entry) => ({ ...entry, totalSpend: entry.countedSpend }))
    : subcategoryBreakdowns;

  const minStatusClass = minimumSpendMet
    ? "text-emerald-600 dark:text-emerald-300"
    : "text-amber-600 dark:text-amber-300";

  const daysSeverityClass = daysRemaining <= 1
    ? "text-rose-500 dark:text-rose-300"
    : daysRemaining <= 3
      ? "text-orange-500 dark:text-orange-300"
      : daysRemaining <= 7
        ? "text-amber-600 dark:text-amber-300"
        : "text-muted-foreground";

  const blockSize = card.earningBlockSize;
  const showBlocks = Boolean(
    blockSize && blockSize > 0 && eligibleSpend !== undefined && eligibleSpend > 0,
  );

  return (
    <div className="relative flex h-full flex-col gap-2.5">
      <RefreshBadge isRefreshing={isRefreshing} />
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Spent</span>
        <span className="text-lg font-semibold tracking-tight">
          <CurrencyAmount value={displayedSpend} currency={currency} />
        </span>
      </div>

      <SpendingProgressBar
        totalSpend={displayedSpend}
        minimumSpend={minimumSpend}
        maximumSpend={maximumSpend}
        minimumProgressSpend={totalSpend}
        maximumProgressSpend={displayedSpend}
        currency={currency}
        showLabels={false}
        showWarnings={false}
        className="h-2"
      />

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {hasMinimum && (
            <span className={cn("font-medium", minStatusClass)}>
              {minimumSpendMet ? (
                <>Met <CurrencyAmount value={minimumTarget} currency={currency} decimals={0} /> min</>
              ) : (
                <>{progressPercent}% of <CurrencyAmount value={minimumTarget} currency={currency} decimals={0} /> min</>
              )}
            </span>
          )}
          {hasMinimum && hasMaximum && <span className="mx-1.5 text-muted-foreground/60">·</span>}
          {hasMaximum && (
            maximumSpendExceeded ? (
              <span className="font-medium text-red-600 dark:text-red-400">
                +<CurrencyAmount value={exceededAmount} currency={currency} decimals={0} /> over{" "}
                <CurrencyAmount value={maximumTarget} currency={currency} decimals={0} /> cap
              </span>
            ) : (
              <span>
                <CurrencyAmount value={remainingToMaximum} currency={currency} decimals={0} /> left of{" "}
                <CurrencyAmount value={maximumTarget} currency={currency} decimals={0} /> cap
              </span>
            )
          )}
          {!hasMinimum && !hasMaximum && (
            <span className="italic">No spend limits</span>
          )}
        </span>
        <span className={cn("shrink-0 font-medium", daysSeverityClass)}>{daysRemaining}d</span>
      </div>

      {showBlocks && blockSize && eligibleSpend !== undefined && (
        <div className="text-[11px] text-muted-foreground">
          {Math.floor(eligibleSpend / blockSize)} ×{" "}
          <CurrencyAmount value={blockSize} currency={currency} decimals={0} /> blocks
        </div>
      )}

      {card.subcategoriesEnabled && subcategoryBreakdowns.length > 0 && (
        <SubcategoryBreakdownCompact
          breakdowns={displayedSubcategoryBreakdowns}
          cardType={card.type}
          currency={currency || "$"}
          flagNames={flagNames}
          isExpanded={isSubcategoryExpanded}
          onToggleExpanded={onToggleSubcategories}
          compactSubtitles
        />
      )}

      {allowHideCard && maximumSpendExceeded && onHideCard && (
        <div className="mt-auto pt-1">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onHideCard(card.id, period.end);
            }}
          >
            Hide until next cycle
          </Button>
        </div>
      )}
    </div>
  );
}

interface CardSummaryCompactProps {
  card: CreditCard;
  pat?: string;
  prefetchedTransactions?: Transaction[];
  onHideCard?: (cardId: string, hiddenUntil: string) => void;
  isRefreshing?: boolean;
  referenceDate?: Date;
  allowHideCard?: boolean;
}

export function CardSummaryCompact({
  card,
  pat,
  prefetchedTransactions,
  onHideCard,
  isRefreshing,
  referenceDate,
  allowHideCard = true,
}: CardSummaryCompactProps) {
  const { settings, updateSettings } = useSettings();
  const { selectedBudget } = useSelectedBudget();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const period = useMemo(
    () => SimpleRewardsCalculator.calculatePeriod(card, referenceDate),
    [card, referenceDate]
  );
  const asOfDate = useMemo(
    () => formatDateValue(referenceDate ?? new Date()),
    [referenceDate]
  );
  const calculationPeriod = useMemo(
    () => ({
      ...period,
      end: period.end < asOfDate ? period.end : asOfDate,
    }),
    [asOfDate, period]
  );
  const flagNames = useMemo(() => storage.getFlagNames(), []);

  const loadTransactions = useCallback(async () => {
    if (prefetchedTransactions) {
      setTransactions(
        filterTransactionsForCardPeriod(
          card,
          prefetchedTransactions,
          calculationPeriod,
        ),
      );
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
        since_date: calculationPeriod.start,
        signal: controller.signal,
      });
      const cardTxns = allTxns.filter(
        (txn: Transaction) =>
          txn.account_id === card.ynabAccountId &&
          txn.date >= calculationPeriod.start &&
          txn.date <= calculationPeriod.end
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
  }, [prefetchedTransactions, pat, card.ynabAccountId, calculationPeriod, selectedBudget.id]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  const metrics = useMemo<PrefetchedCardMetrics>(() => {
    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      transactions,
      calculationPeriod,
      settings || undefined
    );

    const end = new Date(period.end);
    const diff = end.getTime() - (referenceDate ?? new Date()).getTime();
    const daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));

    return {
      calculation,
      calculationPeriod,
      daysRemaining,
      period,
      transactions,
    };
  }, [calculationPeriod, card, period, referenceDate, settings, transactions]);

  const summaryViewExpansionSetting = settings?.summaryViewSubcategoriesExpanded;

  const handleToggleSubcategories = useCallback(() => {
    const currentSetting = summaryViewExpansionSetting;
    const currentValue = isExpansionMap(currentSetting)
      ? currentSetting[card.id] ?? false
      : Boolean(currentSetting);

    const nextValue = !currentValue;
    const nextSetting: SummaryViewSubcategoriesPreference = isExpansionMap(currentSetting)
      ? { ...currentSetting, [card.id]: nextValue }
      : { [card.id]: nextValue };

    updateSettings({
      summaryViewSubcategoriesExpanded: nextSetting,
    });
  }, [summaryViewExpansionSetting, card.id, updateSettings]);

  const isSubcategoryExpanded = isExpansionMap(summaryViewExpansionSetting)
    ? summaryViewExpansionSetting[card.id] ?? false
    : Boolean(summaryViewExpansionSetting);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 opacity-60">
        <div className="h-3 w-24 rounded bg-muted/40" />
        <div className="h-2 rounded bg-muted/30" />
        <div className="h-3 w-32 rounded bg-muted/40" />
      </div>
    );
  }

  return (
    <CardSummaryCompactContent
      card={card}
      flagNames={flagNames}
      isRefreshing={isRefreshing}
      isSubcategoryExpanded={isSubcategoryExpanded}
      metrics={metrics}
      onHideCard={onHideCard}
      onToggleSubcategories={handleToggleSubcategories}
      settings={settings}
      allowHideCard={allowHideCard}
    />
  );
}
