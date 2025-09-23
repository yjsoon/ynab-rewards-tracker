'use client';

import { memo, useCallback, useMemo, useState } from 'react';
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
  ShieldAlert,
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
  flagNames?: Partial<Record<YnabFlagColor, string>>;
}

const FLAG_SELECT_OPTIONS = YNAB_FLAG_COLORS.map((flag) => ({
  value: flag.value,
  label: flag.label,
}));

function getTimestamp(): string {
  return new Date().toISOString();
}

function generateId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Ignore and fall back
  }
  return `subcat-${Math.random().toString(36).slice(2, 10)}`;
}

function createSubcategory(
  flagColor: YnabFlagColor,
  rewardValue: number,
  flagNames?: Partial<Record<YnabFlagColor, string>>
): CardSubcategoryDraft {
  return {
    id: generateId(),
    name: flagNames?.[flagColor] ?? (flagColor === UNFLAGGED_FLAG.value ? UNFLAGGED_FLAG.label : YNAB_FLAG_COLORS.find((flag) => flag.value === flagColor)?.label ?? flagColor),
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

  return subcategories
    .map((subcat, index) => (subcat.priority === index ? subcat : {
      ...subcat,
      priority: index,
    }))
    .sort((a, b) => a.priority - b.priority);
}

// Memoized subcategory item component
const SubcategoryItem = memo(function SubcategoryItem({
  subcategory,
  index,
  totalCount,
  cardType,
  flagNames,
  usedFlagColours,
  duplicateFlags,
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
  duplicateFlags: Set<YnabFlagColor>;
  onUpdate: (id: string, updates: Partial<CardSubcategoryDraft>) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
}) {
  const isUnflagged = subcategory.flagColor === UNFLAGGED_FLAG.value;
  const flagDisplayName = flagNames?.[subcategory.flagColor] ?? (isUnflagged
    ? UNFLAGGED_FLAG.label
    : YNAB_FLAG_COLORS.find((flag) => flag.value === subcategory.flagColor)?.label ?? subcategory.flagColor
  );

  const showDuplicateWarning = duplicateFlags.has(subcategory.flagColor);
  const milesCard = cardType === 'miles';

  // Local state for input values with debouncing
  const [localName, setLocalName] = useState(subcategory.name);
  const [localReward, setLocalReward] = useState(subcategory.rewardValue);
  const [localMin, setLocalMin] = useState(subcategory.minimumSpend);
  const [localMax, setLocalMax] = useState(subcategory.maximumSpend);
  const [localMilesBlock, setLocalMilesBlock] = useState(subcategory.milesBlockSize);

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
      className={cn('relative border-border/60 transition-colors', !subcategory.active && 'opacity-75')}
    >
      {!isUnflagged && (
        <button
          type="button"
          onClick={() => onDelete(subcategory.id)}
          className="absolute right-3 top-3 text-destructive transition-colors hover:text-destructive/80"
          aria-label={`Remove ${subcategory.name}`}
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <CardContent className="flex flex-wrap items-end gap-3 pt-6 pb-4">
        <div className="flex flex-col gap-1 w-[180px]">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Flag
          </Label>
          {isUnflagged ? (
            <div className="flex items-center gap-2 text-sm font-medium">
              <Badge variant="secondary">{flagDisplayName}</Badge>
              <span className="text-xs text-muted-foreground">Default</span>
            </div>
          ) : (
            <Select
              value={subcategory.flagColor}
              onValueChange={(nextColour: YnabFlagColor) => onUpdate(subcategory.id, {
                flagColor: nextColour,
              })}
            >
              <SelectTrigger className="h-8 w-[160px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLAG_SELECT_OPTIONS.map((flag) => (
                  <SelectItem
                    key={flag.value}
                    value={flag.value}
                    disabled={flag.value !== subcategory.flagColor && usedFlagColours.has(flag.value)}
                  >
                    {flagNames?.[flag.value] ?? flag.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {showDuplicateWarning && !isUnflagged && (
            <div className="flex items-center gap-1 text-[11px] text-amber-600">
              <ShieldAlert className="h-3 w-3" />
              <span>Flag already used.</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 w-[180px]">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Name
          </Label>
          <Input
            value={localName}
            onChange={(e) => {
              setLocalName(e.target.value);
              debouncedUpdateName(e.target.value);
            }}
            className="h-8 text-sm"
            placeholder="Dining"
          />
        </div>

        <div className="flex flex-col gap-1 w-[92px]">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Reward
          </Label>
          <Input
            type="number"
            value={localReward ?? 0}
            onChange={(e) => {
              const val = Number(e.target.value) || 0;
              setLocalReward(val);
              debouncedUpdateReward(val);
            }}
            className="h-8 text-sm"
            step="0.1"
            min={0}
            placeholder={cardType === 'cashback' ? '2' : '1.5'}
          />
          <span className="text-[11px] text-muted-foreground">
            {cardType === 'cashback' ? '% back' : 'mi / $'}
          </span>
        </div>

        <div className="flex flex-col gap-1 w-[92px]">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Minimum
          </Label>
          <Input
            type="number"
            value={localMin ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? null : Number(e.target.value);
              setLocalMin(val);
              debouncedUpdateMin(val);
            }}
            className="h-8 text-sm"
            min={0}
            step="50"
            placeholder="0"
          />
        </div>

        <div className="flex flex-col gap-1 w-[92px]">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Maximum
          </Label>
          <Input
            type="number"
            value={localMax ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? null : Number(e.target.value);
              setLocalMax(val);
              debouncedUpdateMax(val);
            }}
            className="h-8 text-sm"
            min={0}
            step="50"
            placeholder="0"
          />
        </div>

        {milesCard && (
          <div className="flex flex-col gap-1 w-[92px]">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Miles block
            </Label>
            <Input
              type="number"
              value={localMilesBlock ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                setLocalMilesBlock(val);
                debouncedUpdateMilesBlock(val);
              }}
              className="h-8 text-sm"
              min={0}
              step="1"
              placeholder="Optional"
            />
          </div>
        )}

        <div className="ml-auto flex items-end gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id={`subcategory-active-${subcategory.id}`}
              checked={subcategory.active}
              onCheckedChange={(checked) => onUpdate(subcategory.id, { active: checked })}
            />
            <span className="text-xs text-muted-foreground">Active</span>
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded border border-border/60 text-muted-foreground transition-colors hover:bg-muted"
              onClick={() => onReorder(subcategory.id, 'up')}
              disabled={index === 0}
              aria-label="Move subcategory up"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded border border-border/60 text-muted-foreground transition-colors hover:bg-muted"
              onClick={() => onReorder(subcategory.id, 'down')}
              disabled={index === totalCount - 1}
              aria-label="Move subcategory down"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
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
  flagNames,
}: CardSubcategoriesEditorProps) {
  // Optimize sorting - only sort if needed
  const orderedSubcategories = useMemo(() => {
    const sorted = [...value].sort((a, b) => a.priority - b.priority);
    return sorted;
  }, [value]);

  const usedFlagColours = useMemo(
    () => new Set(orderedSubcategories.map((sub) => sub.flagColor)),
    [orderedSubcategories]
  );

  const unusedFlagColours = useMemo(() => {
    return YNAB_FLAG_COLORS.filter((flag) => !usedFlagColours.has(flag.value));
  }, [usedFlagColours]);

  const duplicateFlags = useMemo(() => {
    const occurrences = new Map<YnabFlagColor, number>();
    orderedSubcategories.forEach((sub) => {
      occurrences.set(sub.flagColor, (occurrences.get(sub.flagColor) ?? 0) + 1);
    });
    return new Set(Array.from(occurrences.entries()).filter(([, count]) => count > 1).map(([flag]) => flag));
  }, [orderedSubcategories]);

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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Subcategory rewards</h3>
          <p className="text-sm text-muted-foreground">
            Map YNAB flags to bespoke reward bands. Unflagged transactions fall back to the default rate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="subcategories-enabled" checked={enabled} onCheckedChange={handleToggle} />
          <Label htmlFor="subcategories-enabled" className="text-sm">
            {enabled ? 'Enabled' : 'Disabled'}
          </Label>
        </div>
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
              duplicateFlags={duplicateFlags}
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

// Export with React.memo for additional optimization
export const CardSubcategoriesEditor = memo(CardSubcategoriesEditorComponent);