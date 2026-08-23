'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
import { EmptyCardsIcon } from '@/components/icons/BrandIcons';
import { storage, type CardSubcategory, type CreditCard } from '@/lib/storage';
import { type CardEditState as SingleCardEditState } from '@/components/CardSettingsEditor';
import { CardSettingsCompact } from '@/components/CardSettingsCompact';
import { CardSettingsDialog } from '@/components/CardSettingsDialog';
import { ThemeGroupingManager } from '@/components/ThemeGroupingManager';
import { prepareSubcategoriesForSave } from '@/lib/subcategory-utils';
import { featureFlags } from '@ynab-counter/app-core/config/featureFlags';
import { cn } from '@/lib/utils';

interface CardEditState {
  [cardId: string]: SingleCardEditState;
}

interface AllCardsTabProps {
  initialCardId?: string | null;
}

export const createCardEditState = (card: CreditCard): SingleCardEditState => ({
  earningRate: card.earningRate ?? null,
  earningBlockSize: card.earningBlockSize,
  minimumSpend: card.minimumSpend,
  maximumSpend: card.maximumSpend,
  billingCycleType: card.billingCycle?.type || 'calendar',
  billingCycleDay: card.billingCycle?.dayOfMonth || 1,
  rewardPeriodEnabled: Boolean(card.rewardPeriod),
  rewardPeriodMonthCount: card.rewardPeriod?.monthCount ?? 3,
  rewardPeriodAnchorDate: card.rewardPeriod?.anchorDate ?? '',
  rewardPeriodMonthlyMinimum: card.rewardPeriod?.monthlyMinimumSpend ?? 0,
  promotionalPeriodEnabled: Boolean(card.promotionalPeriod),
  promotionalPeriodStart: card.promotionalPeriod?.startDate ?? '',
  promotionalPeriodEnd: card.promotionalPeriod?.endDate ?? '',
  promotionalPeriodDescription: card.promotionalPeriod?.description ?? '',
  featured: card.featured ?? true,
  subcategoriesEnabled: card.subcategoriesEnabled ?? false,
  subcategories: card.subcategories?.map(sub => ({ ...sub })) ?? [],
  spendingTiers: card.spendingTiers?.map((tier) => ({
    ...tier,
    subcategories: tier.subcategories?.map((subcategory) => ({ ...subcategory })),
  })) ?? [],
});

export const isValidDateValue = (value: string | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
};

export function AllCardsTab({ initialCardId }: AllCardsTabProps) {
  const { cards, updateCard } = useCreditCards();
  const { autoBackup } = useAutoBackup();
  const { themeGroups, saveThemeGroup, deleteThemeGroup } = useThemeGroups();
  const { settings } = useSettings();
  const flagNames = useMemo(() => storage.getFlagNames(), []);
  const showThemes = featureFlags.recommendations;

  const [editState, setEditState] = useState<CardEditState>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [changedCards, setChangedCards] = useState<Set<string>>(new Set());
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [batchRate, setBatchRate] = useState('');
  const [batchError, setBatchError] = useState('');

  const [dialogCardId, setDialogCardId] = useState<string | null>(null);
  const dialogInitialState = useRef<SingleCardEditState | null>(null);
  const dialogWasChanged = useRef(false);
  const [groupByType, setGroupByType] = useState(true);
  const [cashbackExpanded, setCashbackExpanded] = useState(true);
  const [milesExpanded, setMilesExpanded] = useState(true);

  const cashbackCards = cards.filter(card => card.type === 'cashback');
  const milesCards = cards.filter(card => card.type === 'miles');

  useEffect(() => {
    const initialState: CardEditState = {};
    cards.forEach(card => {
      initialState[card.id] = createCardEditState(card);
    });
    setEditState(initialState);
    setChangedCards(new Set());
    setSelectedCards(new Set());
  }, [cards]);

  useEffect(() => {
    if (initialCardId && cards.some(c => c.id === initialCardId)) {
      const card = cards.find(c => c.id === initialCardId)!;
      dialogInitialState.current = createCardEditState(card);
      dialogWasChanged.current = false;
      setDialogCardId(initialCardId);
    }
  }, [initialCardId, cards]);

  const handleFieldChange = (cardId: string, field: keyof SingleCardEditState, value: unknown) => {
    setEditState(prev => ({
      ...prev,
      [cardId]: { ...prev[cardId], [field]: value },
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
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      if (next.size === 0) setBatchError('');
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
        next[cardId] = { ...next[cardId], featured };
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
        next[cardId] = { ...next[cardId], type };
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
        next[cardId] = { ...next[cardId], earningRate: parsed };
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
    for (const cardId of changedCards) {
      const card = cards.find((candidate) => candidate.id === cardId);
      const changes = editState[cardId];
      if (!card || !changes) continue;
      if (
        changes.rewardPeriodEnabled &&
        !isValidDateValue(changes.rewardPeriodAnchorDate)
      ) {
        setBatchError(`${card.name} requires a valid start date for its multi-month reward period.`);
        return;
      }
      const thresholds = [
        changes.minimumSpend ?? 0,
        ...(changes.spendingTiers ?? card.spendingTiers ?? []).map(({ spendThreshold }) => spendThreshold),
      ];
      if (new Set(thresholds).size !== thresholds.length) {
        setBatchError(`${card.name} has two spend-based reward tiers with the same threshold.`);
        return;
      }
    }

    const promotionsToRemove = [...changedCards].flatMap((cardId) => {
      const card = cards.find((candidate) => candidate.id === cardId);
      const changes = editState[cardId];
      return card?.promotionalPeriod && changes?.rewardPeriodEnabled ? [card.name] : [];
    });
    if (
      promotionsToRemove.length > 0 &&
      !window.confirm(
        `Saving will remove the promotional period from ${promotionsToRemove.join(', ')} because a multi-month reward period overrides it. Continue?`,
      )
    ) {
      return;
    }

    setSaving(true);
    setSaveSuccess(false);
    setBatchError('');
    try {
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
          maximumSpend: changes.maximumSpend,
          billingCycle: changes.billingCycleType === 'billing'
            ? { type: 'billing', dayOfMonth: changes.billingCycleDay }
            : { type: 'calendar' },
          rewardPeriod: changes.rewardPeriodEnabled && changes.rewardPeriodAnchorDate
            ? {
                monthCount: changes.rewardPeriodMonthCount ?? 3,
                anchorDate: changes.rewardPeriodAnchorDate,
                monthlyMinimumSpend: changes.rewardPeriodMonthlyMinimum ?? 0,
              }
            : undefined,
          promotionalPeriod: changes.rewardPeriodEnabled
            ? undefined
            : changes.promotionalPeriodEnabled && changes.promotionalPeriodEnd
              ? {
                  startDate: changes.promotionalPeriodStart || null,
                  endDate: changes.promotionalPeriodEnd,
                  description: changes.promotionalPeriodDescription || undefined,
                }
              : undefined,
          featured: changes.featured !== undefined ? changes.featured : (card.featured ?? true),
          subcategoriesEnabled: nextSubEnabled,
          subcategories: nextSubcategories,
          spendingTiers: changes.spendingTiers ?? card.spendingTiers ?? [],
        };
        updateCard(updatedCard);
      }
      setChangedCards(new Set());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      try {
        await autoBackup();
      } catch {
      }
    } catch (error) {
      console.error('Failed to save changes:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleJumpToCard = (cardId: string) => {
    if (groupByType) {
      const card = cards.find(c => c.id === cardId);
      if (card?.type === 'cashback') setCashbackExpanded(true);
      else if (card?.type === 'miles') setMilesExpanded(true);
    }
    setTimeout(() => {
      const element = document.getElementById(`card-${cardId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('ring-2', 'ring-primary');
        setTimeout(() => element.classList.remove('ring-2', 'ring-primary'), 1500);
      }
    }, 50);
  };

  const selectedCount = selectedCards.size;
  const changedCount = changedCards.size;
  const showStickyBar = selectedCount > 0 || changedCount > 0;
  const dialogCard = dialogCardId ? cards.find(c => c.id === dialogCardId) : null;

  const openDialog = (cardId: string) => {
    const card = cards.find((candidate) => candidate.id === cardId);
    if (!card) return;
    dialogInitialState.current = editState[cardId] ?? createCardEditState(card);
    dialogWasChanged.current = changedCards.has(cardId);
    setDialogCardId(cardId);
  };

  const closeDialog = () => {
    if (dialogCardId && dialogInitialState.current && dialogCard) {
      const cardWasSavedWhileOpen = !changedCards.has(dialogCardId);
      setEditState((previous) => ({
        ...previous,
        [dialogCardId]: cardWasSavedWhileOpen
          ? createCardEditState(dialogCard)
          : dialogInitialState.current!,
      }));
      setChangedCards((previous) => {
        const next = new Set(previous);
        if (!cardWasSavedWhileOpen && dialogWasChanged.current) next.add(dialogCardId);
        else next.delete(dialogCardId);
        return next;
      });
    }
    dialogInitialState.current = null;
    dialogWasChanged.current = false;
    setDialogCardId(null);
  };

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
            onClick={() => openDialog(card.id)}
            onToggleFeatured={(featured) => handleFieldChange(card.id, 'featured', featured)}
          />
        </div>
      ))}
    </div>
  );

  if (cards.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <EmptyCardsIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground mb-4">No cards configured yet</p>
          <p className="text-sm text-muted-foreground">
            Add cards in Settings to start managing them
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
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
        </div>
        <Button
          onClick={handleSaveAll}
          disabled={changedCount === 0 || saving}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save all changes'}
        </Button>
      </div>

      {saveSuccess && (
        <Alert className="mb-6 border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertDescription className="text-green-700 dark:text-green-300">
            All changes saved successfully!
          </AlertDescription>
        </Alert>
      )}

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

      {groupByType ? (
        <div className="space-y-6">
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
                  <span className="text-sm font-normal text-muted-foreground tabular-nums">{cashbackCards.length}</span>
                </h2>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                {renderCardGrid(cashbackCards)}
              </CollapsibleContent>
            </Collapsible>
          )}
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
                  <span className="text-sm font-normal text-muted-foreground tabular-nums">{milesCards.length}</span>
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

      <CardSettingsDialog
        card={dialogCard ?? null}
        state={dialogCardId ? editState[dialogCardId] || {} : {}}
        open={dialogCardId !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        onFieldChange={(field, value) => {
          if (dialogCardId) handleFieldChange(dialogCardId, field, value);
        }}
        isChanged={dialogCardId ? changedCards.has(dialogCardId) : false}
        flagNames={flagNames}
      />

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
                    <Button variant="outline" size="sm" onClick={() => applyBatchFeatured(true)}>
                      Feature on dashboard
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => applyBatchFeatured(false)}>
                      Hide from dashboard
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => applyBatchType('cashback')}>
                      Set to cashback
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => applyBatchType('miles')}>
                      Set to miles
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={batchRate}
                      onChange={(e) => { setBatchRate(e.target.value); setBatchError(''); }}
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
                    <p className="w-full text-xs text-destructive">{batchError}</p>
                  )}
                  <Button variant="ghost" size="sm" onClick={clearSelection}>
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
