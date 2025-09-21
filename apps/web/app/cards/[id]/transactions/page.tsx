'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useYnabPAT, useCreditCards } from '@/hooks/useLocalStorage';
import { YnabClient } from '@/lib/ynab-client';
import { storage } from '@/lib/storage';
import { SimpleRewardsCalculator } from '@/lib/rewards-engine';
import type { Transaction } from '@/types/transaction';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  Calendar,
  AlertCircle,
  Loader2
} from 'lucide-react';
import type { TransactionWithRewards } from '@/types/transaction';
import type { CreditCard } from '@/lib/storage';
import { absFromMilli, formatDollars } from '@/lib/utils';

const TRANSACTION_LOOKBACK_DAYS = 45;

export default function CardTransactionsPage() {
  const params = useParams();
  const router = useRouter();
  const cardId = params.id as string;

  const { pat } = useYnabPAT();
  const { cards } = useCreditCards();

  const [card, setCard] = useState<CreditCard | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithRewards[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const foundCard = cards.find(c => c.id === cardId);
    if (foundCard) {
      setCard(foundCard);
    } else if (cards.length > 0) {
      router.push('/');
    }
  }, [cards, cardId, router]);

  const loadTransactions = useCallback(async () => {
    if (!pat || !card) return;

    const selectedBudget = storage.getSelectedBudget();
    if (!selectedBudget.id) {
      setError('No budget selected. Please configure YNAB connection.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const client = new YnabClient(pat);
      // Abort any previous request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      // Get transactions from the last N days
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - TRANSACTION_LOOKBACK_DAYS);

      const allTransactions = await client.getTransactions(selectedBudget.id, {
        since_date: sinceDate.toISOString().split('T')[0],
        signal: controller.signal,
      });

      // Filter for this card's account
      const cardTransactions = allTransactions.filter((txn: Transaction) =>
        txn.account_id === card.ynabAccountId
      );

      // Sort by date (newest first)
      cardTransactions.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setTransactions(cardTransactions);
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Failed to load transactions: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  }, [pat, card]);

  useEffect(() => {
    if (card) {
      loadTransactions();
    }
  }, [card, loadTransactions]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (!card) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  const spendingTransactions = transactions.filter(txn => txn.amount < 0);
  const totalSpent = Math.abs(spendingTransactions.reduce((sum, txn) => sum + txn.amount, 0)) / 1000;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/cards/${cardId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Card
          </Link>
        </Button>
      </div>

      {/* Card Info */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{card.name} Transactions</h1>
        <p className="text-muted-foreground mt-1">
          Last {TRANSACTION_LOOKBACK_DAYS} days • {spendingTransactions.length} spending transactions
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${totalSpent.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{spendingTransactions.length}</p>
            <p className="text-xs text-muted-foreground">Spending transactions</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Transactions List */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Transactions</CardTitle>
              <CardDescription>
                Spending transactions from the last {TRANSACTION_LOOKBACK_DAYS} days
              </CardDescription>
            </div>
            <Button onClick={loadTransactions} disabled={loading} size="sm">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                'Refresh'
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && transactions.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3">Loading transactions...</span>
            </div>
          ) : spendingTransactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-3" />
              <p>No spending transactions found</p>
              <p className="text-sm">Try expanding the date range or check your YNAB connection</p>
            </div>
          ) : (
            <div className="space-y-2">
              {spendingTransactions.map((txn) => {
                const settings = storage.getSettings();
                const amount = absFromMilli(txn.amount);
                const { reward, blockInfo } = SimpleRewardsCalculator.calculateTransactionReward(amount, card, settings);

                return (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-medium">{txn.payee_name}</span>
                        {txn.flag_color && (
                          <Badge variant="outline" className="text-xs">
                            {txn.flag_name || txn.flag_color}
                          </Badge>
                        )}
                        <span className="text-sm text-muted-foreground">
                          {new Date(txn.date).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="text-sm text-muted-foreground">
                        YNAB Category: {txn.category_name || 'Uncategorised'}
                      </div>
                    </div>

                    <div className="text-right ml-4">
                      <p className="font-mono font-medium">
                        {formatDollars(amount)}
                      </p>
                      {card.earningRate && (
                        <div className="space-y-1 mt-1">
                          <Badge variant="secondary">
                            {card.type === 'cashback'
                              ? `+${formatDollars(reward)}`
                              : `+${Math.round(reward)} miles`}
                          </Badge>
                          {blockInfo && card.earningBlockSize && (
                            <p className="text-xs text-muted-foreground">{blockInfo}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}