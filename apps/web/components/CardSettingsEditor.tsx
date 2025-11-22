'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CardSubcategoriesEditor, type CardSubcategoryDraft } from '@/components/CardSubcategoriesEditor';
import {
  Percent,
  DollarSign,
  CreditCard as CreditCardIcon,
  Layers,
  Target,
  ShieldCheck,
  CalendarClock,
  Sparkles,
  Settings2
} from 'lucide-react';
import type { CreditCard } from '@/lib/storage';
import {
  formatMinimumSpendText,
  formatMaximumSpendText,
  getMinimumSpendStatus,
  getMaximumSpendStatus
} from '@/lib/minimum-spend-helpers';
import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from '@/lib/ynab-constants';

export interface CardEditState {
  earningRate?: number;
  earningBlockSize?: number | null;
  minimumSpend?: number | null;
  maximumSpend?: number | null;
  billingCycleType?: 'calendar' | 'billing';
  billingCycleDay?: number;
  promotionalPeriodEnabled?: boolean;
  promotionalPeriodStart?: string;
  promotionalPeriodEnd?: string;
  promotionalPeriodDescription?: string;
  featured?: boolean;
  name?: string;
  issuer?: string;
  type?: 'cashback' | 'miles';
  subcategoriesEnabled?: boolean;
  subcategories?: CardSubcategoryDraft[];
}

function cloneSubcategories(subcategories?: CardSubcategoryDraft[] | CreditCard['subcategories']): CardSubcategoryDraft[] {
  if (!Array.isArray(subcategories)) {
    return [];
  }
  return subcategories.map((sub) => ({ ...sub }));
}

function serialiseSubcategories(subcategories: CardSubcategoryDraft[] | CreditCard['subcategories']): string {
  if (!Array.isArray(subcategories)) {
    return '[]';
  }
  const sorted = [...subcategories].sort((a, b) => a.priority - b.priority);
  return JSON.stringify(
    sorted.map((sub) => ({
      id: sub.id,
      flagColor: sub.flagColor,
      rewardValue: sub.rewardValue,
      minimumSpend: sub.minimumSpend ?? null,
      maximumSpend: sub.maximumSpend ?? null,
      milesBlockSize: sub.milesBlockSize ?? null,
      active: sub.active !== false,
      name: sub.name?.trim() ?? '',
      priority: sub.priority,
    }))
  );
}

function generateSubcategoryId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore and fall back below
  }
  return `subcat-${Math.random().toString(36).slice(2, 10)}`;
}

function buildDefaultSubcategory(
  flagColor: YnabFlagColor,
  rewardValue: number,
  flagNames?: Partial<Record<YnabFlagColor, string>>
): CardSubcategoryDraft {
  return {
    id: generateSubcategoryId(),
    name:
      flagNames?.[flagColor] ??
      (flagColor === UNFLAGGED_FLAG.value
        ? UNFLAGGED_FLAG.label
        : YNAB_FLAG_COLORS.find((flag) => flag.value === flagColor)?.label ?? flagColor),
    flagColor,
    rewardValue,
    milesBlockSize: null,
    minimumSpend: null,
    maximumSpend: null,
    priority: 0,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function ensureUnflaggedSubcategory(
  subcategories: CardSubcategoryDraft[],
  rewardValue: number,
  flagNames?: Partial<Record<YnabFlagColor, string>>
): CardSubcategoryDraft[] {
  const hasUnflagged = subcategories.some((sub) => sub.flagColor === UNFLAGGED_FLAG.value);
  if (!hasUnflagged) {
    subcategories = [...subcategories, buildDefaultSubcategory(UNFLAGGED_FLAG.value, rewardValue, flagNames)];
  }
  return subcategories
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((sub, index) => ({ ...sub, priority: index }));
}

export function computeCardFieldDiff(
  card: CreditCard,
  state: CardEditState
) {
  const cardName = state.name ?? card.name;
  const issuerName = state.issuer ?? card.issuer ?? '';
  const cardType = state.type ?? card.type;
  const isFeatured = state.featured ?? card.featured ?? true;
  const earningRate = state.earningRate ?? card.earningRate ?? (card.type === 'cashback' ? 1 : 1);
  const earningBlockSize = state.earningBlockSize ?? card.earningBlockSize ?? null;
  const minimumSpend = state.minimumSpend ?? card.minimumSpend ?? null;
  const maximumSpend = state.maximumSpend ?? card.maximumSpend ?? null;
  const billingCycleType = state.billingCycleType ?? card.billingCycle?.type ?? 'calendar';
  const billingCycleDay = state.billingCycleDay ?? card.billingCycle?.dayOfMonth ?? 1;
  const subcategoriesEnabled = state.subcategoriesEnabled ?? card.subcategoriesEnabled ?? false;
  const baselineSubcategories = cloneSubcategories(card.subcategories);
  const stateSubcategories = cloneSubcategories(state.subcategories ?? card.subcategories);
  const subcategoriesChanged = serialiseSubcategories(baselineSubcategories) !== serialiseSubcategories(stateSubcategories);

  const promotionalPeriodEnabled = state.promotionalPeriodEnabled ?? Boolean(card.promotionalPeriod);
  const promotionalPeriodStart = state.promotionalPeriodStart ?? card.promotionalPeriod?.startDate ?? '';
  const promotionalPeriodEnd = state.promotionalPeriodEnd ?? card.promotionalPeriod?.endDate ?? '';
  const promotionalPeriodDescription = state.promotionalPeriodDescription ?? card.promotionalPeriod?.description ?? '';

  return {
    name: cardName !== card.name,
    issuer: issuerName !== (card.issuer ?? ''),
    type: cardType !== card.type,
    featured: isFeatured !== (card.featured ?? true),
    earningRate: earningRate !== (card.earningRate ?? (card.type === 'cashback' ? 1 : 1)),
    earningBlockSize:
      earningBlockSize !== (card.earningBlockSize ?? null),
    minimumSpend: minimumSpend !== (card.minimumSpend ?? null),
    maximumSpend: maximumSpend !== (card.maximumSpend ?? null),
    billingCycle:
      billingCycleType !== (card.billingCycle?.type ?? 'calendar') ||
      billingCycleDay !== (card.billingCycle?.dayOfMonth ?? 1),
    promotionalPeriod:
      promotionalPeriodEnabled !== Boolean(card.promotionalPeriod) ||
      promotionalPeriodStart !== (card.promotionalPeriod?.startDate ?? '') ||
      promotionalPeriodEnd !== (card.promotionalPeriod?.endDate ?? '') ||
      promotionalPeriodDescription !== (card.promotionalPeriod?.description ?? ''),
    subcategoriesEnabled: subcategoriesEnabled !== Boolean(card.subcategoriesEnabled),
    subcategories: subcategoriesChanged,
  } as const;
}

interface CardSettingsEditorProps {
  card: CreditCard;
  state: CardEditState;
  onFieldChange: (field: keyof CardEditState, value: unknown) => void;
  isChanged?: boolean;
  showNameAndIssuer?: boolean;
  showCardType?: boolean;
  leadingAccessory?: React.ReactNode;
  isSelected?: boolean;
  highlightUnsetMinimum?: boolean;
  flagNames?: Partial<Record<YnabFlagColor, string>>;
}

const capsuleBaseClasses =
  'group inline-flex min-h-[44px] w-full items-center justify-between gap-4 rounded-full border px-4 py-2 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:w-auto';

function SettingCapsule({
  label,
  description,
  value,
  icon,
  children,
  isDirty,
  emphasise = false,
  disabled = false,
}: {
  label: string;
  description?: string;
  value: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  isDirty?: boolean;
  emphasise?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div
        className={`${capsuleBaseClasses} cursor-not-allowed border-dashed text-muted-foreground/70`}
        aria-disabled
      >
        <div className="flex w-full items-center gap-3">
          <div className="flex flex-1 items-center gap-2">
            {icon}
            <div className="flex flex-col">
              <span className="font-medium">{label}</span>
              {description && <span className="text-xs text-muted-foreground">{description}</span>}
            </div>
          </div>
          <div className="hidden h-8 border-l border-border/60 sm:block" aria-hidden="true" />
          <span className="rounded-full bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
            {value}
          </span>
        </div>
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${capsuleBaseClasses} border-border bg-background/40 hover:bg-accent/40 ${
            isDirty ? 'border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/20' : ''
          } ${
            emphasise ? 'border-sky-300 bg-sky-50/70 dark:border-sky-800 dark:bg-sky-900/25' : ''
          }`}
        >
          <div className="flex w-full items-center gap-3">
            <div className="flex flex-1 items-center gap-2">
              {icon}
              <div className="flex flex-col text-left">
                <span className="font-medium leading-none">{label}</span>
                {description && (
                  <span className="text-xs text-muted-foreground leading-tight">{description}</span>
                )}
              </div>
            </div>
            <div className="hidden h-8 border-l border-border/60 sm:block" aria-hidden="true" />
            <span className="max-w-[140px] truncate rounded-full bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground sm:text-sm">
              {value}
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">{label}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {children}
      </PopoverContent>
    </Popover>
  );
}

const MINIMUM_PRESETS = [
  { value: 'not-configured', label: 'Not configured' },
  { value: 'no-minimum', label: 'No minimum' },
  { value: 'has-minimum', label: 'Has minimum' },
];

const MAXIMUM_PRESETS = [
  { value: 'not-configured', label: 'Not configured' },
  { value: 'no-limit', label: 'No limit' },
  { value: 'has-limit', label: 'Has limit' },
];

export function CardSettingsEditor({
  card,
  state,
  onFieldChange,
  isChanged = false,
  showNameAndIssuer = false,
  showCardType = false,
  leadingAccessory,
  isSelected = false,
  highlightUnsetMinimum = false,
  flagNames,
}: CardSettingsEditorProps) {
  const resolvedFlagNames = flagNames ?? {};

  const cardType = state.type ?? card.type;
  const cardName = state.name ?? card.name;
  const issuerName = state.issuer ?? card.issuer ?? 'Unknown issuer';
  const earningRate = state.earningRate ?? card.earningRate ?? 1;
  const earningBlockSize = state.earningBlockSize ?? card.earningBlockSize ?? null;
  const minimumSpend = state.minimumSpend ?? card.minimumSpend ?? null;
  const maximumSpend = state.maximumSpend ?? card.maximumSpend ?? null;
  const billingCycleType = state.billingCycleType ?? card.billingCycle?.type ?? 'calendar';
  const billingCycleDay = state.billingCycleDay ?? card.billingCycle?.dayOfMonth ?? 1;
  const promotionalPeriodEnabled = state.promotionalPeriodEnabled ?? Boolean(card.promotionalPeriod);
  const promotionalPeriodStart = state.promotionalPeriodStart ?? card.promotionalPeriod?.startDate ?? '';
  const promotionalPeriodEnd = state.promotionalPeriodEnd ?? card.promotionalPeriod?.endDate ?? '';
  const promotionalPeriodDescription = state.promotionalPeriodDescription ?? card.promotionalPeriod?.description ?? '';
  const isFeatured = state.featured ?? card.featured ?? true;
  const subcategoriesEnabled = state.subcategoriesEnabled ?? card.subcategoriesEnabled ?? false;
  const subcategoryDrafts = useMemo(
    () => cloneSubcategories(state.subcategories ?? card.subcategories),
    [state.subcategories, card.subcategories]
  );

  const [blockSizeSnapshot, setBlockSizeSnapshot] = useState(() =>
    earningBlockSize && earningBlockSize > 0 ? earningBlockSize : 1
  );
  const [minimumInputValue, setMinimumInputValue] = useState(() =>
    String(minimumSpend ?? '')
  );
  const [maximumInputValue, setMaximumInputValue] = useState(() =>
    String(maximumSpend ?? '')
  );

  useEffect(() => {
    if (earningBlockSize && earningBlockSize > 0 && earningBlockSize !== blockSizeSnapshot) {
      setBlockSizeSnapshot(earningBlockSize);
    }
  }, [earningBlockSize, blockSizeSnapshot]);

  useEffect(() => {
    setMinimumInputValue(minimumSpend === null || minimumSpend === undefined ? '' : String(minimumSpend));
  }, [minimumSpend]);

  useEffect(() => {
    setMaximumInputValue(maximumSpend === null || maximumSpend === undefined ? '' : String(maximumSpend));
  }, [maximumSpend]);

  const minimumStatus = getMinimumSpendStatus(minimumSpend);
  const maximumStatus = getMaximumSpendStatus(maximumSpend);
  const shouldHighlightMinimum = highlightUnsetMinimum && minimumStatus === 'not-configured';

  const fieldDirty = useMemo(() => computeCardFieldDiff(card, state), [card, state]);

  const subcategoriesDirty = fieldDirty.subcategories || fieldDirty.subcategoriesEnabled;

  const handleSubcategoryToggle = (enabled: boolean) => {
    onFieldChange('subcategoriesEnabled', enabled);
    if (enabled) {
      const ensured = ensureUnflaggedSubcategory(cloneSubcategories(subcategoryDrafts), earningRate, resolvedFlagNames);
      onFieldChange('subcategories', ensured);
    }
  };

  const handleSubcategoriesChange = (next: CardSubcategoryDraft[]) => {
    onFieldChange('subcategories', next);
  };

  return (
    <div
      className={`rounded-2xl border bg-card p-4 shadow-sm transition-all hover:shadow-md ${
        isChanged
          ? 'border-amber-300 ring-1 ring-amber-300 dark:border-amber-700 dark:ring-amber-700'
          : 'border-border/60'
      } ${isSelected ? 'border-primary ring-2 ring-primary/60' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {leadingAccessory}
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-muted">
            <CreditCardIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold leading-tight">
                {cardName}
              </h3>
              <Badge variant="secondary" className="capitalize">
                {cardType === 'cashback' ? 'Cashback' : 'Miles'}
              </Badge>
              {isChanged && (
                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                  Modified
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{issuerName}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-muted-foreground">
            Effective rate
            <span className="block text-xl font-semibold text-primary">
              {cardType === 'cashback'
                ? `${earningRate.toFixed(2)}%`
                : `${Number.isInteger(earningRate) ? earningRate : earningRate.toFixed(2)} miles/$1`}
            </span>
          </div>
          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1 ${
              fieldDirty.featured ? 'border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/20' : ''
            }`}
          >
            <Switch
              id={`featured-${card.id}`}
              checked={isFeatured}
              onCheckedChange={(checked) => onFieldChange('featured', checked)}
            />
            <Label htmlFor={`featured-${card.id}`} className="text-sm">Featured</Label>
          </div>
        </div>
      </div>

      {/* Card Identity - shown conditionally */}
      {showNameAndIssuer && (
        <div className="mt-4">
          <SettingCapsule
            label="Card identity"
            description="Name, issuer and reward type"
            value={`${cardName} • ${issuerName}`}
            icon={<Settings2 className="h-4 w-4 text-muted-foreground" />}
            isDirty={fieldDirty.name || fieldDirty.issuer || fieldDirty.type}
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Card name</Label>
                <Input
                  value={cardName}
                  onChange={(e) => onFieldChange('name', e.target.value)}
                  placeholder="e.g. Avios Preferred"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Issuer</Label>
                <Input
                  value={state.issuer ?? card.issuer ?? ''}
                  onChange={(e) => onFieldChange('issuer', e.target.value)}
                  placeholder="e.g. Amex, HSBC"
                />
              </div>
              {showCardType && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Reward type</Label>
                  <Select
                    value={cardType}
                    onValueChange={(value) => onFieldChange('type', value as 'cashback' | 'miles')}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cashback">Cashback</SelectItem>
                      <SelectItem value="miles">Miles / Points</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </SettingCapsule>
        </div>
      )}

      {/* Rewards Configuration */}
      <div className="mt-6 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rewards Configuration</h4>
        <div className="flex flex-wrap gap-3">
          {!showNameAndIssuer && showCardType && (
            <SettingCapsule
              label="Reward type"
              description="Switch between cashback or miles"
              value={cardType === 'cashback' ? 'Cashback' : 'Miles / Points'}
              icon={<Settings2 className="h-4 w-4 text-muted-foreground" />}
              isDirty={fieldDirty.type}
            >
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Reward type</Label>
                <Select
                  value={cardType}
                  onValueChange={(value) => onFieldChange('type', value as 'cashback' | 'miles')}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashback">Cashback</SelectItem>
                    <SelectItem value="miles">Miles / Points</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </SettingCapsule>
          )}

          <SettingCapsule
            label={cardType === 'cashback' ? 'Cashback rate' : 'Miles rate'}
            description={cardType === 'cashback' ? 'Percentage earned on spend' : 'Miles earned per dollar'}
            value={cardType === 'cashback'
              ? `${earningRate.toFixed(2)}%`
              : `${Number.isInteger(earningRate) ? earningRate : earningRate.toFixed(2)} miles/$1`}
            icon={<Percent className="h-4 w-4 text-muted-foreground" />}
            isDirty={fieldDirty.earningRate}
          >
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {cardType === 'cashback' ? 'Cashback percentage' : 'Miles per dollar'}
              </Label>
              <Input
                type="number"
                value={earningRate}
                onChange={(e) => onFieldChange('earningRate', parseFloat(e.target.value) || 0)}
                step="0.1"
                min="0"
                max="100"
                className="h-9"
              />
            </div>
          </SettingCapsule>

          <SettingCapsule
            label="Earning method"
            description={earningBlockSize ? 'Earning in fixed blocks' : 'Earn on every dollar'}
            value={earningBlockSize ? `$${earningBlockSize} blocks` : 'Exact amount'}
            icon={<Layers className="h-4 w-4 text-muted-foreground" />}
            isDirty={fieldDirty.earningBlockSize}
          >
            <div className="space-y-3">
              <Select
                value={earningBlockSize && earningBlockSize > 0 ? 'blocks' : 'exact'}
                onValueChange={(value) => {
                  if (value === 'exact') {
                    if (earningBlockSize && earningBlockSize > 0) {
                      setBlockSizeSnapshot(earningBlockSize);
                    }
                    onFieldChange('earningBlockSize', null);
                  } else {
                    const nextSize = blockSizeSnapshot && blockSizeSnapshot > 0 ? blockSizeSnapshot : 1;
                    onFieldChange('earningBlockSize', nextSize);
                  }
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">Exact amount (down to the penny)</SelectItem>
                  <SelectItem value="blocks">Fixed dollar blocks</SelectItem>
                </SelectContent>
              </Select>
              {earningBlockSize && earningBlockSize > 0 && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Block size</Label>
                  <div className="relative flex-1">
                    <DollarSign className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="number"
                      value={earningBlockSize}
                      onChange={(e) => {
                        const next = parseFloat(e.target.value);
                        if (Number.isFinite(next) && next > 0) {
                          setBlockSizeSnapshot(next);
                          onFieldChange('earningBlockSize', next);
                        } else {
                          setBlockSizeSnapshot(1);
                          onFieldChange('earningBlockSize', 1);
                        }
                      }}
                      min="1"
                      max="100"
                      step="1"
                      className="h-9 pl-8"
                    />
                  </div>
                </div>
              )}
            </div>
          </SettingCapsule>
        </div>
      </div>

      {/* Spend Limits */}
      <div className="mt-6 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spend Limits</h4>
        <div className="flex flex-wrap gap-3">
          <SettingCapsule
            label="Minimum spend"
            description="Set the spend required before rewards unlock"
            value={formatMinimumSpendText(minimumSpend)}
            icon={<Target className="h-4 w-4 text-muted-foreground" />}
            isDirty={fieldDirty.minimumSpend}
            emphasise={shouldHighlightMinimum}
          >
            <div className="space-y-3">
              <Select
                value={minimumStatus}
                onValueChange={(value) => {
                  if (value === 'not-configured') {
                    onFieldChange('minimumSpend', null);
                    setMinimumInputValue('');
                  } else if (value === 'no-minimum') {
                    onFieldChange('minimumSpend', 0);
                    setMinimumInputValue('0');
                  } else {
                    const nextValue = minimumSpend && minimumSpend > 0 ? minimumSpend : 1000;
                    onFieldChange('minimumSpend', nextValue);
                    setMinimumInputValue(String(nextValue));
                  }
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINIMUM_PRESETS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {minimumStatus === 'has-minimum' && (
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    value={minimumInputValue}
                    onChange={(e) => {
                      const value = e.target.value;
                      setMinimumInputValue(value);
                      if (value === '') {
                        return;
                      }
                      const parsed = Number(value);
                      if (!isNaN(parsed) && parsed >= 0) {
                        onFieldChange('minimumSpend', parsed);
                      }
                    }}
                    onBlur={() => {
                      if (minimumInputValue === '') {
                        onFieldChange('minimumSpend', null);
                      }
                    }}
                    step="50"
                    min="0"
                    max="100000"
                    className="h-9 pl-8"
                  />
                </div>
              )}
            </div>
          </SettingCapsule>

          <SettingCapsule
            label="Maximum spend"
            description="Cap rewards after a given spend"
            value={formatMaximumSpendText(maximumSpend)}
            icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}
            isDirty={fieldDirty.maximumSpend}
          >
            <div className="space-y-3">
              <Select
                value={maximumStatus}
                onValueChange={(value) => {
                  if (value === 'not-configured') {
                    onFieldChange('maximumSpend', null);
                    setMaximumInputValue('');
                  } else if (value === 'no-limit') {
                    onFieldChange('maximumSpend', 0);
                    setMaximumInputValue('0');
                  } else {
                    const nextValue = maximumSpend && maximumSpend > 0 ? maximumSpend : 5000;
                    onFieldChange('maximumSpend', nextValue);
                    setMaximumInputValue(String(nextValue));
                  }
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAXIMUM_PRESETS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {maximumStatus === 'has-limit' && (
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    value={maximumInputValue}
                    onChange={(e) => {
                      const value = e.target.value;
                      setMaximumInputValue(value);
                      if (value === '') {
                        return;
                      }
                      const parsed = Number(value);
                      if (!isNaN(parsed) && parsed >= 0) {
                        onFieldChange('maximumSpend', parsed);
                      }
                    }}
                    onBlur={() => {
                      if (maximumInputValue === '') {
                        onFieldChange('maximumSpend', null);
                      }
                    }}
                    step="50"
                    min="0"
                    max="100000"
                    className="h-9 pl-8"
                  />
                </div>
              )}
            </div>
          </SettingCapsule>
        </div>
      </div>

      {/* Billing & Periods */}
      <div className="mt-6 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billing & Periods</h4>
        <div className="flex flex-wrap gap-3">
          <SettingCapsule
            label="Billing cycle"
            description="Choose calendar month or a billing day"
            value={
              billingCycleType === 'billing'
                ? `Billing day ${billingCycleDay}`
                : 'Calendar month'
            }
            icon={<CalendarClock className="h-4 w-4 text-muted-foreground" />}
            isDirty={fieldDirty.billingCycle}
          >
            <div className="space-y-3">
              <Select
                value={billingCycleType}
                onValueChange={(value: 'calendar' | 'billing') => {
                  onFieldChange('billingCycleType', value);
                  if (value === 'calendar') {
                    onFieldChange('billingCycleDay', 1);
                  }
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="calendar">Calendar month</SelectItem>
                  <SelectItem value="billing">Billing statement cycle</SelectItem>
                </SelectContent>
              </Select>
              {billingCycleType === 'billing' && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Statement day</Label>
                  <Input
                    type="number"
                    value={billingCycleDay}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      // Use 1 as default only if parsing fails (NaN), not for 0
                      onFieldChange('billingCycleDay', Number.isNaN(parsed) ? 1 : Math.max(1, Math.min(31, parsed)));
                    }}
                    min="1"
                    max="31"
                    className="h-9"
                  />
                </div>
              )}
            </div>
          </SettingCapsule>

          <SettingCapsule
            label="Promotional period"
            description="Override normal billing cycle with a fixed period"
            value={
              promotionalPeriodEnabled && promotionalPeriodEnd
                ? promotionalPeriodStart
                  ? `${promotionalPeriodStart} to ${promotionalPeriodEnd}`
                  : `Until ${promotionalPeriodEnd}`
                : 'Not active'
            }
            icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
            isDirty={fieldDirty.promotionalPeriod}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Enable promotional period</Label>
                <Switch
                  checked={promotionalPeriodEnabled}
                  onCheckedChange={(checked) => {
                    onFieldChange('promotionalPeriodEnabled', checked);
                    if (!checked) {
                      onFieldChange('promotionalPeriodStart', '');
                      onFieldChange('promotionalPeriodEnd', '');
                      onFieldChange('promotionalPeriodDescription', '');
                    }
                  }}
                />
              </div>
              {promotionalPeriodEnabled && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Start date (optional)
                    </Label>
                    <Input
                      type="date"
                      value={promotionalPeriodStart}
                      onChange={(e) => onFieldChange('promotionalPeriodStart', e.target.value)}
                      className="h-9"
                    />
                    <p className="text-xs text-muted-foreground">Leave blank to start from current billing cycle</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">End date *</Label>
                    <Input
                      type="date"
                      value={promotionalPeriodEnd}
                      onChange={(e) => onFieldChange('promotionalPeriodEnd', e.target.value)}
                      className="h-9"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Description (optional)
                    </Label>
                    <Input
                      type="text"
                      value={promotionalPeriodDescription}
                      onChange={(e) => onFieldChange('promotionalPeriodDescription', e.target.value)}
                      placeholder="e.g., 5x groceries Q4 2024"
                      className="h-9"
                    />
                  </div>
                </>
              )}
            </div>
          </SettingCapsule>
        </div>
      </div>

      {/* SUBCATEGORY REWARDS */}
      <div className={`mt-6 space-y-3 rounded-lg border p-4 ${
        subcategoriesDirty
          ? 'border-amber-300 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-900/20'
          : 'border-transparent bg-transparent'
      }`}>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SUBCATEGORY REWARDS</h4>
        <p className="text-sm text-muted-foreground">
          Map YNAB flags to bespoke reward bands. Unflagged transactions fall back to the default rate.
        </p>
        <CardSubcategoriesEditor
          cardType={cardType}
          enabled={subcategoriesEnabled}
          value={subcategoryDrafts}
          onToggleEnabled={handleSubcategoryToggle}
          onChange={handleSubcategoriesChange}
          baseRewardRate={earningRate}
          flagNames={resolvedFlagNames}
        />
      </div>
    </div>
  );
}
