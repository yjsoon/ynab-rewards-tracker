'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Edit, Save, X, Wand2 } from 'lucide-react';
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
  const { mappings, saveMapping } = useTagMappings(cardId);
  const [transactions, setTransactions] = useState<TransactionWithRewards[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [message, setMessage] = useState('');
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

  function getAvailableCategories(): string[] {
    const set = new Set<string>();
    mappings.forEach(m => set.add(m.rewardCategory));
    return Array.from(set).sort();
  }

  function startEdit(txn: TransactionWithRewards) {
    setEditingId(txn.id);
    setSelectedCategory(txn.rewardCategory || '');
  }

  function cancelEdit() {
    setEditingId(null);
    setSelectedCategory('');
  }

  function saveEdit(txnId: string) {
    setTransactions(prev => prev.map(t => t.id === txnId ? { ...t, rewardCategory: selectedCategory || undefined } : t));
    setEditingId(null);
    setSelectedCategory('');
  }

  function genId() {
    return Math.random().toString(36).slice(2);
  }

  function applyMappingForTxn(txn: TransactionWithRewards) {
    if (!selectedCategory) return;
    const tag = txn.flag_name || txn.flag_color;
    if (!tag) {
      setMessage('No YNAB flag on this transaction to map from.');
      setTimeout(() => setMessage(''), 2500);
      return;
    }
    saveMapping({ id: genId(), cardId, ynabTag: tag, rewardCategory: selectedCategory });
    setMessage(`Mapped “${tag}” to “${selectedCategory}”.`);
    setTimeout(() => setMessage(''), 2500);
  }

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
                    {editingId === txn.id ? (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-sm text-muted-foreground">Reward:</span>
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
                        <Button size="sm" onClick={() => saveEdit(txn.id)} aria-label="Save category">
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit} aria-label="Cancel">
                          <X className="h-3 w-3" />
                        </Button>
                        {(txn.flag_name || txn.flag_color) && selectedCategory && (
                          <Button size="sm" variant="outline" onClick={() => applyMappingForTxn(txn)} aria-label="Create mapping from flag">
                            <Wand2 className="h-3 w-3 mr-1" /> Apply to tag
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <span>YNAB: {txn.category_name || 'Uncategorised'} • Reward: {txn.rewardCategory || 'None'}</span>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(txn)} aria-label="Edit reward category">
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-mono">${Math.abs(txn.amount/1000).toFixed(2)}</div>
                    {txn.rewardCategory && <Badge variant="secondary" className="mt-1">Eligible</Badge>}
                  </div>
                </div>
            ))}
            {message && (
              <p className="text-xs text-muted-foreground pt-1">{message}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
