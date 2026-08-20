'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  ArrowDown,
  ArrowUp,
  PlusCircle,
  X,
} from 'lucide-react';
import type { CardSubcategory, CreditCard } from '@/lib/storage';
import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from '@/lib/ynab-constants';
import { cn } from '@/lib/utils';
import { useDebouncedCallback } from '@/hooks/useDebounce';

export type CardSubcategoryDraft = CardSubcategory;

interface CardSubcategoriesEditorProps {
  cardType: CreditCard['type'];
  enabled: boolean;
  value: CardSubcategoryDraft[];
  onToggleEnabled: (enabled: boolean) => void;
  onChange: (next: CardSubcategoryDraft[]) => void;
  baseRewardRate: number;
  pooledCaps?: boolean;
  flagNames?: Partial<Record<YnabFlagColor, string>>;
}

const FLAG_SELECT_OPTIONS = YNAB_FLAG_COLORS.map((flag) => ({
  value: flag.value,
  label: flag.label,
}));

// Map flag colors to actual colors for visual representation
const FLAG_COLOR_MAP: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  unflagged: '#6b7280',
};

function getTimestamp(): string {
  return new Date().toISOString();
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `subcat-${Math.random().toString(36).slice(2, 10)}`;
}

function getFallbackFlagName(
  flagColor: YnabFlagColor,
  flagNames?: Partial<Record<YnabFlagColor, string>>
): string {
  if (flagNames?.[flagColor]) {
    return flagNames[flagColor];
  }
  if (flagColor === UNFLAGGED_FLAG.value) {
    return UNFLAGGED_FLAG.label;
  }
  const flag = YNAB_FLAG_COLORS.find(f => f.value === flagColor);
  return flag?.label ?? flagColor;
}

function getRewardTypeDisplay(cardType: 'cashback' | 'miles'): {
  unit: string;
  placeholder: string;
} {
  return cardType === 'cashback'
    ? { unit: '% back', placeholder: '2' }
    : { unit: 'miles/$', placeholder: '1.5' };
}

function createSubcategory(
  flagColor: YnabFlagColor,
  rewardValue: number,
  flagNames?: Partial<Record<YnabFlagColor, string>>
): CardSubcategoryDraft {
  return {
    id: generateId(),
    name: getFallbackFlagName(flagColor, flagNames),
    flagColor,
    rewardValue,
    milesBlockSize: null,
    minimumSpend: null,
    maximumSpend: null,
    priority: 0,
    active: true,
    createdAt: getTimestamp(),
    updatedAt: getTimestamp(),
  };
}

function normalisePriorities(subcategories: CardSubcategoryDraft[]): CardSubcategoryDraft[] {
  // Only update priority if it's different, avoiding unnecessary object creation
  const needsUpdate = subcategories.some((subcat, index) => subcat.priority !== index);
  if (!needsUpdate) return subcategories;

  return subcategories.map((subcat, index) =>
    subcat.priority === index ? subcat : {
      ...subcat,
      priority: index,
    }
  );
}

const SubcategoryItem = memo(function SubcategoryItem({
  subcategory,
  index,
  totalCount,
  cardType,
  flagNames,
  usedFlagColours,
  pooledCaps,
  onUpdate,
  onDelete,
  onReorder,
}: {
  subcategory: CardSubcategoryDraft;
  index: number;
  totalCount: number;
  cardType: CreditCard['type'];
  flagNames?: Partial<Record<YnabFlagColor, string>>;
  usedFlagColours: Set<YnabFlagColor>;
  pooledCaps?: boolean;
  onUpdate: (id: string, updates: Partial<CardSubcategoryDraft>) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
}) {
  const isUnflagged = subcategory.flagColor === UNFLAGGED_FLAG.value;
  const flagDisplayName = flagNames?.[subcategory.flagColor] ?? (isUnflagged
    ? UNFLAGGED_FLAG.label
    : YNAB_FLAG_COLORS.find((flag) => flag.value === subcategory.flagColor)?.label ?? subcategory.flagColor
  );

  const milesCard = cardType === 'miles';

  // Local state for input values with debouncing
  const [localName, setLocalName] = useState(subcategory.name);
  const [localReward, setLocalReward] = useState(subcategory.rewardValue);
  const [localMin, setLocalMin] = useState(subcategory.minimumSpend);
  const [localMax, setLocalMax] = useState(subcategory.maximumSpend);
  const [localMilesBlock, setLocalMilesBlock] = useState(subcategory.milesBlockSize);
  const [localExcluded, setLocalExcluded] = useState(subcategory.excludeFromRewards || false);

  // Sync local state when subcategory prop changes (after save/re-render)
  useEffect(() => {
    setLocalName(subcategory.name);
    setLocalReward(subcategory.rewardValue);
    setLocalMin(subcategory.minimumSpend);
    setLocalMax(subcategory.maximumSpend);
    setLocalMilesBlock(subcategory.milesBlockSize);
    setLocalExcluded(subcategory.excludeFromRewards || false);
  }, [subcategory.name, subcategory.rewardValue, subcategory.minimumSpend, subcategory.maximumSpend, subcategory.milesBlockSize, subcategory.excludeFromRewards]);

  // Debounced update callbacks
  const debouncedUpdateName = useDebouncedCallback(
    (value: string) => onUpdate(subcategory.id, { name: value }),
    300
  );

  const debouncedUpdateReward = useDebouncedCallback(
    (value: number) => onUpdate(subcategory.id, { rewardValue: value }),
    300
  );

  const debouncedUpdateMin = useDebouncedCallback(
    (value: number | null) => onUpdate(subcategory.id, { minimumSpend: value }),
    300
  );

  const debouncedUpdateMax = useDebouncedCallback(
    (value: number | null) => onUpdate(subcategory.id, { maximumSpend: value }),
    300
  );

  const debouncedUpdateMilesBlock = useDebouncedCallback(
    (value: number | null) => onUpdate(subcategory.id, { milesBlockSize: value }),
    300
  );

  return (
    <Card
      className={cn(
        'relative transition-all hover:shadow-sm overflow-hidden',
        subcategory.active
          ? 'border-border/60 bg-card'
          : 'border-border/30 bg-muted/30 opacity-60',
        localExcluded && 'ring-1 ring-orange-500/20'
      )}
    >
      {!isUnflagged && (
        <button
          type="button"
          onClick={() => onDelete(subcategory.id)}
          className="absolute right-1 top-1 rounded-full p-1 text-muted-foreground/60 transition-all hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Remove ${subcategory.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <CardContent className="py-3 sm:py-4">
        {/* Desktop: single row layout */}
        <div className="hidden lg:flex lg:items-center lg:gap-3">
          {/* Flag + Name */}
          <div className="flex gap-2 items-center">
            {isUnflagged ? (
              <div className="flex items-center gap-2 min-w-[140px]">
                <div className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 border border-border/40" />
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-medium truncate">{flagDisplayName}</span>
                  <Badge variant="outline" className="text-[10px] uppercase shrink-0">Default</Badge>
                </div>
              </div>
            ) : (
              <Select
                value={subcategory.flagColor}
                onValueChange={(nextColour: YnabFlagColor) => onUpdate(subcategory.id, {
                  flagColor: nextColour,
                })}
              >
                <SelectTrigger className="h-10 w-[120px] border-border/40 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FLAG_SELECT_OPTIONS.map((flag) => {
                    const isUsed = flag.value !== subcategory.flagColor && usedFlagColours.has(flag.value);
                    return (
                      <SelectItem
                        key={flag.value}
                        value={flag.value}
                        disabled={isUsed}
                        className={isUsed ? 'opacity-50' : ''}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full border border-border/40"
                            style={{ backgroundColor: FLAG_COLOR_MAP[flag.value] || '#6b7280' }}
                          />
                          <span>{flagNames?.[flag.value] ?? flag.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
            <Input
              value={localName}
              onChange={(e) => {
                setLocalName(e.target.value);
                debouncedUpdateName(e.target.value);
              }}
              className="h-10 w-[140px] border-border/40 bg-background/50 font-medium"
              placeholder="Category name"
            />
          </div>

          {/* Rate + Min/Max */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={localExcluded ? 0 : (localReward ?? 0)}
                onChange={(e) => {
                  const val = Number(e.target.value) || 0;
                  setLocalReward(val);
                  debouncedUpdateReward(val);
                }}
                className={cn(
                  "h-10 w-16 border-border/40 bg-background/50 text-center font-semibold",
                  localExcluded && "opacity-50 cursor-not-allowed"
                )}
                step="0.1"
                min={0}
                disabled={localExcluded}
                placeholder={getRewardTypeDisplay(cardType).placeholder}
              />
              <span className={cn(
                "text-sm font-medium text-muted-foreground whitespace-nowrap",
                localExcluded && "opacity-50"
              )}>
                {getRewardTypeDisplay(cardType).unit}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase">Min</span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={localMin ?? ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : Number(e.target.value);
                    setLocalMin(val);
                    debouncedUpdateMin(val);
                  }}
                  className="h-10 w-20 border-border/40 bg-background/50 pl-6"
                  min={0}
                  step="50"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase">
                {pooledCaps ? 'Period cap' : 'Max'}
              </span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={localMax ?? ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : Number(e.target.value);
                    setLocalMax(val);
                    debouncedUpdateMax(val);
                  }}
                  className="h-10 w-20 border-border/40 bg-background/50 pl-6"
                  min={0}
                  step="50"
                  placeholder="0"
                />
              </div>
            </div>

            {milesCard && (
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-muted-foreground uppercase">Block</span>
                <Input
                  type="number"
                  value={localMilesBlock ?? ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : Number(e.target.value);
                    setLocalMilesBlock(val);
                    debouncedUpdateMilesBlock(val);
                  }}
                  className="h-10 w-14 border-border/40 bg-background/50 text-center"
                  min={0}
                  step="1"
                  placeholder="—"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-auto">
            {!isUnflagged && (
              <button
                type="button"
                onClick={() => {
                  const newExclude = !localExcluded;
                  setLocalExcluded(newExclude);
                  onUpdate(subcategory.id, {
                    excludeFromRewards: newExclude,
                    rewardValue: newExclude ? 0 : subcategory.rewardValue
                  });
                }}
                className={cn(
                  "px-2 py-1 text-[10px] font-medium uppercase tracking-wider rounded-md transition-all",
                  localExcluded
                    ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                )}
              >
                {localExcluded ? 'Excluded' : 'Exclude'}
              </button>
            )}
            <div className="flex gap-1">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/60 transition-all hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={() => onReorder(subcategory.id, 'up')}
                disabled={index === 0}
                aria-label="Move up"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/60 transition-all hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={() => onReorder(subcategory.id, 'down')}
                disabled={index === totalCount - 1}
                aria-label="Move down"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <Switch
              id={`subcategory-active-${subcategory.id}`}
              checked={subcategory.active}
              onCheckedChange={(checked) => onUpdate(subcategory.id, { active: checked })}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>
        </div>

        {/* Mobile: compact stacked layout */}
        <div className="lg:hidden space-y-3">
          {/* Header row: Flag indicator + Name + Actions */}
          <div className="flex items-center gap-2">
            {isUnflagged ? (
              <div className="h-7 w-7 shrink-0 rounded-md bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 border border-border/40" />
            ) : (
              <Select
                value={subcategory.flagColor}
                onValueChange={(nextColour: YnabFlagColor) => onUpdate(subcategory.id, {
                  flagColor: nextColour,
                })}
              >
                <SelectTrigger className="h-7 w-7 p-0 border-0 bg-transparent [&>svg]:hidden">
                  <div
                    className="h-7 w-7 rounded-md border border-border/40"
                    style={{ backgroundColor: FLAG_COLOR_MAP[subcategory.flagColor] || '#6b7280' }}
                  />
                </SelectTrigger>
                <SelectContent>
                  {FLAG_SELECT_OPTIONS.map((flag) => {
                    const isUsed = flag.value !== subcategory.flagColor && usedFlagColours.has(flag.value);
                    return (
                      <SelectItem
                        key={flag.value}
                        value={flag.value}
                        disabled={isUsed}
                        className={isUsed ? 'opacity-50' : ''}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full border border-border/40"
                            style={{ backgroundColor: FLAG_COLOR_MAP[flag.value] || '#6b7280' }}
                          />
                          <span>{flagNames?.[flag.value] ?? flag.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <Input
                value={localName}
                onChange={(e) => {
                  setLocalName(e.target.value);
                  debouncedUpdateName(e.target.value);
                }}
                className="h-7 text-sm font-medium border-transparent bg-transparent px-1 hover:border-border/40 focus:border-border/40 focus:bg-background/50"
                placeholder={flagDisplayName}
              />
              {isUnflagged && (
                <Badge variant="outline" className="text-[9px] uppercase shrink-0 px-1 py-0">Default</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 transition-all hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={() => onReorder(subcategory.id, 'up')}
                disabled={index === 0}
                aria-label="Move up"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 transition-all hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={() => onReorder(subcategory.id, 'down')}
                disabled={index === totalCount - 1}
                aria-label="Move down"
              >
                <ArrowDown className="h-3 w-3" />
              </button>
              <Switch
                id={`subcategory-active-mobile-${subcategory.id}`}
                checked={subcategory.active}
                onCheckedChange={(checked) => onUpdate(subcategory.id, { active: checked })}
                className="data-[state=checked]:bg-emerald-500 scale-90"
              />
            </div>
          </div>

          {/* Values row: Rate, Min, Max in a clean grid */}
          <div className="grid grid-cols-3 gap-2">
            {/* Rate */}
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {cardType === 'cashback' ? 'Rate' : 'Miles'}
              </span>
              <div className="flex items-center">
                <Input
                  type="number"
                  value={localExcluded ? 0 : (localReward ?? 0)}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    setLocalReward(val);
                    debouncedUpdateReward(val);
                  }}
                  className={cn(
                    "h-9 border-border/40 bg-background/50 text-center font-semibold text-sm",
                    localExcluded && "opacity-50 cursor-not-allowed"
                  )}
                  step="0.1"
                  min={0}
                  disabled={localExcluded}
                />
                <span className={cn(
                  "ml-1 text-[10px] text-muted-foreground shrink-0",
                  localExcluded && "opacity-50"
                )}>
                  {cardType === 'cashback' ? '%' : 'mpd'}
                </span>
              </div>
            </div>

            {/* Min */}
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Min</span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={localMin ?? ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : Number(e.target.value);
                    setLocalMin(val);
                    debouncedUpdateMin(val);
                  }}
                  className="h-9 border-border/40 bg-background/50 pl-5 text-sm"
                  min={0}
                  step="50"
                  placeholder="—"
                />
              </div>
            </div>

            {/* Max */}
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {pooledCaps ? 'Period cap' : 'Max'}
              </span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={localMax ?? ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : Number(e.target.value);
                    setLocalMax(val);
                    debouncedUpdateMax(val);
                  }}
                  className="h-9 border-border/40 bg-background/50 pl-5 text-sm"
                  min={0}
                  step="50"
                  placeholder="—"
                />
              </div>
            </div>
          </div>

          {/* Block size for miles cards */}
          {milesCard && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Block size</span>
              <Input
                type="number"
                value={localMilesBlock ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : Number(e.target.value);
                  setLocalMilesBlock(val);
                  debouncedUpdateMilesBlock(val);
                }}
                className="h-8 w-16 border-border/40 bg-background/50 text-center text-sm"
                min={0}
                step="1"
                placeholder="—"
              />
            </div>
          )}

          {/* Exclude toggle for non-default */}
          {!isUnflagged && (
            <button
              type="button"
              onClick={() => {
                const newExclude = !localExcluded;
                setLocalExcluded(newExclude);
                onUpdate(subcategory.id, {
                  excludeFromRewards: newExclude,
                  rewardValue: newExclude ? 0 : subcategory.rewardValue
                });
              }}
              className={cn(
                "w-full py-1.5 text-[10px] font-medium uppercase tracking-wider rounded-md transition-all text-center",
                localExcluded
                  ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                  : "bg-muted/50 text-muted-foreground"
              )}
            >
              {localExcluded ? 'Excluded from rewards' : 'Tap to exclude from rewards'}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

function CardSubcategoriesEditorComponent({
  cardType,
  enabled,
  value,
  onToggleEnabled,
  onChange,
  baseRewardRate,
  pooledCaps,
  flagNames,
}: CardSubcategoriesEditorProps) {
  // Sort by priority to maintain consistent order
  const orderedSubcategories = useMemo(() =>
    [...value].sort((a, b) => a.priority - b.priority),
    [value]
  );

  const usedFlagColours = useMemo(
    () => new Set(orderedSubcategories.map((sub) => sub.flagColor)),
    [orderedSubcategories]
  );

  const unusedFlagColours = useMemo(() =>
    YNAB_FLAG_COLORS.filter((flag) => !usedFlagColours.has(flag.value)),
    [usedFlagColours]
  );

  // Memoized callbacks
  const handleToggle = useCallback((nextEnabled: boolean) => {
    onToggleEnabled(nextEnabled);
    if (nextEnabled && value.length === 0) {
      const defaultSubcategories = [
        createSubcategory(UNFLAGGED_FLAG.value, baseRewardRate, flagNames),
      ];
      onChange(normalisePriorities(defaultSubcategories));
    }
  }, [onToggleEnabled, onChange, value.length, baseRewardRate, flagNames]);

  const handleUpdate = useCallback((id: string, updates: Partial<CardSubcategoryDraft>) => {
    const next = orderedSubcategories.map((sub) =>
      sub.id === id
        ? {
            ...sub,
            ...updates,
            updatedAt: getTimestamp(),
          }
        : sub
    );
    onChange(normalisePriorities(next));
  }, [orderedSubcategories, onChange]);

  const handleAdd = useCallback(() => {
    const nextFlag = unusedFlagColours[0]?.value;
    if (!nextFlag) return;
    const nextSubcategory = createSubcategory(nextFlag, baseRewardRate, flagNames);
    const next = normalisePriorities([...orderedSubcategories, nextSubcategory]);
    onChange(next);
  }, [unusedFlagColours, orderedSubcategories, onChange, baseRewardRate, flagNames]);

  const handleDelete = useCallback((id: string) => {
    const sub = orderedSubcategories.find((entry) => entry.id === id);
    if (!sub || sub.flagColor === UNFLAGGED_FLAG.value) return;
    const next = orderedSubcategories.filter((entry) => entry.id !== id);
    onChange(normalisePriorities(next));
  }, [orderedSubcategories, onChange]);

  const handleReorder = useCallback((id: string, direction: 'up' | 'down') => {
    const index = orderedSubcategories.findIndex((entry) => entry.id === id);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderedSubcategories.length) return;
    const next = [...orderedSubcategories];
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    onChange(normalisePriorities(next));
  }, [orderedSubcategories, onChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Switch id="subcategories-enabled" checked={enabled} onCheckedChange={handleToggle} />
        <Label htmlFor="subcategories-enabled" className="text-sm">
          {enabled ? 'Enabled' : 'Disabled'}
        </Label>
      </div>

      {enabled ? (
        <div className="space-y-4">
          {orderedSubcategories.map((subcategory, index) => (
            <SubcategoryItem
              key={subcategory.id}
              subcategory={subcategory}
              index={index}
              totalCount={orderedSubcategories.length}
              cardType={cardType}
              flagNames={flagNames}
              usedFlagColours={usedFlagColours}
              pooledCaps={pooledCaps}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onReorder={handleReorder}
            />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {unusedFlagColours.length > 0
                ? `${unusedFlagColours.length} flag colour${unusedFlagColours.length === 1 ? '' : 's'} available`
                : 'All flag colours are in use'}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAdd}
              disabled={unusedFlagColours.length === 0}
              className="gap-2"
            >
              <PlusCircle className="h-4 w-4" />
              Add subcategory
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 p-4 text-sm text-muted-foreground">
          Toggle on to tailor reward rates by flag colour.
        </div>
      )}
    </div>
  );
}

export const CardSubcategoriesEditor = memo(CardSubcategoriesEditorComponent);
