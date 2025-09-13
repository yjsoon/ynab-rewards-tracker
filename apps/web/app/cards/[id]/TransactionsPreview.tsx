'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from 'lucide-react';
import { YnabClient } from '@/lib/ynab-client';
import { storage } from '@/lib/storage';
import { useYnabPAT, useTagMappings } from '@/hooks/useLocalStorage';
import type { Transaction, TransactionWithRewards } from '@/types/transaction';
import { TransactionMatcher } from '@/lib/rewards-engine';

interface Props {
  cardId: string;
  ynabAccountId: string;
}

const LOOKBACK_DAYS = 90;

export default function TransactionsPreview({ cardId, ynabAccountId }: Props) {
  const { pat } = useYnabPAT();
  const { mappings } = useTagMappings(cardId);
  const [transactions, setTransactions] = useState<TransactionWithRewards[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!pat) return;
    const budget = storage.getSelectedBudget();
    if (!budget.id) return;

    setLoading(true);
    setError('');
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const client = new YnabClient(pat);
      const since = new Date();
      since.setDate(since.getDate() - LOOKBACK_DAYS);
      const all = await client.getTransactions(budget.id, {
        since_date: since.toISOString().split('T')[0],
        signal: controller.signal,
      });
      const cardTxns = all.filter((t: Transaction) => t.account_id === ynabAccountId);
      const enriched = TransactionMatcher.applyTagMappings(cardTxns, mappings);
      enriched.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(enriched);
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  }, [pat, ynabAccountId, mappings]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const budgetId = storage.getSelectedBudget().id;
  const needSetup = !pat || !budgetId;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>View and categorise your card transactions</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>Refresh</Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/cards/${cardId}/transactions`}>Open Full View</Link>
            </Button>
          </div>
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
          <div className="text-center py-12 text-red-500">Failed to load transactions: {error}</div>
        ) : transactions.filter(t => t.amount < 0).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-3" />
            <p>No spending transactions found in the last {LOOKBACK_DAYS} days.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions
              .filter(t => t.amount < 0)
              .slice(0, 25)
              .map(txn => (
                <div key={txn.id} className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{txn.payee_name}</span>
                      {txn.flag_color && (
                        <Badge variant="outline" className="text-xs">{txn.flag_name || txn.flag_color}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{new Date(txn.date).toLocaleDateString()}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      YNAB: {txn.category_name || 'Uncategorised'} • Reward: {txn.rewardCategory || 'None'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono">${Math.abs(txn.amount/1000).toFixed(2)}</div>
                    {txn.rewardCategory && <Badge variant="secondary" className="mt-1">Eligible</Badge>}
                  </div>
                </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

