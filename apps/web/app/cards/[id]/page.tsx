'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreditCards, useRewardRules, useTagMappings, useYnabPAT } from '@/hooks/useLocalStorage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft,
  Settings,
  CreditCard as CreditCardIcon,
  Target,
  Tag,
  TrendingUp,
  Calendar,
  Plus
} from 'lucide-react';
import type { CreditCard } from '@/lib/storage';
import type { Transaction, TransactionWithRewards } from '@/types/transaction';
import { YnabClient } from '@/lib/ynab-client';
import { storage } from '@/lib/storage';
import { TransactionMatcher } from '@/lib/rewards-engine';

export default function CardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const cardId = params.id as string;
  
  const { cards } = useCreditCards();
  const { rules } = useRewardRules(cardId);
  const { mappings } = useTagMappings(cardId);
  const { pat } = useYnabPAT();
  
  const [card, setCard] = useState<CreditCard | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithRewards[]>([]);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [errorTxns, setErrorTxns] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const foundCard = cards.find(c => c.id === cardId);
    if (foundCard) {
      setCard(foundCard);
    } else if (cards.length > 0) {
      // Card not found, redirect to dashboard
      router.push('/');
    }
  }, [cards, cardId, router]);

  if (!card) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-center">
            <CreditCardIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">Loading card details...</p>
          </div>
        </div>
      </div>
    );
  }

  const activeRules = rules.filter(r => r.active);
  const totalMappings = mappings.length;

  const TRANSACTION_LOOKBACK_DAYS = 90;

  const loadTransactions = useCallback(async () => {
    if (!card || !pat) return;

    const selectedBudget = storage.getSelectedBudget();
    if (!selectedBudget.id) {
      setErrorTxns('No budget selected. Please configure YNAB connection.');
      return;
    }

    setLoadingTxns(true);
    setErrorTxns('');

    try {
      // Abort any inflight
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const client = new YnabClient(pat);
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - TRANSACTION_LOOKBACK_DAYS);

      const all = await client.getTransactions(selectedBudget.id, {
        since_date: sinceDate.toISOString().split('T')[0],
        signal: controller.signal,
      });
      const cardTxns = all.filter((t: Transaction) => t.account_id === card.ynabAccountId);
      const enriched = TransactionMatcher.applyTagMappings(cardTxns, mappings);
      enriched.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(enriched);
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorTxns(`Failed to load transactions: ${msg}`);
      }
    } finally {
      setLoadingTxns(false);
    }
  }, [card, mappings, pat]);

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>
      </div>

      {/* Card Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl">{card.name}</CardTitle>
                <CardDescription className="text-base mt-2">
                  {card.type === 'cashback' ? 'Cashback Card' : 'Miles Card'} • 
                  {card.billingCycle?.type === 'calendar' ? ' Calendar Month' : 
                   card.billingCycle?.type === 'billing' ? ` Billing Cycle (${card.billingCycle?.dayOfMonth || 1}th)` : ' Calendar Month'}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/cards/${cardId}/settings`}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Active Rules</p>
                <p className="text-2xl font-bold">{activeRules.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tag Mappings</p>
                <p className="text-2xl font-bold">{totalMappings}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Card Type</p>
                <Badge variant="outline" className="mt-1">
                  {card.type === 'cashback' ? 'Cashback' : 'Miles'}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={card.active ? 'default' : 'secondary'} className="mt-1">
                  {card.active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Current Period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Period Type</p>
                <p className="font-medium">
                  {card.billingCycle?.type === 'billing' ? 'Billing Cycle' : 'Calendar Month'}
                </p>
              </div>
              {card.billingCycle?.type === 'billing' && (
                <div>
                  <p className="text-sm text-muted-foreground">Cycle Day</p>
                  <p className="font-medium">{card.billingCycle?.dayOfMonth || 1}th of month</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different sections */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rules">Rules ({activeRules.length})</TabsTrigger>
          <TabsTrigger value="mappings">Mappings ({totalMappings})</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Manage your card settings and rules</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild className="w-full justify-start">
                  <Link href={`/cards/${cardId}/rules/new`}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Reward Rule
                  </Link>
                </Button>
                <Button variant="outline" asChild className="w-full justify-start">
                  <Link href={`/cards/${cardId}/mappings`}>
                    <Tag className="h-4 w-4 mr-2" />
                    Manage Tag Mappings
                  </Link>
                </Button>
                <Button variant="outline" asChild className="w-full justify-start">
                  <Link href={`/cards/${cardId}/transactions`}>
                    <Calendar className="h-4 w-4 mr-2" />
                    View Transactions
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Recent Activity Placeholder */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Transaction summary and rewards earned</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-8 w-8 mx-auto mb-3" />
                  <p>Rewards calculation coming soon</p>
                  <p className="text-sm">Connect transactions to see activity</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="rules" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Reward Rules</h3>
              <p className="text-sm text-muted-foreground">Configure how rewards are calculated</p>
            </div>
            <Button asChild>
              <Link href={`/cards/${cardId}/rules/new`}>
                <Plus className="h-4 w-4 mr-2" />
                Add Rule
              </Link>
            </Button>
          </div>

          {activeRules.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Reward Rules</h3>
                <p className="text-muted-foreground mb-6">
                  Create reward rules to start calculating your earnings
                </p>
                <Button asChild>
                  <Link href={`/cards/${cardId}/rules/new`}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Rule
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeRules.map(rule => (
                <Card key={rule.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-base">{rule.name}</CardTitle>
                        <CardDescription>
                          {rule.rewardType === 'cashback' 
                            ? `${rule.rewardValue}% cashback`
                            : `${rule.rewardValue}x miles${rule.milesBlockSize ? ` ($${rule.milesBlockSize} blocks)` : ''}`}
                        </CardDescription>
                      </div>
                      <Badge variant={rule.active ? 'default' : 'secondary'}>
                        {rule.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Categories: </span>
                        {rule.categories.length > 0 ? rule.categories.join(', ') : 'None'}
                      </div>
                      {rule.minimumSpend && (
                        <div>
                          <span className="text-muted-foreground">Minimum: </span>
                          ${rule.minimumSpend.toLocaleString()}
                        </div>
                      )}
                      {rule.maximumSpend && (
                        <div>
                          <span className="text-muted-foreground">Maximum: </span>
                          ${rule.maximumSpend.toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/cards/${cardId}/rules/${rule.id}/edit`}>
                          Edit Rule
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mappings" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Tag Mappings</h3>
              <p className="text-sm text-muted-foreground">Map YNAB tags to reward categories</p>
            </div>
            <Button asChild>
              <Link href={`/cards/${cardId}/mappings/new`}>
                <Plus className="h-4 w-4 mr-2" />
                Add Mapping
              </Link>
            </Button>
          </div>

          {totalMappings === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Tag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Tag Mappings</h3>
                <p className="text-muted-foreground mb-6">
                  Create mappings to connect YNAB transaction tags to reward categories
                </p>
                <Button asChild>
                  <Link href={`/cards/${cardId}/mappings/new`}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Mapping
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {mappings.map(mapping => (
                <Card key={mapping.id}>
                  <CardContent className="py-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-4">
                        <Badge variant="outline">{mapping.ynabTag}</Badge>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">{mapping.rewardCategory}</span>
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/cards/${cardId}/mappings/${mapping.id}/edit`}>
                          Edit
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Transactions</CardTitle>
                  <CardDescription>View and categorise your card transactions</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={loadTransactions} disabled={loadingTxns}>Refresh</Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/cards/${cardId}/transactions`}>Open Full View</Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!pat || !storage.getSelectedBudget().id ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4" />
                  <p className="text-lg mb-2">YNAB not configured</p>
                  <p>Connect to YNAB to see your transactions</p>
                  <Button variant="outline" className="mt-4" asChild>
                    <Link href="/settings">Configure YNAB Connection</Link>
                  </Button>
                </div>
              ) : loadingTxns && transactions.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Calendar className="h-6 w-6 mr-2" /> Loading transactions...
                </div>
              ) : errorTxns ? (
                <div className="text-center py-12 text-red-500">{errorTxns}</div>
              ) : transactions.filter(t => t.amount < 0).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-3" />
                  <p>No spending transactions found in the last {TRANSACTION_LOOKBACK_DAYS} days.</p>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
