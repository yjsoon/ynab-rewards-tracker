"use client";

import { useState, useMemo, useCallback } from "react";
import { AlertCircle, Loader2, ChevronDown, ChevronUp, Search, ArrowUpDown } from "lucide-react";
import type { Transaction } from "@/types/transaction";
import type { CreditCard, AppSettings } from "@/lib/storage";
import { CurrencyAmount } from "@/components/CurrencyAmount";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlagColorPicker } from "./FlagColorPicker";
import { cn, absFromMilli as absFromMilliFn } from "@/lib/utils";
import { SimpleRewardsCalculator } from "@/lib/rewards-engine";
import type { YnabFlagColor } from "@/lib/ynab-constants";

interface EnhancedTransactionsTableProps {
  loading: boolean;
  error: string;
  transactions: Transaction[];
  accountsMap: Map<string, string>;
  cards: CreditCard[];
  settings: AppSettings;
  lookbackDays: number;
  refreshing?: boolean;
  lastUpdatedAt?: string | null;
  customFlagNames?: Partial<Record<YnabFlagColor, string>>;
  selectedBudgetId?: string;
  pat?: string;
  onTransactionUpdated?: () => void;
}

type SortField = "date" | "amount" | "payee" | "account" | "reward";
type SortDirection = "asc" | "desc";

interface TransactionWithComputedReward extends Transaction {
  blockInfo?: string;
  calculatedReward: number;
  card?: CreditCard;
  isIncoming: boolean;
}

export function EnhancedTransactionsTable({
  loading,
  error,
  transactions,
  accountsMap,
  cards,
  settings,
  lookbackDays,
  refreshing,
  lastUpdatedAt,
  customFlagNames,
  selectedBudgetId,
  pat,
  onTransactionUpdated,
}: EnhancedTransactionsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [savingTransaction, setSavingTransaction] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Build card lookup map for reward calculation
  const cardsByAccountId = useMemo(() => {
    const map = new Map<string, CreditCard>();
    cards.forEach((card) => {
      if (card.ynabAccountId) {
        map.set(card.ynabAccountId, card);
      }
    });
    return map;
  }, [cards]);

  // Build subcategory mappings lookup: cardId -> (flagColor -> subcategoryName)
  const subcategoryMappingsByCard = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    cards.forEach((card) => {
      if (card.subcategoriesEnabled && card.subcategories && card.subcategories.length > 0) {
        const flagMap = new Map<string, string>();
        card.subcategories.forEach((subcat) => {
          flagMap.set(subcat.flagColor, subcat.name);
        });
        map.set(card.id, flagMap);
      }
    });
    return map;
  }, [cards]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (txn) =>
          txn.payee_name?.toLowerCase().includes(query) ||
          txn.category_name?.toLowerCase().includes(query) ||
          txn.memo?.toLowerCase().includes(query)
      );
    }

    // Account filter
    if (selectedAccountFilter !== "all") {
      filtered = filtered.filter((txn) => txn.account_id === selectedAccountFilter);
    }

    return filtered;
  }, [transactions, searchQuery, selectedAccountFilter]);

  // Calculate rewards and sort transactions
  const sortedTransactions = useMemo(() => {
    const withRewards: TransactionWithComputedReward[] = filteredTransactions.map((txn) => {
      const card = cardsByAccountId.get(txn.account_id);
      const amount = absFromMilliFn(txn.amount);
      const isIncoming = txn.amount > 0;
      const rewardResult = !isIncoming && card
        ? SimpleRewardsCalculator.calculateTransactionReward(amount, card, settings, {
            flagColor: txn.flag_color,
          })
        : { reward: 0, blockInfo: undefined };

      return {
        ...txn,
        blockInfo: rewardResult.blockInfo,
        calculatedReward: rewardResult.reward,
        card,
        isIncoming,
      };
    });

    withRewards.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "date":
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case "amount":
          comparison = Math.abs(a.amount) - Math.abs(b.amount);
          break;
        case "payee":
          comparison = (a.payee_name || "").localeCompare(b.payee_name || "");
          break;
        case "account":
          comparison = (accountsMap.get(a.account_id) || "").localeCompare(
            accountsMap.get(b.account_id) || ""
          );
          break;
        case "reward":
          comparison = a.calculatedReward - b.calculatedReward;
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return withRewards;
  }, [filteredTransactions, sortField, sortDirection, accountsMap, cardsByAccountId, settings]);

  // Toggle row expansion
  const toggleRow = useCallback((transactionId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(transactionId)) {
        next.delete(transactionId);
      } else {
        next.add(transactionId);
      }
      return next;
    });
  }, []);

  // Update transaction flag (auto-save)
  const updateTransactionFlag = useCallback(
    async (transactionId: string, newFlagColor: YnabFlagColor | null) => {
      if (!selectedBudgetId || !pat) {
        console.error("Cannot save: Missing budget or PAT");
        return;
      }

      setSavingTransaction(transactionId);
      setUpdateError(""); // Clear any previous errors

      try {
        const response = await fetch(`/api/ynab/budgets/${selectedBudgetId}/transactions/${transactionId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${pat}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transaction: {
              flag_color: newFlagColor || null,
            },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to update transaction");
        }

        // Trigger parent refresh to fetch updated data
        onTransactionUpdated?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setUpdateError(`Failed to update transaction: ${message}`);
      } finally {
        setSavingTransaction(null);
      }
    },
    [selectedBudgetId, pat, onTransactionUpdated]
  );

  // Toggle sort
  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDirection((dir) => (dir === "asc" ? "desc" : "asc"));
        return prev;
      } else {
        setSortDirection("desc");
        return field;
      }
    });
  }, []);
  const uniqueAccounts = useMemo(
    () => Array.from(new Set(transactions.map((transaction) => transaction.account_id))),
    [transactions]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="ml-2">Loading transactions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (transactions.length === 0) {
    return <p className="text-center py-8 text-muted-foreground">No recent transactions found.</p>;
  }

  const formattedTime = lastUpdatedAt
    ? (() => {
        try {
          const date = new Date(lastUpdatedAt);
          return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <div className="space-y-4">
      {/* Filters and Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by payee, category, or memo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Account Filter */}
        <div className="w-full sm:w-64">
          <Select value={selectedAccountFilter} onValueChange={setSelectedAccountFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {uniqueAccounts.map((accountId) => (
                <SelectItem key={accountId} value={accountId}>
                  {accountsMap.get(accountId) || "Unknown"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Refreshing indicator */}
      {refreshing && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 py-2 px-4 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Refreshing…</span>
        </div>
      )}

      {/* Update error alert */}
      {updateError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{updateError}</AlertDescription>
        </Alert>
      )}

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing {sortedTransactions.length} of {transactions.length} transactions
      </div>

      {/* Transactions Table */}
      <div className="overflow-x-auto">
        <table className="w-full" role="table" aria-label={`Recent transactions (Last ${lookbackDays} Days)`}>
          <thead>
            <tr className="border-b" role="row">
              <th className="w-10"></th>
              <th
                className="text-left p-2 font-medium cursor-pointer hover:bg-muted/50"
                onClick={() => toggleSort("date")}
              >
                <div className="flex items-center gap-1">
                  Date
                  {sortField === "date" && <ArrowUpDown className="h-3 w-3" />}
                </div>
              </th>
              <th
                className="text-left p-2 font-medium cursor-pointer hover:bg-muted/50"
                onClick={() => toggleSort("account")}
              >
                <div className="flex items-center gap-1">
                  Account
                  {sortField === "account" && <ArrowUpDown className="h-3 w-3" />}
                </div>
              </th>
              <th
                className="text-left p-2 font-medium cursor-pointer hover:bg-muted/50"
                onClick={() => toggleSort("payee")}
              >
                <div className="flex items-center gap-1">
                  Payee
                  {sortField === "payee" && <ArrowUpDown className="h-3 w-3" />}
                </div>
              </th>
              <th className="text-left p-2 font-medium">Flag</th>
              <th className="text-left p-2 font-medium">Category</th>
              <th
                className="text-right p-2 font-medium cursor-pointer hover:bg-muted/50"
                onClick={() => toggleSort("amount")}
              >
                <div className="flex items-center justify-end gap-1">
                  Amount
                  {sortField === "amount" && <ArrowUpDown className="h-3 w-3" />}
                </div>
              </th>
              <th
                className="text-right p-2 font-medium cursor-pointer hover:bg-muted/50"
                onClick={() => toggleSort("reward")}
              >
                <div className="flex items-center justify-end gap-1">
                  Reward
                  {sortField === "reward" && <ArrowUpDown className="h-3 w-3" />}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedTransactions.map((txn, index) => {
              const isExpanded = expandedRows.has(txn.id);
              const isSaving = savingTransaction === txn.id;
              const amount = absFromMilliFn(txn.amount);
              const { blockInfo, calculatedReward: reward, card, isIncoming } = txn;

              return (
                <>
                  {/* Main Row */}
                  <tr
                    key={txn.id}
                    className={cn(
                      "border-b transition-colors",
                      index % 2 === 0 ? "bg-transparent" : "bg-muted/30",
                      isExpanded && "bg-muted/50"
                    )}
                    role="row"
                  >
                    <td className="p-2">
                      <button
                        onClick={() => toggleRow(txn.id)}
                        className="hover:bg-muted p-1 rounded"
                        aria-label={isExpanded ? "Collapse row" : "Expand row"}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="p-2 text-sm">{new Date(txn.date).toLocaleDateString()}</td>
                    <td className="p-2 text-sm font-medium">
                      {accountsMap.get(txn.account_id) || "Unknown"}
                    </td>
                    <td className="p-2 text-sm">{txn.payee_name}</td>
                    <td className="p-2">
                      {isIncoming ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        <FlagColorPicker
                          value={txn.flag_color as YnabFlagColor}
                          onChange={(newColor) => updateTransactionFlag(txn.id, newColor)}
                          disabled={isSaving}
                          customNames={customFlagNames}
                          rewardCategories={card ? subcategoryMappingsByCard.get(card.id) : undefined}
                        />
                      )}
                    </td>
                    <td className="p-2 text-sm">{txn.category_name || "Uncategorised"}</td>
                    <td className="p-2 text-sm text-right font-mono">
                      <span className={cn(isIncoming && "text-green-600 dark:text-green-400")}>
                        {isIncoming && "+"}
                        <CurrencyAmount value={amount} currency={settings.currency} />
                      </span>
                    </td>
                    <td className="p-2 text-sm text-right">
                      {isIncoming ? (
                        <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 hover:bg-blue-100 dark:hover:bg-blue-900">
                          Incoming
                        </Badge>
                      ) : card ? (
                        reward > 0 ? (
                          <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 hover:bg-green-100 dark:hover:bg-green-900">
                            {card.type === "cashback" ? (
                              <CurrencyAmount value={reward} currency={settings.currency} showPlus />
                            ) : (
                              `+${Math.round(reward)} miles`
                            )}
                          </Badge>
                        ) : (
                          <Badge className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100 hover:bg-red-100 dark:hover:bg-red-900">
                            No reward
                          </Badge>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded Details Row */}
                  {isExpanded && (
                    <tr
                      className={cn(
                        "border-b",
                        index % 2 === 0 ? "bg-transparent" : "bg-muted/30"
                      )}
                    >
                      <td colSpan={8} className="p-4 bg-muted/20">
                        <div className="space-y-4">
                          {/* Transaction Details */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs font-medium text-muted-foreground">
                                Transaction ID
                              </Label>
                              <p className="text-sm font-mono">{txn.id}</p>
                            </div>

                            {txn.memo && (
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground">Memo</Label>
                                <p className="text-sm">{txn.memo}</p>
                              </div>
                            )}

                            {/* Only show reward info for spending transactions */}
                            {!isIncoming && card && blockInfo && (
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground">
                                  Reward Calculation
                                </Label>
                                <p className="text-sm">{blockInfo}</p>
                              </div>
                            )}

                            {!isIncoming && card && (
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground">
                                  Earning Rate
                                </Label>
                                <p className="text-sm">
                                  {card.type === "cashback"
                                    ? `${card.earningRate}% cashback`
                                    : card.earningBlockSize
                                    ? `${card.earningRate} miles per $${card.earningBlockSize}`
                                    : `${card.earningRate} miles per dollar`}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {formattedTime && (
        <p className="text-xs text-muted-foreground text-center">Updated {formattedTime}</p>
      )}
    </div>
  );
}
