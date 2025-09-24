'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreditCards, useSettings } from '@/hooks/useLocalStorage';
import { useCardTransactions } from '@/hooks/useCardTransactions';
import { SimpleRewardsCalculator } from '@/lib/rewards-engine';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  Calendar,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import type { CreditCard } from '@/lib/storage';
import { absFromMilli } from '@/lib/utils';
import { CurrencyAmount } from '@/components/CurrencyAmount';

const TRANSACTION_LOOKBACK_DAYS = 90;
const ITEMS_PER_PAGE = 20;

export default function CardTransactionsPage() {
  const params = useParams();
  const router = useRouter();
  const cardId = params.id as string;

  const { cards } = useCreditCards();
  const { settings } = useSettings();

  const [card, setCard] = useState<CreditCard | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const foundCard = cards.find(c => c.id === cardId);
    if (foundCard) {
      setCard(foundCard);
    } else if (cards.length > 0) {
      router.push('/');
    }
  }, [cards, cardId, router]);

  const { transactions, loading, error, refresh } = useCardTransactions(card, {
    lookbackDays: TRANSACTION_LOOKBACK_DAYS,
  });

  const spendingTransactions = useMemo(
    () => transactions.filter(txn => txn.amount < 0),
    [transactions]
  );

  const pagination = useMemo(() => {
    const total = spendingTransactions.length;
    const maxPage = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
    const clampedPage = Math.min(currentPage, maxPage);
    const start = (clampedPage - 1) * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, total);

    return {
      total,
      maxPage,
      clampedPage,
      start,
      end,
      items: spendingTransactions.slice(start, start + ITEMS_PER_PAGE),
    };
  }, [currentPage, spendingTransactions]);

  const activePage = pagination.clampedPage;

  useEffect(() => {
    if (currentPage !== activePage) {
      setCurrentPage(activePage);
    }
  }, [currentPage, activePage]);

  const totalSpent = useMemo(() => {
    const totalMilli = spendingTransactions.reduce((sum, txn) => sum + txn.amount, 0);
    return Math.abs(totalMilli) / 1000;
  }, [spendingTransactions]);

  const goToPage = (page: number) => {
    const boundedPage = Math.min(Math.max(1, page), pagination.maxPage);
    setCurrentPage(boundedPage);
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
          Last {TRANSACTION_LOOKBACK_DAYS} days • {pagination.total} spending transactions
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
            <p className="text-2xl font-bold">{pagination.total}</p>
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
            <Button onClick={refresh} disabled={loading} size="sm">
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
          ) : pagination.total === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-3" />
              <p>No spending transactions found</p>
              <p className="text-sm">Try expanding the date range or check your YNAB connection</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {pagination.items.map((txn) => {
                  const amount = absFromMilli(txn.amount);
                  const { reward, blockInfo } = SimpleRewardsCalculator.calculateTransactionReward(
                    amount,
                    card,
                    settings,
                    { flagColor: txn.flag_color }
                  );

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
                          <CurrencyAmount value={amount} currency={settings.currency} />
                        </p>
                        {card.earningRate && (
                          <div className="space-y-1 mt-1">
                            <Badge variant="secondary">
                              {card.type === 'cashback' ? (
                                <CurrencyAmount value={reward} currency={settings.currency} showPlus />
                              ) : (
                                `+${Math.round(reward)} miles`
                              )}
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

              {/* Pagination Controls */}
              {pagination.total > 0 && pagination.maxPage > 1 && (
                <div className="mt-6 flex items-center justify-between border-t pt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {pagination.start + 1}-{pagination.end} of {pagination.total} transactions
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(activePage - 1)}
                      disabled={activePage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>

                    <div className="flex gap-1">
                      {/* Show first page */}
                      {activePage > 3 && (
                        <>
                          <Button
                            variant={activePage === 1 ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => goToPage(1)}
                            className="w-10"
                          >
                            1
                          </Button>
                          {activePage > 4 && <span className="px-2 py-1">...</span>}
                        </>
                      )}

                      {/* Show pages around current */}
                      {Array.from(
                        { length: Math.min(5, pagination.maxPage) },
                        (_, i) => {
                          const pageNum = Math.max(
                            1,
                            Math.min(activePage - 2 + i, pagination.maxPage - 4 + i)
                          );
                          if (pageNum <= 0 || pageNum > pagination.maxPage) return null;
                          if (pagination.maxPage <= 5) {
                            return pageNum;
                          }
                          if (activePage <= 3) {
                            return Math.min(pageNum, 5);
                          }
                          if (activePage >= pagination.maxPage - 2) {
                            return Math.max(pagination.maxPage - 4 + i, 1);
                          }
                          return activePage - 2 + i;
                        }
                      )
                        .filter((p): p is number => p !== null && p > 0 && p <= pagination.maxPage)
                        .filter((p, i, arr) => arr.indexOf(p) === i)
                        .sort((a, b) => a - b)
                        .map((pageNum) => (
                          <Button
                            key={pageNum}
                            variant={activePage === pageNum ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => goToPage(pageNum)}
                            className="w-10"
                          >
                            {pageNum}
                          </Button>
                        ))}

                      {/* Show last page */}
                      {activePage < pagination.maxPage - 2 && (
                        <>
                          {activePage < pagination.maxPage - 3 && <span className="px-2 py-1">...</span>}
                          <Button
                            variant={activePage === pagination.maxPage ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => goToPage(pagination.maxPage)}
                            className="w-10"
                          >
                            {pagination.maxPage}
                          </Button>
                        </>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(activePage + 1)}
                      disabled={activePage === pagination.maxPage}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
