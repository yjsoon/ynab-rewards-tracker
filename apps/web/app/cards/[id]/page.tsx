'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useCreditCards, useYnabPAT } from '@/hooks/useLocalStorage';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  CreditCard as CreditCardIcon
} from 'lucide-react';
import type { CreditCard } from '@/lib/storage';
import TransactionsPreview from './TransactionsPreview';
import SpendingStatus from './SpendingStatus';
import CardSettings from './CardSettings';

export default function CardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cardId = params.id as string;
  const defaultTab = searchParams.get('tab') || 'transactions';
  
  const { cards } = useCreditCards();
  const { pat } = useYnabPAT();
  
  const [card, setCard] = useState<CreditCard | null>(null);
  // Transactions preview handled in child component

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
            <CreditCardIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
            <p className="text-lg text-muted-foreground">Loading card details...</p>
          </div>
        </div>
      </div>
    );
  }

  // No-op: child component handles its own data fetching

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/" aria-label="Back to dashboard">
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{card.name}</h1>
            <p className="text-muted-foreground mt-1">
              {card.type === 'cashback' ? 'Cashback Rewards' : 'Miles Rewards'} •
              {card.active ? ' Active' : ' Inactive'}
            </p>
          </div>
        </div>
      </div>

      {/* Primary Spending Status - Most Important */}
      {pat && (
        <SpendingStatus
          card={card}
          pat={pat}
        />
      )}

      {/* Secondary content in tabs */}
      <Tabs defaultValue={defaultTab} className="mt-8">
        <TabsList className="grid w-full grid-cols-2 h-12 p-1 bg-muted/50">
          <TabsTrigger
            value="transactions"
            className="data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground font-medium transition-all"
          >
            Transactions
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground font-medium transition-all"
          >
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="mt-6">
          <TransactionsPreview cardId={cardId} ynabAccountId={card.ynabAccountId} />
        </TabsContent>


        <TabsContent value="settings" className="mt-6">
          <CardSettings card={card} onUpdate={(updatedCard) => setCard(updatedCard)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
