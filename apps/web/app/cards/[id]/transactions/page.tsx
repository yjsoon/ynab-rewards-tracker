"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Calendar, Loader2, RefreshCw, X } from "lucide-react";

import { CurrencyAmount } from "@/components/CurrencyAmount";
import { EnhancedTransactionsTable } from "@/components/transactions/EnhancedTransactionsTable";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreditCards,
  useSelectedBudget,
  useSettings,
  useYnabPAT,
} from "@/hooks/useLocalStorage";
import { useCardTransactions } from "@/hooks/useCardTransactions";
import {
  filterCardSpendingTransactions,
  filterTransactionsForSubcategory,
} from "@/lib/card-metrics";
import { formatDateValue } from "@/lib/dashboard-period";
import { SimpleRewardsCalculator } from "@/lib/rewards-engine";
import { storage } from "@/lib/storage";

const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TRANSACTION_LOOKBACK_DAYS = 90;
const ALL_REWARD_CATEGORIES = "all-reward-categories";
const ALL_YNAB_CATEGORIES = "all-ynab-categories";
const UNCATEGORISED = "uncategorised";
const REWARD_CATEGORY_PREFIX = "reward:";
const YNAB_CATEGORY_PREFIX = "ynab:";

function parseDateValue(value: string | null): Date | undefined {
  if (!value || !DATE_VALUE_PATTERN.test(value)) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

function formatPeriodDate(value: string): string {
  const date = parseDateValue(value);
  return date
    ? date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : value;
}

function getPeriodDayCount(start: string, end: string): number {
  const startDate = parseDateValue(start);
  const endDate = parseDateValue(end);
  if (!startDate || !endDate) {
    return 31;
  }

  return Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );
}

export default function CardTransactionsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cardId = params.id as string;
  const isPeriodScope = searchParams.get("scope") === "period";
  const asOfValue = searchParams.get("asOf");
  const categoryId = searchParams.get("category");
  const hasYnabCategoryFilter = searchParams.has("ynabCategory");
  const ynabCategory = searchParams.get("ynabCategory");
  const fromDashboard = searchParams.get("from") === "dashboard";

  const { cards, isLoading: cardsLoading } = useCreditCards();
  const { settings } = useSettings();
  const { selectedBudget } = useSelectedBudget();
  const { pat } = useYnabPAT();
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState<string | null>(null);

  const card = useMemo(
    () => cards.find((candidate) => candidate.id === cardId) ?? null,
    [cardId, cards],
  );
  const referenceDate = useMemo(
    () => parseDateValue(asOfValue) ?? new Date(),
    [asOfValue],
  );
  const period = useMemo(
    () => card ? SimpleRewardsCalculator.calculatePeriod(card, referenceDate) : null,
    [card, referenceDate],
  );
  const calculationPeriod = useMemo(
    () => period
      ? {
          ...period,
          end: period.end < formatDateValue(referenceDate)
            ? period.end
            : formatDateValue(referenceDate),
        }
      : null,
    [period, referenceDate],
  );
  const activeSubcategories = useMemo(
    () => card?.subcategoriesEnabled
      ? [...(card.subcategories ?? [])]
          .filter((subcategory) => subcategory.active !== false)
          .sort((a, b) => a.priority - b.priority)
      : [],
    [card],
  );
  const selectedSubcategory = useMemo(
    () => categoryId
      ? activeSubcategories.find((subcategory) => subcategory.id === categoryId) ?? null
      : null,
    [activeSubcategories, categoryId],
  );

  useEffect(() => {
    if (!cardsLoading && cards.length > 0 && !card) {
      router.replace("/");
    }
  }, [card, cards.length, cardsLoading, router]);

  const {
    transactions,
    loading,
    error,
    refresh,
  } = useCardTransactions(card, {
    lookbackDays: TRANSACTION_LOOKBACK_DAYS,
    sinceDate: isPeriodScope ? period?.start : undefined,
  });

  const periodTransactions = useMemo(
    () => card
      ? filterCardSpendingTransactions(
          card,
          transactions,
          isPeriodScope && calculationPeriod ? calculationPeriod : undefined,
        )
      : [],
    [calculationPeriod, card, isPeriodScope, transactions],
  );
  const rewardCategoryTransactions = useMemo(
    () => card && selectedSubcategory
      ? filterTransactionsForSubcategory(
          card,
          periodTransactions,
          selectedSubcategory.id,
        )
      : periodTransactions,
    [card, periodTransactions, selectedSubcategory],
  );
  const displayedTransactions = useMemo(
    () => hasYnabCategoryFilter
      ? rewardCategoryTransactions.filter((transaction) => (
          ynabCategory
            ? transaction.category_name === ynabCategory
            : !transaction.category_name
        ))
      : rewardCategoryTransactions,
    [hasYnabCategoryFilter, rewardCategoryTransactions, ynabCategory],
  );
  const ynabCategoryNames = useMemo(() => {
    const names = new Set(
      periodTransactions.flatMap((transaction) => (
        transaction.category_name ? [transaction.category_name] : []
      )),
    );
    if (ynabCategory) {
      names.add(ynabCategory);
    }

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [periodTransactions, ynabCategory]);
  const hasUncategorisedTransactions = useMemo(
    () => periodTransactions.some((transaction) => !transaction.category_name)
      || (hasYnabCategoryFilter && !ynabCategory),
    [hasYnabCategoryFilter, periodTransactions, ynabCategory],
  );
  const totalSpent = useMemo(
    () => Math.abs(
      displayedTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    ) / 1000,
    [displayedTransactions],
  );
  const accountsMap = useMemo(
    () => new Map(card ? [[card.ynabAccountId, card.name]] : []),
    [card],
  );
  const customFlagNames = useMemo(() => storage.getFlagNames(), []);
  const handleTransactionUpdated = useCallback(async () => {
    setDashboardRefreshKey(Date.now().toString());
    await refresh();
  }, [refresh]);
  const currentQuery = searchParams.toString();
  const pendingQueryRef = useRef(currentQuery);
  const committedQueryRef = useRef(currentQuery);
  useEffect(() => {
    const previousCommittedQuery = committedQueryRef.current;
    committedQueryRef.current = currentQuery;

    // Do not let an intermediate navigation overwrite newer filter selections.
    if (
      pendingQueryRef.current === previousCommittedQuery
      || pendingQueryRef.current === currentQuery
    ) {
      pendingQueryRef.current = currentQuery;
    }
  }, [currentQuery]);
  const replaceQuery = useCallback((update: (params: URLSearchParams) => void) => {
    const pendingQuery = pendingQueryRef.current;
    const nextParams = new URLSearchParams(pendingQuery);
    update(nextParams);

    const query = nextParams.toString();
    if (query === pendingQuery) {
      return;
    }

    pendingQueryRef.current = query;
    router.replace(
      `/cards/${cardId}/transactions${query ? `?${query}` : ""}`,
      { scroll: false },
    );
  }, [cardId, router]);
  const updateFilter = useCallback((name: "category" | "ynabCategory", value: string | null) => {
    replaceQuery((nextParams) => {
      if (value === null) {
        nextParams.delete(name);
      } else {
        nextParams.set(name, value);
      }
    });
  }, [replaceQuery]);
  const handleRewardCategoryChange = useCallback((value: string) => {
    updateFilter(
      "category",
      value === ALL_REWARD_CATEGORIES
        ? null
        : value.slice(REWARD_CATEGORY_PREFIX.length),
    );
  }, [updateFilter]);
  const handleYnabCategoryChange = useCallback((value: string) => {
    updateFilter(
      "ynabCategory",
      value === ALL_YNAB_CATEGORIES
        ? null
        : value === UNCATEGORISED
          ? ""
          : value.slice(YNAB_CATEGORY_PREFIX.length),
    );
  }, [updateFilter]);
  const clearFilters = useCallback(() => {
    replaceQuery((nextParams) => {
      nextParams.delete("category");
      nextParams.delete("ynabCategory");
    });
  }, [replaceQuery]);

  useEffect(() => {
    if (card && categoryId !== null && !selectedSubcategory) {
      replaceQuery((nextParams) => {
        if (nextParams.get("category") === categoryId) {
          nextParams.delete("category");
        }
      });
    }
  }, [card, categoryId, replaceQuery, selectedSubcategory]);

  if (!card || !period || !calculationPeriod) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="text-center">
            <Calendar className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg text-muted-foreground">Loading transactions…</p>
          </div>
        </div>
      </div>
    );
  }

  const periodLabel = `${formatPeriodDate(period.start)} – ${formatPeriodDate(period.end)}`;
  const throughLabel = isPeriodScope && calculationPeriod.end < period.end
    ? formatPeriodDate(calculationPeriod.end)
    : null;
  const displayedDayCount = isPeriodScope
    ? getPeriodDayCount(period.start, period.end)
    : TRANSACTION_LOOKBACK_DAYS;
  const dashboardParams = new URLSearchParams();
  if (asOfValue) {
    dashboardParams.set("asOf", asOfValue);
  }
  if (dashboardRefreshKey) {
    dashboardParams.set("refresh", dashboardRefreshKey);
  }
  const backHref = fromDashboard
    ? `/${dashboardParams.size > 0 ? `?${dashboardParams.toString()}` : ""}`
    : `/cards/${cardId}`;
  const filterDescriptions = [
    selectedSubcategory ? `reward category: ${selectedSubcategory.name}` : null,
    hasYnabCategoryFilter
      ? `YNAB category: ${ynabCategory || "Uncategorised"}`
      : null,
  ].filter((description): description is string => Boolean(description));
  const filterDescription = filterDescriptions.join(" • ");
  const scopeDescription = filterDescription
    ? `Filtered by ${filterDescription}`
    : isPeriodScope
      ? "Spending in this billing period"
      : `Spending in the last ${TRANSACTION_LOOKBACK_DAYS} days`;
  const rewardCategoryValue = selectedSubcategory
    ? `${REWARD_CATEGORY_PREFIX}${selectedSubcategory.id}`
    : ALL_REWARD_CATEGORIES;
  const ynabCategoryValue = !hasYnabCategoryFilter
    ? ALL_YNAB_CATEGORIES
    : ynabCategory
      ? `${YNAB_CATEGORY_PREFIX}${ynabCategory}`
      : UNCATEGORISED;
  const tableScopeLabel = isPeriodScope
    ? `${card.name} transactions, ${periodLabel}`
    : `${card.name} transactions, last ${TRANSACTION_LOOKBACK_DAYS} days`;
  const tableLabel = `${tableScopeLabel}${
    filterDescription ? `, filtered by ${filterDescription}` : ""
  }`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {fromDashboard ? "Back to Dashboard" : "Back to Card"}
          </Link>
        </Button>
      </div>

      <div className="mb-6 space-y-2">
        <h1 className="text-3xl font-bold">{card.name} Transactions</h1>
        <p className="text-muted-foreground">
          {isPeriodScope ? `Billing period ${periodLabel}` : `Last ${TRANSACTION_LOOKBACK_DAYS} days`}
          {isPeriodScope && throughLabel ? ` • Through ${throughLabel}` : ""}
          {" • "}{displayedTransactions.length}{" "}
          {displayedTransactions.length === 1 ? "spending transaction" : "spending transactions"}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              <CurrencyAmount value={totalSpent} currency={settings.currency} />
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{displayedTransactions.length}</p>
            <p className="text-xs text-muted-foreground">{scopeDescription}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Transactions</CardTitle>
              <CardDescription>
                {isPeriodScope
                  ? `Spending transactions in this billing period${throughLabel ? ` through ${throughLabel}` : ""}`
                  : `Spending transactions from the last ${TRANSACTION_LOOKBACK_DAYS} days`}
                {filterDescription ? `. Filtered by ${filterDescription}` : ""}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-col gap-4 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:flex-wrap sm:items-end">
            {activeSubcategories.length > 0 && (
              <div className="w-full space-y-2 sm:w-64">
                <Label htmlFor="reward-category-filter">Reward category</Label>
                <Select
                  value={rewardCategoryValue}
                  onValueChange={handleRewardCategoryChange}
                >
                  <SelectTrigger id="reward-category-filter">
                    <SelectValue placeholder="All reward categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_REWARD_CATEGORIES}>
                      All reward categories
                    </SelectItem>
                    {activeSubcategories.map((subcategory) => (
                      <SelectItem
                        key={subcategory.id}
                        value={`${REWARD_CATEGORY_PREFIX}${subcategory.id}`}
                      >
                        {subcategory.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="w-full space-y-2 sm:w-64">
              <Label htmlFor="ynab-category-filter">YNAB category</Label>
              <Select
                value={ynabCategoryValue}
                onValueChange={handleYnabCategoryChange}
              >
                <SelectTrigger id="ynab-category-filter">
                  <SelectValue placeholder="All YNAB categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_YNAB_CATEGORIES}>
                    All YNAB categories
                  </SelectItem>
                  {hasUncategorisedTransactions && (
                    <SelectItem value={UNCATEGORISED}>Uncategorised</SelectItem>
                  )}
                  {ynabCategoryNames.map((categoryName) => (
                    <SelectItem
                      key={categoryName}
                      value={`${YNAB_CATEGORY_PREFIX}${categoryName}`}
                    >
                      {categoryName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filterDescriptions.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
              >
                <X className="mr-2 h-4 w-4" />
                Clear filters
              </Button>
            )}
          </div>

          {!loading && !error && displayedTransactions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Calendar className="mx-auto mb-3 h-8 w-8" />
              <p>
                {filterDescriptions.length > 0
                  ? "No transactions match these filters"
                  : "No spending transactions found"}
              </p>
              <p className="text-sm">
                {filterDescriptions.length > 0
                  ? "Try changing or clearing the filters above."
                  : isPeriodScope
                    ? "There are no spending transactions in this billing period."
                    : `There are no spending transactions in the last ${TRANSACTION_LOOKBACK_DAYS} days.`}
              </p>
            </div>
          ) : (
            <EnhancedTransactionsTable
              loading={loading && transactions.length === 0}
              error={error}
              transactions={displayedTransactions}
              accountsMap={accountsMap}
              cards={[card]}
              settings={settings}
              lookbackDays={displayedDayCount}
              refreshing={loading && transactions.length > 0}
              customFlagNames={customFlagNames}
              selectedBudgetId={selectedBudget.id}
              pat={pat}
              onTransactionUpdated={handleTransactionUpdated}
              showAccountFilter={false}
              tableLabel={tableLabel}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
