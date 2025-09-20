'use client';

import { useState, useEffect } from 'react';
import { useCreditCards, useSettings } from '@/hooks/useLocalStorage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Save, 
  CreditCard as CreditCardIcon,
  Percent,
  DollarSign,
  Calendar,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import type { CreditCard } from '@/lib/storage';
import { formatDollars } from '@/lib/utils';

interface CardEditState {
  [cardId: string]: {
    earningRate?: number;
    milesBlockSize?: number;
    minimumSpend?: number | null;
    billingCycleType?: 'calendar' | 'billing';
    billingCycleDay?: number;
    active?: boolean;
  };
}

export default function RulesPage() {
  const { cards, updateCard } = useCreditCards();
  const { settings } = useSettings();
  const [editState, setEditState] = useState<CardEditState>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [changedCards, setChangedCards] = useState<Set<string>>(new Set());

  // Group cards by type
  const cashbackCards = cards.filter(card => card.type === 'cashback');
  const milesCards = cards.filter(card => card.type === 'miles');

  // Initialize edit state from existing cards
  useEffect(() => {
    const initialState: CardEditState = {};
    cards.forEach(card => {
      initialState[card.id] = {
        earningRate: card.earningRate || (card.type === 'cashback' ? 1 : 1),
        milesBlockSize: card.milesBlockSize || 1,
        minimumSpend: card.minimumSpend,
        billingCycleType: card.billingCycle?.type || 'calendar',
        billingCycleDay: card.billingCycle?.dayOfMonth || 1,
        active: card.active
      };
    });
    setEditState(initialState);
  }, [cards]);

  const handleFieldChange = (cardId: string, field: keyof CardEditState[string], value: any) => {
    setEditState(prev => ({
      ...prev,
      [cardId]: {
        ...prev[cardId],
        [field]: value
      }
    }));
    setChangedCards(prev => new Set([...prev, cardId]));
    setSaveSuccess(false);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setSaveSuccess(false);

    try {
      // Update each changed card
      for (const cardId of changedCards) {
        const card = cards.find(c => c.id === cardId);
        if (!card) continue;

        const changes = editState[cardId];
        const updatedCard: CreditCard = {
          ...card,
          earningRate: changes.earningRate,
          milesBlockSize: card.type === 'miles' ? changes.milesBlockSize : undefined,
          minimumSpend: changes.minimumSpend,
          billingCycle: changes.billingCycleType === 'billing' 
            ? { type: 'billing', dayOfMonth: changes.billingCycleDay }
            : { type: 'calendar' },
          active: changes.active !== undefined ? changes.active : card.active
        };

        updateCard(updatedCard);
      }

      setChangedCards(new Set());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save changes:', error);
    } finally {
      setSaving(false);
    }
  };

  const renderCardRow = (card: CreditCard) => {
    const state = editState[card.id] || {};
    const isChanged = changedCards.has(card.id);
    
    return (
      <div 
        key={card.id} 
        className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 p-4 border rounded-lg ${
          isChanged ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700' : ''
        }`}
      >
        {/* Card Name & Status */}
        <div className="lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{card.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={state.active ?? card.active}
              onCheckedChange={(checked) => handleFieldChange(card.id, 'active', checked)}
              id={`active-${card.id}`}
            />
            <Label htmlFor={`active-${card.id}`} className="text-sm">
              Active
            </Label>
          </div>
        </div>

        {/* Earning Rate */}
        <div>
          <Label htmlFor={`rate-${card.id}`} className="text-sm text-muted-foreground">
            {card.type === 'cashback' ? 'Cashback Rate' : 'Miles Rate'}
          </Label>
          <div className="relative mt-1">
            {card.type === 'cashback' && (
              <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            )}
            <Input
              id={`rate-${card.id}`}
              type="number"
              value={state.earningRate ?? card.earningRate ?? 1}
              onChange={(e) => handleFieldChange(card.id, 'earningRate', parseFloat(e.target.value) || 0)}
              step="0.1"
              min="0"
              max="100"
              className={card.type === 'cashback' ? 'pl-8 h-9' : 'h-9'}
              placeholder={card.type === 'cashback' ? '1.5' : '1'}
            />
          </div>
        </div>

        {/* Minimum Spend */}
        <div>
          <Label className="text-sm text-muted-foreground">Minimum Spend</Label>
          <Select
            value={
              state.minimumSpend === null || state.minimumSpend === undefined
                ? 'not-configured'
                : state.minimumSpend === 0
                ? 'no-minimum'
                : 'has-minimum'
            }
            onValueChange={(value) => {
              if (value === 'not-configured') {
                handleFieldChange(card.id, 'minimumSpend', null);
              } else if (value === 'no-minimum') {
                handleFieldChange(card.id, 'minimumSpend', 0);
              } else {
                handleFieldChange(card.id, 'minimumSpend', 1000);
              }
            }}
          >
            <SelectTrigger className="h-9 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not-configured">Not configured</SelectItem>
              <SelectItem value="no-minimum">No minimum</SelectItem>
              <SelectItem value="has-minimum">Has minimum</SelectItem>
            </SelectContent>
          </Select>
          {state.minimumSpend !== null && state.minimumSpend !== undefined && state.minimumSpend > 0 && (
            <div className="relative mt-2">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                type="number"
                value={state.minimumSpend}
                onChange={(e) => handleFieldChange(card.id, 'minimumSpend', parseFloat(e.target.value) || 0)}
                step="100"
                min="0"
                max="100000"
                className="pl-8 h-8"
                placeholder="1000"
              />
            </div>
          )}
        </div>

        {/* Billing Cycle */}
        <div>
          <Label className="text-sm text-muted-foreground">Billing Cycle</Label>
          <Select
            value={state.billingCycleType ?? card.billingCycle?.type ?? 'calendar'}
            onValueChange={(value: 'calendar' | 'billing') => {
              handleFieldChange(card.id, 'billingCycleType', value);
            }}
          >
            <SelectTrigger className="h-9 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="calendar">Calendar month</SelectItem>
              <SelectItem value="billing">Billing cycle</SelectItem>
            </SelectContent>
          </Select>
          {state.billingCycleType === 'billing' && (
            <div className="mt-2">
              <Label htmlFor={`day-${card.id}`} className="text-xs text-muted-foreground">
                Day of month
              </Label>
              <Input
                id={`day-${card.id}`}
                type="number"
                value={state.billingCycleDay ?? card.billingCycle?.dayOfMonth ?? 1}
                onChange={(e) => handleFieldChange(card.id, 'billingCycleDay', parseInt(e.target.value) || 1)}
                min="1"
                max="31"
                className="h-8 mt-1"
                placeholder="1"
              />
            </div>
          )}
        </div>

        {/* Current Value Display */}
        <div className="lg:col-span-2 flex items-center justify-end gap-4">
          {card.type === 'cashback' ? (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Effective rate</p>
              <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                {state.earningRate ?? card.earningRate ?? 1}%
              </p>
            </div>
          ) : (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Miles rate</p>
              <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                {state.earningRate ?? card.earningRate ?? 1} miles
                <span className="text-xs text-muted-foreground ml-1">
                  per ${state.milesBlockSize ?? card.milesBlockSize ?? 1}
                </span>
              </p>
            </div>
          )}
          {isChanged && (
            <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              Modified
            </Badge>
          )}
        </div>
      </div>
    );
  };

  if (cards.length === 0) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Card Rules & Settings</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCardIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg text-muted-foreground mb-4">No cards configured yet</p>
            <p className="text-sm text-muted-foreground">
              Add cards in Settings to start managing their rules
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Card Rules & Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure earning rates, minimum spend, and billing cycles for all your cards
          </p>
        </div>
        {changedCards.size > 0 && (
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30">
              {changedCards.size} unsaved {changedCards.size === 1 ? 'change' : 'changes'}
            </Badge>
            <Button 
              onClick={handleSaveAll} 
              disabled={saving}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save All Changes'}
            </Button>
          </div>
        )}
      </div>

      {saveSuccess && (
        <Alert className="mb-6 border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertDescription className="text-green-700 dark:text-green-300">
            All changes saved successfully!
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="cashback" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="cashback" className="gap-2">
            <Percent className="h-4 w-4" />
            Cashback ({cashbackCards.length})
          </TabsTrigger>
          <TabsTrigger value="miles" className="gap-2">
            <CreditCardIcon className="h-4 w-4" />
            Miles ({milesCards.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cashback" className="space-y-4">
          {cashbackCards.length > 0 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Cashback Cards</CardTitle>
                  <CardDescription>
                    Configure cashback percentages and spending requirements
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {cashbackCards.map(card => renderCardRow(card))}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Percent className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No cashback cards configured</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="miles" className="space-y-4">
          {milesCards.length > 0 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Miles & Points Cards</CardTitle>
                  <CardDescription>
                    Configure miles earning rates and spending requirements
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {milesCards.map(card => renderCardRow(card))}
                </CardContent>
              </Card>
              
              {settings?.milesValuation && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Miles are valued at ${settings.milesValuation} per mile for comparison purposes.
                    You can adjust this in Settings.
                  </AlertDescription>
                </Alert>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CreditCardIcon className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No miles cards configured</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}