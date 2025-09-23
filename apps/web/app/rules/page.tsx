'use client';

import { useState, useEffect, useMemo } from 'react';
import { useCreditCards, useSettings } from '@/hooks/useLocalStorage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { 
  Save, 
  CreditCard as CreditCardIcon,
  Percent,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { storage, type CardSubcategory, type CreditCard } from '@/lib/storage';
import { CardSettingsEditor, type CardEditState as SingleCardEditState } from '@/components/CardSettingsEditor';
import { prepareSubcategoriesForSave } from '@/lib/subcategory-utils';

interface CardEditState {
  [cardId: string]: SingleCardEditState;
}

export default function RulesPage() {
  const { cards, updateCard } = useCreditCards();
  const { settings } = useSettings();
  const flagNames = useMemo(() => storage.getFlagNames(), []);
  const [editState, setEditState] = useState<CardEditState>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [changedCards, setChangedCards] = useState<Set<string>>(new Set());
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [batchRate, setBatchRate] = useState('');
  const [batchError, setBatchError] = useState('');

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
        featured: card.featured ?? true,
        subcategoriesEnabled: card.subcategoriesEnabled ?? false,
        subcategories: card.subcategories ? card.subcategories.map(sub => ({ ...sub })) : [],
      };
    });
    setEditState(initialState);
    setChangedCards(new Set());
    setSelectedCards(new Set());
  }, [cards]);

  const handleFieldChange = (cardId: string, field: keyof SingleCardEditState, value: unknown) => {
    setEditState(prev => ({
      ...prev,
      [cardId]: {
        ...prev[cardId],
        [field]: value
      }
    }));
    setChangedCards(prev => {
      const next = new Set(prev);
      next.add(cardId);
      return next;
    });
    setSaveSuccess(false);
  };

  const toggleCardSelection = (cardId: string) => {
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      if (next.size === 0) {
        setBatchError('');
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedCards(new Set());
    setBatchError('');
  };

  const applyBatchFeatured = (featured: boolean) => {
    if (selectedCards.size === 0) {
      setBatchError('Select at least one card before applying a batch action.');
      return;
    }

    setEditState(prev => {
      const next = { ...prev };
      selectedCards.forEach(cardId => {
        const current = next[cardId] ?? {};
        next[cardId] = {
          ...current,
          featured,
        };
      });
      return next;
    });

    setChangedCards(prev => {
      const next = new Set(prev);
      selectedCards.forEach(id => next.add(id));
      return next;
    });
    setSaveSuccess(false);
  };

  const applyBatchType = (type: 'cashback' | 'miles') => {
    if (selectedCards.size === 0) {
      setBatchError('Select at least one card before switching reward type.');
      return;
    }

    setEditState(prev => {
      const next = { ...prev };
      selectedCards.forEach(cardId => {
        const current = next[cardId] ?? {};
        next[cardId] = {
          ...current,
          type,
        };
      });
      return next;
    });

    setChangedCards(prev => {
      const next = new Set(prev);
      selectedCards.forEach(id => next.add(id));
      return next;
    });
    setBatchError('');
    setSaveSuccess(false);
  };

  const handleApplyBatchRate = () => {
    if (selectedCards.size === 0) {
      setBatchError('Select at least one card before applying a rate.');
      return;
    }
    const parsed = parseFloat(batchRate);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setBatchError('Enter a valid non-negative rate before applying.');
      return;
    }

    setEditState(prev => {
      const next = { ...prev };
      selectedCards.forEach(cardId => {
        const current = next[cardId] ?? {};
        next[cardId] = {
          ...current,
          earningRate: parsed,
        };
      });
      return next;
    });

    setChangedCards(prev => {
      const next = new Set(prev);
      selectedCards.forEach(id => next.add(id));
      return next;
    });

    setBatchRate('');
    setBatchError('');
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
        const nextSubEnabled = typeof changes.subcategoriesEnabled === 'boolean'
          ? changes.subcategoriesEnabled
          : card.subcategoriesEnabled ?? false;
        const nextSubcategories = nextSubEnabled
          ? prepareSubcategoriesForSave(
              (changes.subcategories ?? card.subcategories) as CardSubcategory[] | undefined,
              changes.earningRate ?? card.earningRate ?? 0
            )
          : [];
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
          featured: changes.featured !== undefined ? changes.featured : (card.featured ?? true),
          subcategoriesEnabled: nextSubEnabled,
          subcategories: nextSubcategories,
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

  const selectedCount = selectedCards.size;
  const changedCount = changedCards.size;
  const showStickyBar = selectedCount > 0 || changedCount > 0;

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
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold">Card Rules & Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure earning rates, minimum spend, and billing cycles for all your cards
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {selectedCount > 0 && (
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {selectedCount} selected
            </Badge>
          )}
          {changedCount > 0 && (
            <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30">
              {changedCount} unsaved {changedCount === 1 ? 'change' : 'changes'}
            </Badge>
          )}
          <Button
            onClick={handleSaveAll}
            disabled={changedCount === 0 || saving}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save all changes'}
          </Button>
        </div>
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
                      isSelected={selectedCards.has(card.id)}
                      showCardType
                      highlightUnsetMinimum
                      flagNames={flagNames}
                      leadingAccessory={(
                        <div className="pt-1">
                          <input
                            type="checkbox"
                            aria-label={`Select ${card.name}`}
                            className="mt-2 h-4 w-4 cursor-pointer rounded border-border text-primary focus:ring-2 focus:ring-primary accent-primary"
                            checked={selectedCards.has(card.id)}
                            onChange={() => toggleCardSelection(card.id)}
                          />
                        </div>
                      )}
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
                      isSelected={selectedCards.has(card.id)}
                      showCardType
                      highlightUnsetMinimum
                      flagNames={flagNames}
                      leadingAccessory={(
                        <div className="pt-1">
                          <input
                            type="checkbox"
                            aria-label={`Select ${card.name}`}
                            className="mt-2 h-4 w-4 cursor-pointer rounded border-border text-primary focus:ring-2 focus:ring-primary accent-primary"
                            checked={selectedCards.has(card.id)}
                            onChange={() => toggleCardSelection(card.id)}
                          />
                        </div>
                      )}
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

      {showStickyBar && (
        <div className="fixed bottom-6 left-1/2 z-40 w-full max-w-3xl -translate-x-1/2 rounded-2xl border bg-background/90 p-4 shadow-xl backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {selectedCount > 0
                  ? `${selectedCount} card${selectedCount === 1 ? '' : 's'} selected`
                  : 'Keeping cards tidy'}
              </p>
              <p className="text-xs text-muted-foreground">
                {changedCount > 0
                  ? `${changedCount} card${changedCount === 1 ? ' has' : 's have'} unsaved edits`
                  : 'Select cards to batch-edit or tweak details above'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {selectedCount > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => applyBatchFeatured(true)}
                    >
                      Feature on dashboard
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => applyBatchFeatured(false)}
                    >
                      Hide from dashboard
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => applyBatchType('cashback')}
                    >
                      Set to cashback
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => applyBatchType('miles')}
                    >
                      Set to miles
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={batchRate}
                      onChange={(e) => {
                        setBatchRate(e.target.value);
                        setBatchError('');
                      }}
                      placeholder="Rate"
                      className="h-9 w-24"
                      aria-label="Apply earning rate to selected cards"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={batchRate.trim() === ''}
                      onClick={handleApplyBatchRate}
                    >
                      Apply rate
                    </Button>
                  </div>
                  {batchError && (
                    <p className="w-full text-xs text-destructive">
                      {batchError}
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                  >
                    Clear selection
                  </Button>
                </>
              )}
              <Button
                onClick={handleSaveAll}
                disabled={changedCount === 0 || saving}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
