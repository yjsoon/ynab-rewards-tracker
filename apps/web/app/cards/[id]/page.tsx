'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCreditCards, useYnabPAT } from '@/hooks/useLocalStorage';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  CreditCard as CreditCardIcon,
  ChevronDown,
} from 'lucide-react';
import type { CreditCard } from '@/lib/storage';
import { SimpleRewardsCalculator } from '@/lib/rewards-engine';
import { useCardTransactions } from '@/hooks/useCardTransactions';
import { toIsoDateString } from '@/lib/date';
import { cn } from '@/lib/utils';
import TransactionsPreview from './TransactionsPreview';
import SpendingStatus from './SpendingStatus';
import CardSettings from './CardSettings';

const TRANSACTION_LOOKBACK_DAYS = 90;

export default function CardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cardId = params.id as string;
  const startEditing = searchParams.get('edit') === '1' || searchParams.get('edit') === 'true';

  const { cards } = useCreditCards();
  const { pat } = useYnabPAT();

  const [card, setCard] = useState<CreditCard | null>(null);
  const [transactionsOpen, setTransactionsOpen] = useState(false);

  const sharedSinceDate = useMemo(() => {
    if (!card) return undefined;

    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - TRANSACTION_LOOKBACK_DAYS);
    const lookbackStart = toIsoDateString(lookbackDate);
    const periodStart = SimpleRewardsCalculator.calculatePeriod(card).start;

    return periodStart < lookbackStart ? periodStart : lookbackStart;
  }, [card]);

  const cardTransactions = useCardTransactions(card, {
    lookbackDays: TRANSACTION_LOOKBACK_DAYS,
    sinceDate: sharedSinceDate,
  });

  useEffect(() => {
    const foundCard = cards.find(c => c.id === cardId);
    if (foundCard) {
      setCard(foundCard);
    } else if (cards.length > 0) {
      router.push('/');
    }
  }, [cards, cardId, router]);

  if (!card) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-center">
            <CreditCardIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
            <p className="text-lg text-muted-foreground">Loading card details...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{card.name}</h1>
        <p className="text-muted-foreground mt-1">
          {card.type === 'cashback' ? 'Cashback Rewards' : 'Miles Rewards'} •
          {card.featured ? ' Featured on dashboard' : ' Hidden from dashboard'}
        </p>
      </div>

      {pat && (
        <SpendingStatus
          card={card}
          pat={pat}
          prefetchedTransactions={cardTransactions.transactions}
          transactionsLoading={cardTransactions.loading}
        />
      )}

      <div className="mt-8">
        <CardSettings
          card={card}
          onUpdate={(updatedCard) => setCard(updatedCard)}
          initialEditing={startEditing}
        />
      </div>

      <Collapsible open={transactionsOpen} onOpenChange={setTransactionsOpen} className="mt-8">
        <h2>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left text-lg font-semibold">
            <ChevronDown
              className={cn(
                'h-5 w-5 text-muted-foreground transition-transform',
                !transactionsOpen && '-rotate-90'
              )}
            />
            Recent Transactions
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent className="pt-4">
          <TransactionsPreview
            card={card}
            lookbackDays={TRANSACTION_LOOKBACK_DAYS}
            periodDataSinceDate={sharedSinceDate}
            prefetchedTransactions={cardTransactions.transactions}
            transactionsLoading={cardTransactions.loading}
            transactionsError={cardTransactions.error}
            onRefresh={cardTransactions.refresh}
            connection={cardTransactions.connection}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
