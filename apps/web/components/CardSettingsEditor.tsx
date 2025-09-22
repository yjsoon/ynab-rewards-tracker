'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Percent,
  DollarSign,
  CreditCard as CreditCardIcon,
  Layers,
  Target,
  ShieldCheck,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Settings2,
  Tag
} from 'lucide-react';
import type { CreditCard } from '@/lib/storage';
import {
  formatMinimumSpendText,
  formatMaximumSpendText,
  getMinimumSpendStatus,
  getMaximumSpendStatus
} from '@/lib/minimum-spend-helpers';

export interface CardEditState {
  earningRate?: number;
  earningBlockSize?: number | null;
  minimumSpend?: number | null;
  maximumSpend?: number | null;
  billingCycleType?: 'calendar' | 'billing';
  billingCycleDay?: number;
  featured?: boolean;
  name?: string;
  issuer?: string;
  type?: 'cashback' | 'miles';
}

interface CardSettingsEditorProps {
  card: CreditCard;
  state: CardEditState;
  onFieldChange: (field: keyof CardEditState, value: any) => void;
  isChanged?: boolean;
  showNameAndIssuer?: boolean;
  showCardType?: boolean;
  defaultExpanded?: boolean;
  leadingAccessory?: React.ReactNode;
  isSelected?: boolean;
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
  disabled = false,
}: {
  label: string;
  description?: string;
  value: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  isDirty?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div
        className={`${capsuleBaseClasses} cursor-not-allowed border-dashed text-muted-foreground/70`}
        aria-disabled
      >
        <div className="flex items-center gap-2">
          {icon}
          <div className="flex flex-col">
            <span className="font-medium">{label}</span>
            {description && <span className="text-xs text-muted-foreground">{description}</span>}
          </div>
        </div>
        <span>{value}</span>
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
          }`}
        >
          <div className="flex items-center gap-2">
            {icon}
            <div className="flex flex-col">
              <span className="font-medium leading-none">{label}</span>
              {description && (
                <span className="text-xs text-muted-foreground leading-tight">{description}</span>
              )}
            </div>
          </div>
          <span className="max-w-[140px] truncate text-xs text-muted-foreground sm:text-sm">
            {value}
          </span>
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
  defaultExpanded = false,
  leadingAccessory,
  isSelected = false,
}: CardSettingsEditorProps) {
  const [advancedOpen, setAdvancedOpen] = useState(defaultExpanded);

  const cardType = state.type ?? card.type;
  const cardName = state.name ?? card.name;
  const issuerName = state.issuer ?? card.issuer ?? 'Unknown issuer';
  const earningRate = state.earningRate ?? card.earningRate ?? 1;
  const earningBlockSize = state.earningBlockSize ?? card.earningBlockSize ?? null;
  const minimumSpend = state.minimumSpend ?? card.minimumSpend ?? null;
  const maximumSpend = state.maximumSpend ?? card.maximumSpend ?? null;
  const billingCycleType = state.billingCycleType ?? card.billingCycle?.type ?? 'calendar';
  const billingCycleDay = state.billingCycleDay ?? card.billingCycle?.dayOfMonth ?? 1;
  const isFeatured = state.featured ?? card.featured ?? true;

  const minimumStatus = getMinimumSpendStatus(minimumSpend);
  const maximumStatus = getMaximumSpendStatus(maximumSpend);

  const fieldDirty = useMemo(() => ({
    name: (state.name ?? card.name) !== card.name,
    issuer: (state.issuer ?? card.issuer ?? '') !== (card.issuer ?? ''),
    type: (state.type ?? card.type) !== card.type,
    featured: (state.featured ?? card.featured ?? true) !== (card.featured ?? true),
    earningRate: (state.earningRate ?? card.earningRate ?? 1) !== (card.earningRate ?? 1),
    earningBlockSize:
      (state.earningBlockSize ?? card.earningBlockSize ?? null) !==
      (card.earningBlockSize ?? null),
    minimumSpend: (state.minimumSpend ?? card.minimumSpend ?? null) !== (card.minimumSpend ?? null),
    maximumSpend: (state.maximumSpend ?? card.maximumSpend ?? null) !== (card.maximumSpend ?? null),
    billingCycle:
      (state.billingCycleType ?? card.billingCycle?.type ?? 'calendar') !==
        (card.billingCycle?.type ?? 'calendar') ||
      (state.billingCycleDay ?? card.billingCycle?.dayOfMonth ?? 1) !==
        (card.billingCycle?.dayOfMonth ?? 1),
  }), [card, state]);

  return (
    <div
      className={`rounded-2xl border bg-card/40 p-4 shadow-sm transition-all hover:shadow-md ${
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
                : `${earningRate.toFixed(2)} miles/$1`}
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

      <div className="mt-4 flex flex-wrap gap-3">
        {showNameAndIssuer && (
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
        )}

        <SettingCapsule
          label={cardType === 'cashback' ? 'Cashback rate' : 'Miles rate'}
          description={cardType === 'cashback' ? 'Percentage earned on spend' : 'Miles earned per dollar'}
          value={cardType === 'cashback'
            ? `${earningRate.toFixed(2)}%`
            : `${earningRate.toFixed(2)} miles/$1`}
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
              onValueChange={(value) => onFieldChange('earningBlockSize', value === 'exact' ? null : 1)}
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
                      onFieldChange('earningBlockSize', Number.isFinite(next) ? next : 1);
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

        <SettingCapsule
          label="Minimum spend"
          description="Set the spend required before rewards unlock"
          value={formatMinimumSpendText(minimumSpend)}
          icon={<Target className="h-4 w-4 text-muted-foreground" />}
          isDirty={fieldDirty.minimumSpend}
        >
          <div className="space-y-3">
            <Select
              value={minimumStatus}
              onValueChange={(value) => {
                if (value === 'not-configured') {
                  onFieldChange('minimumSpend', null);
                } else if (value === 'no-minimum') {
                  onFieldChange('minimumSpend', 0);
                } else {
                  onFieldChange('minimumSpend', minimumSpend && minimumSpend > 0 ? minimumSpend : 1000);
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
            {minimumSpend !== null && minimumSpend !== undefined && minimumSpend > 0 && (
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  value={minimumSpend}
                  onChange={(e) => onFieldChange('minimumSpend', parseFloat(e.target.value) || 0)}
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
                } else if (value === 'no-limit') {
                  onFieldChange('maximumSpend', 0);
                } else {
                  onFieldChange('maximumSpend', maximumSpend && maximumSpend > 0 ? maximumSpend : 5000);
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
            {maximumSpend !== null && maximumSpend !== undefined && maximumSpend > 0 && (
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  value={maximumSpend}
                  onChange={(e) => onFieldChange('maximumSpend', parseFloat(e.target.value) || 0)}
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
                  onChange={(e) => onFieldChange('billingCycleDay', parseInt(e.target.value, 10) || 1)}
                  min="1"
                  max="31"
                  className="h-9"
                />
              </div>
            )}
          </div>
        </SettingCapsule>
      </div>

      <div className="mt-6 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Tag className="h-4 w-4" />
            <span>Category caps</span>
            <Badge variant="outline" className="rounded-full border-dashed text-muted-foreground">
              Coming soon
            </Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            {advancedOpen ? 'Hide advanced' : 'Show advanced'}
            {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {advancedOpen && (
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border border-dashed bg-muted/20 p-4">
              <p className="font-medium text-foreground">Future planning</p>
              <p className="mt-1 text-sm text-muted-foreground">
                We are reserving space for per-category caps mapped from YNAB tags. Once available, you will be able to customise them here without cluttering the main view.
              </p>
            </div>
            <div className="rounded-lg border border-dashed bg-muted/20 p-4">
              <p className="font-medium text-foreground">Batch editing tips</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Select multiple cards on the Rules page to adjust featured state or earning rates in one go. A sticky bar will surface any unsaved updates at the bottom so you can commit changes quickly.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}