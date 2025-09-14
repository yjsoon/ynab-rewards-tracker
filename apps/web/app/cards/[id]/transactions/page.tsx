'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useYnabPAT, useCreditCards, useTagMappings } from '@/hooks/useLocalStorage';
import { YnabClient } from '@/lib/ynab-client';
import { storage } from '@/lib/storage';
import { TransactionMatcher } from '@/lib/rewards-engine';
import type { Transaction } from '@/types/transaction';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft,
  Calendar,
  DollarSign,
  Filter,
  Tag,
  AlertCircle,
  Loader2,
  Edit,
  Save,
  X
} from 'lucide-react';
import type { TransactionWithRewards } from '@/types/transaction';
import type { CreditCard } from '@/lib/storage';
import { absFromMilli, formatDollars } from '@/lib/utils';

const TRANSACTION_LOOKBACK_DAYS = 90;

export default function CardTransactionsPage() {
  const params = useParams();
  const router = useRouter();
  const cardId = params.id as string;
  
  const { pat } = useYnabPAT();
  const { cards } = useCreditCards();
  const { mappings } = useTagMappings(cardId);
  
  const [card, setCard] = useState<CreditCard | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithRewards[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
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

      // Filter for this card's account and apply tag mappings
      const cardTransactions = allTransactions.filter((txn: Transaction) => 
        txn.account_id === card.ynabAccountId
      );

      const enrichedTransactions = TransactionMatcher.applyTagMappings(
        cardTransactions,
        mappings
      );

      // Sort by date (newest first)
      enrichedTransactions.sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setTransactions(enrichedTransactions);
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Failed to load transactions: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  }, [pat, card, mappings]);

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

  const handleEditTransaction = (transactionId: string) => {
    setEditingTransaction(transactionId);
    const txn = transactions.find(t => t.id === transactionId);
    setSelectedCategory(txn?.rewardCategory || '');
  };

  const handleSaveTransaction = (transactionId: string) => {
    // NOTE: This updates local component state only. We do not persist
    // category changes to storage or YNAB in this MVP. Consider wiring this
    // to a persistence layer (e.g., local tagMappings save or YNAB patch)
    // to avoid confusion about changes not sticking across reloads.
    setTransactions(prev => prev.map(txn => 
      txn.id === transactionId 
        ? { ...txn, rewardCategory: selectedCategory }
        : txn
    ));
    setEditingTransaction(null);
    setSelectedCategory('');
  };

  const handleCancelEdit = () => {
    setEditingTransaction(null);
    setSelectedCategory('');
  };

  const getAvailableCategories = () => {
    const categories = new Set<string>();
    mappings.forEach(mapping => {
      categories.add(mapping.rewardCategory);
    });
    return Array.from(categories).sort();
  };

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
  const categorizedTransactions = spendingTransactions.filter(txn => txn.rewardCategory);
  const uncategorizedTransactions = spendingTransactions.filter(txn => !txn.rewardCategory);

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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
            <CardTitle className="text-sm font-medium">Categorized</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{categorizedTransactions.length}</p>
            <p className="text-xs text-muted-foreground">
              {spendingTransactions.length > 0 
                ? `${Math.round((categorizedTransactions.length / spendingTransactions.length) * 100)}%`
                : '0%'
              } of transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Uncategorised</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">{uncategorizedTransactions.length}</p>
            <p className="text-xs text-muted-foreground">Need attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tag Mappings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{mappings.length}</p>
            <Button variant="link" size="sm" asChild className="px-0 text-xs h-auto">
              <Link href={`/cards/${cardId}/mappings`}>Manage</Link>
            </Button>
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

      {uncategorizedTransactions.length > 0 && (
        <Alert className="mb-6">
          <Tag className="h-4 w-4" />
          <AlertDescription>
            <strong>{uncategorizedTransactions.length} transactions</strong> need categories assigned.
            <Link href={`/cards/${cardId}/mappings`} className="ml-2 underline">
              Set up tag mappings
            </Link> to automatically categorise transactions.
          </AlertDescription>
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
              {spendingTransactions.map((txn) => (
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
                    
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Category: {txn.category_name || 'Uncategorised'}
                      </span>
                      
                      {editingTransaction === txn.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Reward Category:</span>
                          <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="px-2 py-1 text-xs border rounded"
                          >
                            <option value="">None</option>
                            {getAvailableCategories().map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <Button size="sm" onClick={() => handleSaveTransaction(txn.id)}>
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            Reward Category: {txn.rewardCategory || 'None'}
                          </span>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => handleEditTransaction(txn.id)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right ml-4">
                    <p className="font-mono font-medium">
                      {formatDollars(absFromMilli(txn.amount))}
                    </p>
                    {txn.rewardCategory && (
                      <Badge 
                        variant="secondary" 
                        className="mt-1"
                      >
                        Eligible
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
