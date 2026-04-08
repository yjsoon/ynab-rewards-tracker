"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
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
  const showActualSpend = hasBlockRounding && totalSpend - displayedSpend >= 0.01;
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
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {showActualSpend ? "Reward spend" : "Spent"}
        </span>
        <span className="text-right">
          <span className="text-base font-semibold">
            <CurrencyAmount value={displayedSpend} currency={currency} />
          </span>
          {showActualSpend && (
            <span className="block text-[11px] text-muted-foreground">
              Actual: <CurrencyAmount value={totalSpend} currency={currency} />
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-2">
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

      {card.promotionalPeriod && (
        <div className="rounded-lg border border-purple-200 bg-purple-50/50 px-3 py-2 dark:border-purple-800/50 dark:bg-purple-950/20">
          <div className="flex items-center gap-2 text-xs font-medium text-purple-900 dark:text-purple-100">
            <Sparkles className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            <span>
              {card.promotionalPeriod.startDate
                ? `${card.promotionalPeriod.startDate} to ${card.promotionalPeriod.endDate}`
                : `Until ${card.promotionalPeriod.endDate}`}
            </span>
          </div>
          {card.promotionalPeriod.description && (
            <div className="mt-1 text-xs text-purple-600/80 dark:text-purple-400/80">
              {card.promotionalPeriod.description}
            </div>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {daysRemaining} {daysRemaining === 1 ? "day" : "days"} left in cycle
          </span>
        </div>

        {allowHideCard && maximumSpendExceeded && onHideCard && (
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
