"use client";

import { AlertCircle, Loader2 } from "lucide-react";

import type { Transaction } from "@/types/transaction";
import { CurrencyAmount } from "@/components/CurrencyAmount";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn, absFromMilli as absFromMilliFn } from "@/lib/utils";

interface RecentTransactionsTableProps {
  loading: boolean;
  error: string;
  transactions: Transaction[];
  accountsMap: Map<string, string>;
  lookbackDays: number;
  refreshing?: boolean;
  lastUpdatedAt?: string | null;
}

export function RecentTransactionsTable({ loading, error, transactions, accountsMap, lookbackDays, refreshing, lastUpdatedAt }: RecentTransactionsTableProps) {
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

  const formattedTime = lastUpdatedAt ? (() => {
    try {
      const date = new Date(lastUpdatedAt);
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  })() : null;

  return (
    <div className="space-y-3">
      {refreshing && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 py-2 px-4 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Refreshing…</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full" role="table" aria-label={`Recent transactions (Last ${lookbackDays} Days)`}>
        <thead>
          <tr className="border-b" role="row">
            <th className="text-left p-2 font-medium" scope="col">
              Date
            </th>
            <th className="text-left p-2 font-medium" scope="col">
              Account
            </th>
            <th className="text-left p-2 font-medium" scope="col">
              Payee
            </th>
            <th className="text-left p-2 font-medium" scope="col">
              Category
            </th>
            <th className="text-right p-2 font-medium" scope="col">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((txn, index) => (
            <tr
              key={txn.id}
              className={cn("border-b", index % 2 === 0 ? "bg-transparent" : "bg-muted/30")}
              role="row"
            >
              <td className="p-2 text-sm">{new Date(txn.date).toLocaleDateString()}</td>
              <td className="p-2 text-sm font-medium">{accountsMap.get(txn.account_id) || "Unknown"}</td>
              <td className="p-2 text-sm">{txn.payee_name}</td>
              <td className="p-2 text-sm">{txn.category_name || "Uncategorised"}</td>
              <td className="p-2 text-sm text-right font-mono">
                <CurrencyAmount value={absFromMilliFn(txn.amount)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

      {formattedTime && (
        <p className="text-xs text-muted-foreground text-center">Updated {formattedTime}</p>
      )}
    </div>
  );
}
