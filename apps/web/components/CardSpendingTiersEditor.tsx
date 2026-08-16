'use client';

import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSettings } from '@/hooks/useLocalStorage';
import { formatDollars } from '@/lib/utils';
import type {
  CardSpendingTier,
  CardSubcategory,
  CreditCard,
  SpendingTierSubcategory,
} from '@/lib/storage';
import { createSpendingTier } from '@ynab-counter/app-core/rewards-engine';

interface CardSpendingTiersEditorProps {
  card: CreditCard;
  cardType: CreditCard['type'];
  value: CardSpendingTier[];
  baseEarningRate: number | null;
  baseMinimumSpend: number | null;
  baseMaximumSpend: number | null;
  subcategoriesEnabled: boolean;
  subcategories: CardSubcategory[];
  onChange: (tiers: CardSpendingTier[]) => void;
}

function numberOrNull(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatRate(
  type: CreditCard['type'],
  value: number | null,
  currencyUnit: string,
): string {
  if (value === null) return 'No default rate';
  return type === 'cashback' ? `${value}%` : `${value} miles/${currencyUnit}`;
}

function nextThreshold(baseMinimumSpend: number | null, tiers: CardSpendingTier[]): number {
  const highest = Math.max(
    baseMinimumSpend ?? 0,
    ...tiers.map(({ spendThreshold }) => spendThreshold),
  );
  return highest > 0 ? highest * 2 : 500;
}

function getOverride(
  tier: CardSpendingTier,
  subcategory: CardSubcategory,
): SpendingTierSubcategory {
  return tier.subcategories?.find(({ subcategoryId }) => subcategoryId === subcategory.id) ?? {
    subcategoryId: subcategory.id,
    rewardValue: subcategory.rewardValue,
    maximumSpend: subcategory.maximumSpend ?? null,
  };
}

export function CardSpendingTiersEditor({
  card,
  cardType,
  value,
  baseEarningRate,
  baseMinimumSpend,
  baseMaximumSpend,
  subcategoriesEnabled,
  subcategories,
  onChange,
}: CardSpendingTiersEditorProps) {
  const { settings } = useSettings();
  const formatSpend = (value: number) => formatDollars(value, {
    currency: settings.currency,
    decimals: Number.isInteger(value) ? 0 : 2,
  });
  const orderedTiers = useMemo(
    () => [...value].sort((left, right) => left.spendThreshold - right.spendThreshold),
    [value],
  );
  const activeSubcategories = useMemo(
    () => [...subcategories]
      .filter((subcategory) => subcategory.active !== false && !subcategory.excludeFromRewards)
      .sort((left, right) => left.priority - right.priority),
    [subcategories],
  );
  const thresholds = [baseMinimumSpend ?? 0, ...orderedTiers.map(({ spendThreshold }) => spendThreshold)];
  const duplicateThresholds = new Set(
    thresholds.filter((threshold, index) => thresholds.indexOf(threshold) !== index),
  );

  const updateTier = (id: string, patch: Partial<CardSpendingTier>) => {
    onChange(value.map((tier) => tier.id === id ? { ...tier, ...patch } : tier));
  };

  const updateSubcategory = (
    tier: CardSpendingTier,
    subcategory: CardSubcategory,
    patch: Partial<SpendingTierSubcategory>,
  ) => {
    const current = getOverride(tier, subcategory);
    const nextOverride = { ...current, ...patch };
    const existing = tier.subcategories ?? [];
    updateTier(tier.id, {
      subcategories: existing.some(({ subcategoryId }) => subcategoryId === subcategory.id)
        ? existing.map((override) => override.subcategoryId === subcategory.id ? nextOverride : override)
        : [...existing, nextOverride],
    });
  };

  const addTier = () => {
    const template: CreditCard = {
      ...card,
      earningRate: baseEarningRate,
      maximumSpend: baseMaximumSpend,
      subcategories,
    };
    onChange([
      ...value,
      createSpendingTier(template, nextThreshold(baseMinimumSpend, value)),
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed bg-muted/20 p-4">
        <p className="font-medium">Base level · {baseMinimumSpend && baseMinimumSpend > 0
          ? `at ${formatSpend(baseMinimumSpend)} spend`
          : 'no spend threshold'}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatRate(cardType, baseEarningRate, formatSpend(1))} default · {baseMaximumSpend && baseMaximumSpend > 0
            ? `${formatSpend(baseMaximumSpend)} overall cap`
            : 'No overall cap'}
          {subcategoriesEnabled && activeSubcategories.length > 0
            ? ` · ${activeSubcategories.length} flag ${activeSubcategories.length === 1 ? 'category' : 'categories'}`
            : ''}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          The existing earning and flag-category settings remain this base level.
        </p>
      </div>

      {orderedTiers.map((tier) => (
        <Card key={tier.id} className="border-border/60">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">
                At {formatSpend(tier.spendThreshold)} total spend
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Applies retroactively to eligible spend for this reward period.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(value.filter(({ id }) => id !== tier.id))}
              aria-label={`Remove ${formatSpend(tier.spendThreshold)} spending tier`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor={`threshold-${tier.id}`}>Total spend threshold</Label>
                <Input
                  id={`threshold-${tier.id}`}
                  type="number"
                  min="0"
                  step="50"
                  value={tier.spendThreshold}
                  onChange={(event) => updateTier(tier.id, {
                    spendThreshold: Math.max(0, Number(event.target.value) || 0),
                  })}
                  aria-invalid={duplicateThresholds.has(tier.spendThreshold)}
                />
                {duplicateThresholds.has(tier.spendThreshold) ? (
                  <p className="text-xs text-destructive">Use a unique threshold.</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`rate-${tier.id}`}>
                  {cardType === 'cashback' ? 'Default cashback (%)' : 'Default miles per dollar'}
                </Label>
                <Input
                  id={`rate-${tier.id}`}
                  type="number"
                  min="0"
                  step="0.1"
                  value={tier.earningRate ?? ''}
                  placeholder="No default rate"
                  onChange={(event) => updateTier(tier.id, {
                    earningRate: numberOrNull(event.target.value),
                  })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`cap-${tier.id}`}>Overall eligible-spend cap</Label>
                <Input
                  id={`cap-${tier.id}`}
                  type="number"
                  min="0"
                  step="25"
                  value={tier.maximumSpend ?? ''}
                  placeholder="No cap"
                  onChange={(event) => updateTier(tier.id, {
                    maximumSpend: numberOrNull(event.target.value),
                  })}
                />
              </div>
            </div>

            {subcategoriesEnabled && activeSubcategories.length > 0 ? (
              <div className="space-y-3 border-t pt-4">
                <div>
                  <p className="text-sm font-medium">Flag-category rewards</p>
                  <p className="text-xs text-muted-foreground">
                    Set the rate and eligible-spend cap for each category at this level.
                  </p>
                </div>
                <div className="space-y-2">
                  {activeSubcategories.map((subcategory) => {
                    const override = getOverride(tier, subcategory);
                    const rateInputId = `subcategory-rate-${tier.id}-${subcategory.id}`;
                    const capInputId = `subcategory-cap-${tier.id}-${subcategory.id}`;
                    return (
                      <div
                        key={subcategory.id}
                        className="grid gap-2 rounded-lg bg-muted/25 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_9rem] sm:items-end"
                      >
                        <div>
                          <p className="text-sm font-medium">{subcategory.name}</p>
                          <p className="text-xs capitalize text-muted-foreground">{subcategory.flagColor} flag</p>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={rateInputId} className="text-xs">
                            {cardType === 'cashback' ? 'Rate (%)' : `Miles/${formatSpend(1)}`}
                          </Label>
                          <Input
                            id={rateInputId}
                            type="number"
                            min="0"
                            step="0.1"
                            value={override.rewardValue}
                            onChange={(event) => updateSubcategory(tier, subcategory, {
                              rewardValue: Math.max(0, Number(event.target.value) || 0),
                            })}
                            aria-label={`${subcategory.name} rate at ${formatSpend(tier.spendThreshold)} spend`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={capInputId} className="text-xs">Eligible-spend cap</Label>
                          <Input
                            id={capInputId}
                            type="number"
                            min="0"
                            step="25"
                            value={override.maximumSpend ?? ''}
                            placeholder="No cap"
                            onChange={(event) => updateSubcategory(tier, subcategory, {
                              maximumSpend: numberOrNull(event.target.value),
                            })}
                            aria-label={`${subcategory.name} cap at ${formatSpend(tier.spendThreshold)} spend`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}

      <Button type="button" variant="outline" onClick={addTier} className="w-full gap-2 sm:w-auto">
        <Plus className="h-4 w-4" />
        Add spend tier
      </Button>
      <p className="text-xs text-muted-foreground">
        The highest threshold reached sets the rates and caps for the entire reward period.
      </p>
    </div>
  );
}
