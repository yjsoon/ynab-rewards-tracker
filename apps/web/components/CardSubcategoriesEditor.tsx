'use client';

import { useMemo } from 'react';
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
  MinusCircle,
  PlusCircle,
  ShieldAlert,
} from 'lucide-react';
import type { CardSubcategory, CreditCard } from '@/lib/storage';
import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from '@/lib/ynab-constants';
import { cn } from '@/lib/utils';

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
  return subcategories
    .map((subcat, index) => ({
      ...subcat,
      priority: index,
    }))
    .sort((a, b) => a.priority - b.priority);
}

export function CardSubcategoriesEditor({
  cardType,
  enabled,
  value,
  onToggleEnabled,
  onChange,
  baseRewardRate,
  flagNames,
}: CardSubcategoriesEditorProps) {
  const orderedSubcategories = useMemo(() => normalisePriorities(value), [value]);

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

  const milesCard = cardType === 'miles';

  const handleToggle = (nextEnabled: boolean) => {
    onToggleEnabled(nextEnabled);
    if (nextEnabled && orderedSubcategories.length === 0) {
      const defaultSubcategories = [
        createSubcategory(UNFLAGGED_FLAG.value, baseRewardRate, flagNames),
      ];
      onChange(normalisePriorities(defaultSubcategories));
    }
  };

  const handleUpdate = (id: string, updates: Partial<CardSubcategoryDraft>) => {
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
  };

  const handleAdd = () => {
    const nextFlag = unusedFlagColours[0]?.value;
    if (!nextFlag) return;
    const nextSubcategory = createSubcategory(nextFlag, baseRewardRate, flagNames);
    const next = normalisePriorities([...orderedSubcategories, nextSubcategory]);
    onChange(next);
  };

  const handleDelete = (id: string) => {
    const sub = orderedSubcategories.find((entry) => entry.id === id);
    if (!sub || sub.flagColor === UNFLAGGED_FLAG.value) return;
    const next = orderedSubcategories.filter((entry) => entry.id !== id);
    onChange(normalisePriorities(next));
  };

  const handleReorder = (id: string, direction: 'up' | 'down') => {
    const index = orderedSubcategories.findIndex((entry) => entry.id === id);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderedSubcategories.length) return;
    const next = [...orderedSubcategories];
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    onChange(normalisePriorities(next));
  };

  const renderSubcategory = (subcategory: CardSubcategoryDraft, index: number) => {
    const isUnflagged = subcategory.flagColor === UNFLAGGED_FLAG.value;
    const flagDisplayName = flagNames?.[subcategory.flagColor] ?? (isUnflagged
      ? UNFLAGGED_FLAG.label
      : YNAB_FLAG_COLORS.find((flag) => flag.value === subcategory.flagColor)?.label ?? subcategory.flagColor
    );

    const showDuplicateWarning = duplicateFlags.has(subcategory.flagColor);

    return (
      <Card key={subcategory.id} className={cn('border-border/70', !subcategory.active && 'opacity-75')}> 
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-1 flex-col gap-4 md:flex-row md:items-center">
              <div className="flex flex-col gap-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Flag colour
                </Label>
                {isUnflagged ? (
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Badge variant="secondary">{flagDisplayName}</Badge>
                    <span className="text-xs text-muted-foreground">Always available</span>
                  </div>
                ) : (
                  <Select
                    value={subcategory.flagColor}
                    onValueChange={(nextColour: YnabFlagColor) => handleUpdate(subcategory.id, {
                      flagColor: nextColour,
                    })}
                  >
                    <SelectTrigger className="w-[160px]">
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
                  <div className="flex items-center gap-2 text-xs text-amber-600">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Flag already assigned. Pick a different colour.</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Name
                </Label>
                <Input
                  value={subcategory.name}
                  onChange={(event) => handleUpdate(subcategory.id, { name: event.target.value })}
                  className="w-full md:w-[200px]"
                  placeholder="Dining"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Reward rate
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={subcategory.rewardValue ?? 0}
                    onChange={(event) => handleUpdate(subcategory.id, {
                      rewardValue: Number(event.target.value) || 0,
                    })}
                    className="w-28"
                    step="0.1"
                    min={0}
                  />
                  <span className="text-xs text-muted-foreground">
                    {cardType === 'cashback' ? '% cashback' : 'miles per dollar'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 md:flex-col md:items-end md:gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleReorder(subcategory.id, 'up')}
                disabled={index === 0}
                aria-label="Move subcategory up"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleReorder(subcategory.id, 'down')}
                disabled={index === orderedSubcategories.length - 1}
                aria-label="Move subcategory down"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Minimum spend
              </Label>
              <Input
                type="number"
                value={subcategory.minimumSpend ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  handleUpdate(subcategory.id, {
                    minimumSpend: value === '' ? null : Number(value),
                  });
                }}
                min={0}
                step="50"
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Maximum spend
              </Label>
              <Input
                type="number"
                value={subcategory.maximumSpend ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  handleUpdate(subcategory.id, {
                    maximumSpend: value === '' ? null : Number(value),
                  });
                }}
                min={0}
                step="50"
                placeholder="0"
              />
            </div>
            {milesCard && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Miles block size
                </Label>
                <Input
                  type="number"
                  value={subcategory.milesBlockSize ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    handleUpdate(subcategory.id, {
                      milesBlockSize: value === '' ? null : Number(value),
                    });
                  }}
                  min={0}
                  step="1"
                  placeholder="Optional"
                />
              </div>
            )}
            {!milesCard && <div />}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                id={`subcategory-active-${subcategory.id}`}
                checked={subcategory.active}
                onCheckedChange={(checked) => handleUpdate(subcategory.id, { active: checked })}
              />
              <Label htmlFor={`subcategory-active-${subcategory.id}`} className="text-sm">
                Active
              </Label>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(subcategory.id)}
              disabled={isUnflagged}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <MinusCircle className="h-4 w-4" /> Remove
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

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
          {orderedSubcategories.map(renderSubcategory)}

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
