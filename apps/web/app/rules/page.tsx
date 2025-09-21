'use client';

import { useState, useEffect } from 'react';
import { useCreditCards, useSettings } from '@/hooks/useLocalStorage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Save, 
  CreditCard as CreditCardIcon,
  Percent,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import type { CreditCard } from '@/lib/storage';
import { CardSettingsEditor, type CardEditState as SingleCardEditState } from '@/components/CardSettingsEditor';

interface CardEditState {
  [cardId: string]: SingleCardEditState;
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
        earningBlockSize: card.earningBlockSize,
        minimumSpend: card.minimumSpend,
        maximumSpend: card.maximumSpend,
        billingCycleType: card.billingCycle?.type || 'calendar',
        billingCycleDay: card.billingCycle?.dayOfMonth || 1,
        active: card.active
      };
    });
    setEditState(initialState);
  }, [cards]);

  const handleFieldChange = (cardId: string, field: keyof SingleCardEditState, value: any) => {
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
          name: changes.name ?? card.name,
          issuer: changes.issuer ?? card.issuer,
          type: changes.type ?? card.type,
          earningRate: changes.earningRate,
          earningBlockSize: changes.earningBlockSize,
          minimumSpend: changes.minimumSpend,
          maximumSpend: changes.maximumSpend ?? card.maximumSpend,
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
    <div className="container mx-auto max-w-6xl px-4 py-8">
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
                  {cashbackCards.map(card => (
                    <CardSettingsEditor
                      key={card.id}
                      card={card}
                      state={editState[card.id] || {}}
                      onFieldChange={(field, value) => handleFieldChange(card.id, field, value)}
                      isChanged={changedCards.has(card.id)}
                    />
                  ))}
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
                  {milesCards.map(card => (
                    <CardSettingsEditor
                      key={card.id}
                      card={card}
                      state={editState[card.id] || {}}
                      onFieldChange={(field, value) => handleFieldChange(card.id, field, value)}
                      isChanged={changedCards.has(card.id)}
                    />
                  ))}
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