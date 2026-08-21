'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { formatDateValue } from '@/lib/dashboard-period';
import type { YnabFlagColor } from '@/lib/ynab-constants';
import { SimpleRewardsCalculator } from '@/lib/rewards-engine';
import { resolveCardSpendingTier } from '@ynab-counter/app-core/rewards-engine';
import { YnabClient } from '@/lib/ynab-client';
import { storage } from '@/lib/storage';
import {
  filterTransactionsForCardPeriod,
  getActiveMonthlyQualification,
} from '@/lib/card-metrics';
import { useSelectedBudget, useSettings } from '@/hooks/useLocalStorage';
import { cn } from '@/lib/utils';
import { CurrencyAmount } from '@/components/CurrencyAmount';
import { SpendingProgressBar } from '@/components/SpendingProgressBar';
import { SubcategoryBreakdownCompact } from '@/components/SubcategoryBreakdownCompact';
import { RefreshBadge } from '@/components/RefreshBadge';
import { Button } from '@/components/ui/button';
import { AlertCircle, TrendingUp, Percent, XCircle } from 'lucide-react';
import {
  isMinimumSpendConfigured,
  hasMinimumSpendRequirement
} from '@/lib/minimum-spend-helpers';
import type { AppSettings, CreditCard } from '@/lib/storage';
import type { Transaction } from '@/types/transaction';
import type { PrefetchedCardMetrics } from '@/lib/card-metrics';

interface CardSpendingSummaryContentProps {
  card: CreditCard;
  flagNames: Partial<Record<YnabFlagColor, string>>;
  isRefreshing?: boolean;
  metrics: PrefetchedCardMetrics;
  onHideCard?: (cardId: string, hiddenUntil: string) => void;
  showHideOption?: boolean;
  settings?: AppSettings;
  allowHideCard?: boolean;
}

export function CardSpendingSummaryContent({
  card,
  flagNames,
  isRefreshing,
  metrics,
  onHideCard,
  showHideOption,
  settings,
  allowHideCard = true,
}: CardSpendingSummaryContentProps) {
  const { calculation, calculationPeriod, daysRemaining, period } = metrics;
  const {
    totalSpend,
    countedSpend,
    eligibleSpend,
    eligibleSpendBeforeBlocks,
    rewardEarned,
    rewardEarnedDollars,
    minimumSpend,
    minimumSpendMet,
    monthlyMinimumSpend,
    qualificationStatus,
    monthlyQualifications = [],
    maximumSpend,
    maximumSpendExceeded,
    subcategoryBreakdowns = [],
  } = calculation;
  const resolvedSpendingTier = resolveCardSpendingTier(card, totalSpend);
  const effectiveCard = resolvedSpendingTier.effectiveCard;
  const activeSpendingLevel = resolvedSpendingTier.activeLevel;
  const nextSpendingLevel = resolvedSpendingTier.hasNextSpendingTier
    ? resolvedSpendingTier.nextLevel
    : null;
  const hasUnlockedSpendingTier = (activeSpendingLevel?.spendThreshold ?? 0) > 0;
  const terminalMaximumSpendExceeded = maximumSpendExceeded && !nextSpendingLevel;
  const intermediateMaximumSpendExceeded = maximumSpendExceeded && Boolean(nextSpendingLevel);
  const currency = settings?.currency;
  const milesValuation = settings?.milesValuation ?? 0.01;
  const hasMinimum = hasMinimumSpendRequirement(minimumSpend);
  const qualificationBlocked = Boolean(
    card.rewardPeriod && card.rewardPeriod.monthlyMinimumSpend > 0 && qualificationStatus !== 'met'
  );
  const calculationAsOf = calculationPeriod.asOf ?? calculationPeriod.end;
  const activeQualificationMonth = getActiveMonthlyQualification(
    monthlyQualifications,
    calculationAsOf,
  )
    ?? monthlyQualifications.find((month) => month.status === 'pending');
  const hasMonthlyMinimum = (monthlyMinimumSpend ?? 0) > 0;
  const allMonthlyMinimumsMet = Boolean(
    card.rewardPeriod &&
    monthlyQualifications.length === card.rewardPeriod.monthCount &&
    monthlyQualifications.every((month) => month.status === 'met'),
  );
  const hasMaximum = typeof maximumSpend === 'number' && maximumSpend > 0;
  const hasBlockRounding = Boolean(
    (typeof card.earningBlockSize === 'number' && card.earningBlockSize > 0) ||
      (card.subcategoriesEnabled &&
        card.subcategories?.some(
          (subcategory) =>
            typeof subcategory.milesBlockSize === 'number' && subcategory.milesBlockSize > 0
        ))
  );
  const displayedSpend = hasBlockRounding ? countedSpend : totalSpend;
  const rewardTileState = terminalMaximumSpendExceeded
    ? 'exceeded'
    : intermediateMaximumSpendExceeded
      ? 'warn'
    : (qualificationBlocked || (!minimumSpendMet && hasMinimum) ? 'warn' : (minimumSpendMet ? 'success' : 'neutral'));

  const rewardTileClasses = {
    success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
    warn: 'bg-amber-300/20 text-amber-600 dark:text-amber-200',
    exceeded: 'bg-red-500/15 text-red-600 dark:text-red-300',
    neutral: 'bg-muted/10 text-muted-foreground',
  }[rewardTileState];

  const rewardValue = qualificationBlocked || (!minimumSpendMet && hasMinimum)
    ? 'No reward'
    : card.type === 'cashback'
      ? <CurrencyAmount value={rewardEarned} currency={currency} />
      : `${Math.round(rewardEarned).toLocaleString()}`;

  const rewardLabel = terminalMaximumSpendExceeded
    ? 'Capped at max'
    : intermediateMaximumSpendExceeded
      ? 'Current level capped'
    : qualificationBlocked
      ? qualificationStatus === 'failed' ? 'Qualification failed' : 'Qualification pending'
    : !minimumSpendMet && hasMinimum
      ? 'Minimum not met'
      : card.type === 'cashback'
        ? 'Cashback'
        : 'Miles';

  const unearnedAmount = Math.max(
    0,
    (eligibleSpendBeforeBlocks ?? eligibleSpend ?? 0) - (eligibleSpend ?? 0)
  );
  const displayedSubcategoryBreakdowns = hasBlockRounding
    ? subcategoryBreakdowns.map((entry) => ({ ...entry, totalSpend: entry.countedSpend }))
    : subcategoryBreakdowns;
  const showActualSpend = hasBlockRounding && totalSpend - displayedSpend >= 0.01;

  const daysSeverityClass = daysRemaining <= 1
    ? 'text-rose-500 dark:text-rose-300'
    : daysRemaining <= 3
      ? 'text-orange-500 dark:text-orange-300'
      : daysRemaining <= 7
        ? 'text-amber-500 dark:text-amber-300'
        : 'text-muted-foreground';

  return (
    <div className="relative flex h-full flex-col gap-4">
      <RefreshBadge isRefreshing={isRefreshing} />
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/10 p-3 text-left">
          <p className="text-2xl font-semibold tracking-tight">
            <CurrencyAmount value={displayedSpend} currency={currency} />
          </p>
          <p className="text-xs uppercase text-muted-foreground">
            {showActualSpend ? 'Reward spend this period' : 'Spent this period'}
          </p>
          {showActualSpend && (
            <p className="text-[11px] text-muted-foreground">
              Actual: <CurrencyAmount value={totalSpend} currency={currency} />
            </p>
          )}
        </div>
        <div className={`flex min-h-[68px] flex-col justify-center rounded-lg p-3 text-left transition-colors ${rewardTileClasses}`}>
          <p className={`text-xl font-semibold leading-tight tracking-tight ${rewardTileState === 'neutral' ? 'text-foreground' : ''} sm:text-2xl`}>
            {rewardValue}
          </p>
          <p className="text-[11px] uppercase opacity-90 sm:text-xs">{rewardLabel}</p>
        </div>
      </div>

      {card.rewardPeriod && hasMonthlyMinimum && activeQualificationMonth && (
        <div className={cn(
          'rounded-md border px-3 py-2 text-center text-xs font-medium',
          qualificationStatus === 'failed'
            ? 'border-red-200 bg-red-50/50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
            : qualificationStatus === 'met'
              ? 'border-emerald-200 bg-emerald-50/50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border-amber-200 bg-amber-50/50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
        )}>
          {qualificationStatus === 'failed'
            ? 'A completed month missed its card-wide minimum'
            : qualificationStatus === 'met'
              ? allMonthlyMinimumsMet
                ? `All ${card.rewardPeriod.monthCount} monthly minimums met`
                : <>
                    Current anchored month: <CurrencyAmount value={activeQualificationMonth.spend} currency={currency} /> of{' '}
                    <CurrencyAmount value={monthlyMinimumSpend ?? 0} currency={currency} /> · met
                  </>
              : <>
                  Current anchored month: <CurrencyAmount value={activeQualificationMonth.spend} currency={currency} /> of{' '}
                  <CurrencyAmount value={monthlyMinimumSpend ?? 0} currency={currency} />
                </>}
        </div>
      )}

      {(card.rewardPeriod || isMinimumSpendConfigured(minimumSpend) || hasMaximum || card.spendingTiers?.length) ? (
        <div className="space-y-3">
          {card.spendingTiers?.length ? (
            <div className="space-y-1.5">
              <div className={cn(
                'rounded-md border px-3 py-2 text-center text-xs font-medium',
                hasUnlockedSpendingTier
                  ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300'
                  : 'border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300',
              )}>
                {nextSpendingLevel ? (
                  <>
                    <CurrencyAmount
                      value={Math.max(0, nextSpendingLevel.spendThreshold - totalSpend)}
                      currency={currency}
                    />{' '}
                    to go to <CurrencyAmount value={nextSpendingLevel.spendThreshold} currency={currency} />
                  </>
                ) : (
                  'Highest tier active'
                )}
              </div>
              {intermediateMaximumSpendExceeded ? (
                <p className="text-center text-[11px] text-amber-700 dark:text-amber-300">
                  Current level capped. Further spend only earns if the next tier unlocks.
                </p>
              ) : null}
            </div>
          ) : null}
          {!nextSpendingLevel && (isMinimumSpendConfigured(minimumSpend) || hasMaximum) ? (
            <SpendingProgressBar
              totalSpend={totalSpend}
              minimumSpend={minimumSpend}
              maximumSpend={maximumSpend}
              minimumProgressSpend={totalSpend}
              maximumProgressSpend={displayedSpend}
              currency={currency}
              showLabels={true}
              showWarnings={true}
              className=""
            />
          ) : null}
          {terminalMaximumSpendExceeded && (
            <div className="flex items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50/50 py-1.5 text-xs font-medium text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
              <XCircle className="h-3.5 w-3.5" />
              <span>Stop using - max reached</span>
            </div>
          )}
          {allowHideCard && terminalMaximumSpendExceeded && showHideOption && onHideCard && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const [year, month, day] = period.end.split('-').map(Number);
                onHideCard(card.id, formatDateValue(new Date(year, month - 1, day + 1)));
              }}
            >
              Hide until next cycle
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="h-4 w-4" />
            No spending limits configured
          </div>
          <p className="mt-1 text-xs">
            Set minimum/maximum spend in card settings to track limits and bonuses
          </p>
        </div>
      )}

      {card.subcategoriesEnabled && subcategoryBreakdowns.length > 0 && (
        <SubcategoryBreakdownCompact
          breakdowns={displayedSubcategoryBreakdowns}
          cardType={card.type}
          currency={currency || '$'}
          flagNames={flagNames}
        />
      )}

      <div className="mt-auto space-y-2 pt-1 text-center">
        <div className="flex items-center justify-center gap-2">
          {effectiveCard.earningRate ? (
            <>
              {card.type === 'cashback' ? (
                <>
                  <Percent className="h-3 w-3 text-muted-foreground" />
                  <p className="text-sm font-medium">{effectiveCard.earningRate}% cashback</p>
                </>
              ) : (
                <>
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {effectiveCard.earningRate} miles per dollar
                  </p>
                </>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No earning rate configured</p>
          )}
        </div>
        {card.type === 'miles' && rewardEarnedDollars > 0 && (
          <p className="text-xs text-muted-foreground">
            Value: <CurrencyAmount value={rewardEarnedDollars} currency={currency} /> @{' '}
            <CurrencyAmount value={milesValuation} currency={currency} />/mile
          </p>
        )}
        {card.earningBlockSize && card.earningBlockSize > 0 && eligibleSpend !== undefined && eligibleSpend > 0 && (
          <div className="rounded bg-muted/50 p-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Earning blocks:</span>
              <span className="font-medium">
                {Math.floor(eligibleSpend / card.earningBlockSize)} ×{' '}
                <CurrencyAmount value={card.earningBlockSize} currency={currency} />
              </span>
            </div>
            {unearnedAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unearned:</span>
                <span>
                  <CurrencyAmount value={unearnedAmount} currency={currency} />
                </span>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-between px-1 pr-12 text-xs">
          <span className="text-muted-foreground">
            {new Date(period.start).toLocaleDateString()} - {new Date(period.end).toLocaleDateString()}
          </span>
          <span className={cn('font-medium', daysSeverityClass)}>
            {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left
          </span>
        </div>
      </div>
    </div>
  );
}

interface CardSpendingSummaryProps {
  card: CreditCard;
  pat?: string;
  prefetchedTransactions?: Transaction[];
  onHideCard?: (cardId: string, hiddenUntil: string) => void;
  showHideOption?: boolean;
  isRefreshing?: boolean;
  referenceDate?: Date;
  allowHideCard?: boolean;
}

export function CardSpendingSummary({
  card,
  pat,
  prefetchedTransactions,
  onHideCard,
  showHideOption,
  isRefreshing,
  referenceDate,
  allowHideCard = true,
}: CardSpendingSummaryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const { settings } = useSettings();
  const { selectedBudget } = useSelectedBudget();
  const flagNames = useMemo(() => storage.getFlagNames(), []);

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
      asOf: asOfDate,
    }),
    [asOfDate, period]
  );

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

    const budgetId = selectedBudget.id;
    if (!budgetId) {
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
      const allTxns = await client.getTransactions(budgetId, {
        since_date: calculationPeriod.start,
        signal: controller.signal,
      });
      const cardTxns = allTxns.filter((transaction: Transaction) =>
        transaction.account_id === card.ynabAccountId &&
          transaction.date >= calculationPeriod.start &&
          transaction.date <= calculationPeriod.end
      );
      setTransactions(cardTxns);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') {
        console.error('Failed to load transactions:', error);
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

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
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

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-muted/5 p-3">
          <div className="opacity-60">
            <div className="mx-auto mb-1 h-6 w-20 rounded bg-muted"></div>
            <div className="mx-auto h-3 w-24 rounded bg-muted"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CardSpendingSummaryContent
      card={card}
      flagNames={flagNames}
      isRefreshing={isRefreshing}
      metrics={metrics}
      onHideCard={onHideCard}
      showHideOption={showHideOption}
      settings={settings}
      allowHideCard={allowHideCard}
    />
  );
}
