'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useThemeGroups, useCreditCards, useSettings } from '@/hooks/useLocalStorage';
import { useAutoBackup } from '@/hooks/useAutoBackup';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Save,
  CreditCard as CreditCardIcon,
  Percent,
  AlertCircle,
  CheckCircle,
  ChevronDown,
} from 'lucide-react';
import { storage, type CardSubcategory, type CreditCard } from '@/lib/storage';
import { type CardEditState as SingleCardEditState } from '@/components/CardSettingsEditor';
import { CardSettingsCompact } from '@/components/CardSettingsCompact';
import { CardSettingsDialog } from '@/components/CardSettingsDialog';
import { ThemeGroupingManager } from '@/components/ThemeGroupingManager';
import { prepareSubcategoriesForSave } from '@/lib/subcategory-utils';
import { useSearchParams } from 'next/navigation';
import { featureFlags } from '@ynab-counter/app-core/config/featureFlags';
import { cn } from '@/lib/utils';

interface CardEditState {
  [cardId: string]: SingleCardEditState;
}

function CardRulesPageContent() {
  const { cards, updateCard } = useCreditCards();
  const { autoBackup } = useAutoBackup();
  const { themeGroups, saveThemeGroup, deleteThemeGroup } = useThemeGroups();
  const { settings } = useSettings();
  const searchParams = useSearchParams();
  const flagNames = useMemo(() => storage.getFlagNames(), []);
  const showThemes = featureFlags.recommendations;

  const [editState, setEditState] = useState<CardEditState>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [changedCards, setChangedCards] = useState<Set<string>>(new Set());
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [batchRate, setBatchRate] = useState('');
  const [batchError, setBatchError] = useState('');

  // New state for grid layout
  const [dialogCardId, setDialogCardId] = useState<string | null>(null);
  const [groupByType, setGroupByType] = useState(true);
  const [cashbackExpanded, setCashbackExpanded] = useState(true);
  const [milesExpanded, setMilesExpanded] = useState(true);

  // Group cards by type
  const cashbackCards = cards.filter(card => card.type === 'cashback');
  const milesCards = cards.filter(card => card.type === 'miles');

  // Initialize edit state from existing cards
  useEffect(() => {
    const initialState: CardEditState = {};
    cards.forEach(card => {
      initialState[card.id] = {
        earningRate: card.earningRate || 1,
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

  // Handle URL param for opening a specific card
  useEffect(() => {
    const cardId = searchParams?.get('card');
    if (cardId && cards.some(c => c.id === cardId)) {
      setDialogCardId(cardId);
    }
  }, [searchParams, cards]);

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

      // Auto-backup to cloud after save
      try {
        await autoBackup();
      } catch (backupErr) {
        // Silent failure for backup - main save succeeded
        console.error('Auto-backup failed:', backupErr);
      }
    } catch (error) {
      console.error('Failed to save changes:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleJumpToCard = (cardId: string) => {
    // Expand the relevant section if grouped
    if (groupByType) {
      const card = cards.find(c => c.id === cardId);
      if (card?.type === 'cashback') setCashbackExpanded(true);
      else if (card?.type === 'miles') setMilesExpanded(true);
    }

    // Delay scroll to let collapsible expand
    setTimeout(() => {
      const element = document.getElementById(`card-${cardId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('ring-2', 'ring-primary');
        setTimeout(() => {
          element.classList.remove('ring-2', 'ring-primary');
        }, 1500);
      }
    }, 50);
  };

  const selectedCount = selectedCards.size;
  const changedCount = changedCards.size;
  const showStickyBar = selectedCount > 0 || changedCount > 0;

  const dialogCard = dialogCardId ? cards.find(c => c.id === dialogCardId) : null;

  const renderCardGrid = (cardList: CreditCard[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cardList.map(card => (
        <div key={card.id} id={`card-${card.id}`}>
          <CardSettingsCompact
            card={card}
            state={editState[card.id] || {}}
            isChanged={changedCards.has(card.id)}
            isSelected={selectedCards.has(card.id)}
            onSelect={() => toggleCardSelection(card.id)}
            onClick={() => setDialogCardId(card.id)}
            onToggleFeatured={(featured) => handleFieldChange(card.id, 'featured', featured)}
          />
        </div>
      ))}
    </div>
  );

  if (cards.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="space-y-2 mb-6">
          <h1 className="text-3xl font-bold">Cards</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCardIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg text-muted-foreground mb-4">No cards configured yet</p>
            <p className="text-sm text-muted-foreground">
              Add cards in Settings to start managing them
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Cards</h1>
          <p className="text-muted-foreground">
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

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 rounded-lg bg-muted/30 border">
        <div className="flex items-center gap-2">
          <Checkbox
            id="group-by-type"
            checked={groupByType}
            onCheckedChange={(checked) => setGroupByType(checked === true)}
          />
          <Label htmlFor="group-by-type" className="text-sm cursor-pointer">
            Group by card type
          </Label>
        </div>

        <div className="h-6 border-l border-border hidden sm:block" />

        <Select onValueChange={handleJumpToCard}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Jump to card..." />
          </SelectTrigger>
          <SelectContent>
            {cards.map(card => (
              <SelectItem key={card.id} value={card.id}>
                <span className="flex items-center gap-2">
                  {card.type === 'cashback' ? (
                    <Percent className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <CreditCardIcon className="h-3 w-3 text-muted-foreground" />
                  )}
                  {card.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Card grid */}
      {groupByType ? (
        <div className="space-y-6">
          {/* Cashback section */}
          {cashbackCards.length > 0 && (
            <Collapsible open={cashbackExpanded} onOpenChange={setCashbackExpanded}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
                <ChevronDown className={cn(
                  'h-5 w-5 text-muted-foreground transition-transform',
                  !cashbackExpanded && '-rotate-90'
                )} />
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Percent className="h-4 w-4 text-muted-foreground" />
                  Cashback Cards
                  <Badge variant="secondary" className="ml-1">{cashbackCards.length}</Badge>
                </h2>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                {renderCardGrid(cashbackCards)}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Miles section */}
          {milesCards.length > 0 && (
            <Collapsible open={milesExpanded} onOpenChange={setMilesExpanded}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
                <ChevronDown className={cn(
                  'h-5 w-5 text-muted-foreground transition-transform',
                  !milesExpanded && '-rotate-90'
                )} />
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                  Miles Cards
                  <Badge variant="secondary" className="ml-1">{milesCards.length}</Badge>
                </h2>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                {renderCardGrid(milesCards)}
                {settings?.milesValuation && (
                  <Alert className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Miles are valued at ${settings.milesValuation} per mile for comparison purposes.
                      You can adjust this in Settings.
                    </AlertDescription>
                  </Alert>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

        </div>
      ) : (
        /* Ungrouped: single grid with all cards */
        <div>
          {renderCardGrid(cards)}
          {settings?.milesValuation && milesCards.length > 0 && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Miles are valued at ${settings.milesValuation} per mile for comparison purposes.
                You can adjust this in Settings.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Themes section (if enabled) */}
      {showThemes && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Theme Groups</h2>
          <ThemeGroupingManager
            cards={cards}
            themeGroups={themeGroups}
            onSaveGroup={saveThemeGroup}
            onDeleteGroup={deleteThemeGroup}
          />
        </div>
      )}

      {/* Dialog for editing card */}
      <CardSettingsDialog
        card={dialogCard ?? null}
        state={dialogCardId ? editState[dialogCardId] || {} : {}}
        open={dialogCardId !== null}
        onOpenChange={(open) => {
          if (!open) setDialogCardId(null);
        }}
        onFieldChange={(field, value) => {
          if (dialogCardId) {
            handleFieldChange(dialogCardId, field, value);
          }
        }}
        isChanged={dialogCardId ? changedCards.has(dialogCardId) : false}
        flagNames={flagNames}
      />

      {/* Sticky batch action bar */}
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

// Wrap in Suspense for useSearchParams during static generation
export default function CardRulesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    }>
      <CardRulesPageContent />
    </Suspense>
  );
}
