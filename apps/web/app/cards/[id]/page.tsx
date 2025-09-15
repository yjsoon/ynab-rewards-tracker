'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreditCards, useRewardRules, useTagMappings, useYnabPAT } from '@/hooks/useLocalStorage';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TagMappingManager } from '@/components/TagMappingManager';
import { RewardsCalculator } from '@/lib/rewards-engine';
import { formatPeriodRangeParts } from '@/lib/date';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  CreditCard as CreditCardIcon,
  Target,
  Tag,
  TrendingUp,
  Calendar,
  Plus,
  Zap,
  Receipt,
  Shield,
  DollarSign,
  Percent
} from 'lucide-react';
import type { CreditCard } from '@/lib/storage';
import TransactionsPreview from './TransactionsPreview';
import SpendingStatus from './SpendingStatus';
import CardSettings from './CardSettings';

export default function CardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const cardId = params.id as string;
  
  const { cards } = useCreditCards();
  const { rules } = useRewardRules(cardId);
  const { mappings, saveMapping, deleteMapping } = useTagMappings(cardId);
  const { pat } = useYnabPAT();
  
  const [card, setCard] = useState<CreditCard | null>(null);
  // Transactions preview handled in child component

  // Compute current billing period label; call hook before any early returns
  const periodParts = useMemo(() => {
    if (!card) return { start: '', end: '' };
    return formatPeriodRangeParts(RewardsCalculator.calculatePeriod(card));
  }, [card]);

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

  const activeRules = rules.filter(r => r.active);
  const totalMappings = mappings.length;

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
              {card.issuer && ` ${card.issuer} • `}
              {card.active ? 'Active' : 'Inactive'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/cards/${cardId}/rules/new`}>
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Add Rule
            </Link>
          </Button>
        </div>
      </div>

      {/* Primary Spending Status - Most Important */}
      {pat && (
        <SpendingStatus
          card={card}
          rules={rules}
          mappings={mappings}
          pat={pat}
        />
      )}

      {/* Secondary content in tabs */}
      <Tabs defaultValue="transactions" className="space-y-6 mt-8">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-6">
          <TransactionsPreview cardId={cardId} ynabAccountId={card.ynabAccountId} />
        </TabsContent>

        <TabsContent value="rules" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Reward Rules</CardTitle>
                  <CardDescription className="mt-1">
                    Define how rewards are calculated for different spending categories
                  </CardDescription>
                </div>
                <Button asChild size="sm">
                  <Link href={`/cards/${cardId}/rules/new`}>
                    <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                    Add Rule
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
          {activeRules.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
                  <h3 className="text-lg font-semibold mb-2">No Reward Rules</h3>
                  <p className="text-muted-foreground mb-6">
                    Create reward rules to start calculating your earnings
                  </p>
                  <Button asChild>
                    <Link href={`/cards/${cardId}/rules/new`}>
                      <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                      Create Your First Rule
                    </Link>
                  </Button>
                </div>
          ) : (
            <div className="space-y-4">
              {activeRules.map(rule => (
                <div key={rule.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="font-semibold">{rule.name}</h4>
                      <Badge variant={rule.active ? 'default' : 'secondary'} className="text-xs">
                        {rule.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {rule.rewardType === 'cashback'
                          ? `${rule.rewardValue}% cashback`
                          : `${rule.rewardValue}x miles${rule.milesBlockSize ? ` per $${rule.milesBlockSize}` : ''}`}
                      </span>
                      {rule.categories.length > 0 && (
                        <>
                          <span>•</span>
                          <span>{rule.categories.join(', ')}</span>
                        </>
                      )}
                      {(rule.minimumSpend || rule.maximumSpend) && (
                        <>
                          <span>•</span>
                          <span>
                            {rule.minimumSpend && `Min: $${rule.minimumSpend.toLocaleString()}`}
                            {rule.minimumSpend && rule.maximumSpend && ' / '}
                            {rule.maximumSpend && `Max: $${rule.maximumSpend.toLocaleString()}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/cards/${cardId}/rules/${rule.id}/edit`}>
                      Edit
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Tag Mappings</CardTitle>
              <CardDescription className="mt-1">
                Map YNAB flags and tags to reward categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TagMappingManager
                mappings={mappings}
                onSave={(mapping) => saveMapping({ ...mapping, cardId })}
                onDelete={deleteMapping}
                suggestedCategories={rules.flatMap(r => r.categories)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <CardSettings card={card} onUpdate={(updatedCard) => setCard(updatedCard)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
