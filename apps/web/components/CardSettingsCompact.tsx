'use client';

import { Badge } from '@/components/ui/badge';
import { Star, Sparkles, Tag } from 'lucide-react';
import type { CreditCard } from '@/lib/storage';
import type { CardEditState } from '@/components/CardSettingsEditor';
import { cn } from '@/lib/utils';

interface CardSettingsCompactProps {
  card: CreditCard;
  state: CardEditState;
  isChanged?: boolean;
  isSelected?: boolean;
  onSelect: () => void;
  onClick: () => void;
  onToggleFeatured: (featured: boolean) => void;
}

export function CardSettingsCompact({
  card,
  state,
  isChanged = false,
  isSelected = false,
  onSelect,
  onClick,
  onToggleFeatured,
}: CardSettingsCompactProps) {
  const cardType = state.type ?? card.type;
  const cardName = state.name ?? card.name;
  const issuerName = state.issuer ?? card.issuer ?? 'Unknown issuer';
  const earningRate = state.earningRate !== undefined
    ? state.earningRate
    : card.earningRate ?? null;
  const minimumSpend = state.minimumSpend !== undefined
    ? state.minimumSpend
    : card.minimumSpend ?? null;
  const maximumSpend = state.maximumSpend !== undefined
    ? state.maximumSpend
    : card.maximumSpend ?? null;
  const isFeatured = state.featured ?? card.featured ?? true;
  const subcategoriesEnabled = state.subcategoriesEnabled ?? card.subcategoriesEnabled ?? false;
  const subcategoryCount = subcategoriesEnabled
    ? (state.subcategories ?? card.subcategories ?? []).length
    : 0;
  const hasPromo = state.promotionalPeriodEnabled ?? Boolean(card.promotionalPeriod);
  const spendingTierCount = (state.spendingTiers ?? card.spendingTiers ?? []).length;

  const rateDisplay = earningRate === null
    ? 'Not configured'
    : cardType === 'cashback'
      ? `${earningRate.toFixed(earningRate % 1 === 0 ? 0 : 2)}% cashback`
      : `${Number.isInteger(earningRate) ? earningRate : earningRate.toFixed(2)} miles/$1`;

  const spendLimits: string[] = [];
  if (minimumSpend !== null && minimumSpend > 0) {
    spendLimits.push(`${spendingTierCount > 0 ? 'Base min' : 'Min'} $${minimumSpend.toLocaleString()}`);
  }
  if (maximumSpend !== null && maximumSpend > 0) {
    spendLimits.push(`${spendingTierCount > 0 ? 'Base cap' : 'Cap'} $${maximumSpend.toLocaleString()}`);
  }

  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-card p-4 transition-all hover:shadow-md cursor-pointer',
        isChanged && 'border-amber-300 ring-1 ring-amber-300 dark:border-amber-700 dark:ring-amber-700',
        isSelected && 'border-primary ring-2 ring-primary/60',
        !isChanged && !isSelected && 'border-border/60 hover:border-border'
      )}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Header row: checkbox, name, featured star */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <input
            type="checkbox"
            aria-label={`Select ${cardName}`}
            className="mt-1 h-4 w-4 cursor-pointer rounded border-border text-primary focus:ring-2 focus:ring-primary accent-primary flex-shrink-0"
            checked={isSelected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-tight truncate">{cardName}</h3>
            <p className="text-xs text-muted-foreground truncate">{issuerName}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label={isFeatured ? 'Remove from dashboard' : 'Show on dashboard'}
          className={cn(
            'p-1 rounded-full transition-colors flex-shrink-0',
            isFeatured
              ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30'
              : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted'
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFeatured(!isFeatured);
          }}
        >
          <Star className={cn('h-4 w-4', isFeatured && 'fill-current')} />
        </button>
      </div>

      {/* Divider */}
      <div className="my-3 border-t border-border/40" />

      {/* Details */}
      <div className="space-y-1.5 text-xs">
        {/* Type + rate */}
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {cardType === 'cashback' ? '💵' : '✈️'} {spendingTierCount > 0 ? 'Base · ' : ''}{rateDisplay}
          </Badge>
        </div>

        {/* Spend limits */}
        {spendLimits.length > 0 && (
          <p className="text-muted-foreground">{spendLimits.join(' · ')}</p>
        )}

        {/* Subcategories + promo badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {subcategoryCount > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
              <Tag className="h-3 w-3" />
              {subcategoryCount} flag {subcategoryCount === 1 ? 'rule' : 'rules'}
            </Badge>
          )}
          {hasPromo && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300">
              <Sparkles className="h-3 w-3" />
              Promo
            </Badge>
          )}
          {spendingTierCount > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
              <Sparkles className="h-3 w-3" />
              {spendingTierCount + 1} spend levels
            </Badge>
          )}
        </div>
      </div>

      {/* Changed indicator */}
      {isChanged && (
        <div className="absolute top-2 right-10">
          <div className="h-2 w-2 rounded-full bg-amber-500" title="Unsaved changes" />
        </div>
      )}
    </div>
  );
}
