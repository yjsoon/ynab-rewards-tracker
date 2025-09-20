'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Percent, DollarSign, CreditCard as CreditCardIcon } from 'lucide-react';
import type { CreditCard } from '@/lib/storage';
import { formatDollars } from '@/lib/utils';

export interface CardEditState {
  earningRate?: number;
  milesBlockSize?: number;
  minimumSpend?: number | null;
  billingCycleType?: 'calendar' | 'billing';
  billingCycleDay?: number;
  active?: boolean;
  // Additional fields from individual card settings
  name?: string;
  issuer?: string;
  type?: 'cashback' | 'miles';
}

interface CardSettingsEditorProps {
  card: CreditCard;
  state: CardEditState;
  onFieldChange: (field: keyof CardEditState, value: any) => void;
  isChanged?: boolean;
  compact?: boolean; // For Rules page grid view
  showNameAndIssuer?: boolean; // For individual card page
  showCardType?: boolean; // For individual card page where type can be changed
  milesValuation?: number; // For showing miles value
}

export function CardSettingsEditor({
  card,
  state,
  onFieldChange,
  isChanged = false,
  compact = false,
  showNameAndIssuer = false,
  showCardType = false,
  milesValuation = 0.01,
}: CardSettingsEditorProps) {
  const cardType = state.type ?? card.type;
  
  if (compact) {
    // Compact grid layout for Rules page
    return (
      <div 
        className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 p-4 border rounded-lg ${
          isChanged ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700' : ''
        }`}
      >
        {/* Card Name & Status */}
        <div className="lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{card.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={state.active ?? card.active}
              onCheckedChange={(checked) => onFieldChange('active', checked)}
              id={`active-${card.id}`}
            />
            <Label htmlFor={`active-${card.id}`} className="text-sm">
              Active
            </Label>
          </div>
        </div>

        {/* Earning Rate */}
        <div>
          <Label htmlFor={`rate-${card.id}`} className="text-sm text-muted-foreground">
            {cardType === 'cashback' ? 'Cashback Rate' : 'Miles Rate'}
          </Label>
          <div className="relative mt-1">
            {cardType === 'cashback' && (
              <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            )}
            <Input
              id={`rate-${card.id}`}
              type="number"
              value={state.earningRate ?? card.earningRate ?? 1}
              onChange={(e) => onFieldChange('earningRate', parseFloat(e.target.value) || 0)}
              step="0.1"
              min="0"
              max="100"
              className={cardType === 'cashback' ? 'pl-8 h-9' : 'h-9'}
              placeholder={cardType === 'cashback' ? '1.5' : '1'}
            />
          </div>
        </div>

        {/* Minimum Spend */}
        <div>
          <Label className="text-sm text-muted-foreground">Minimum Spend</Label>
          <Select
            value={
              state.minimumSpend === null || state.minimumSpend === undefined
                ? 'not-configured'
                : state.minimumSpend === 0
                ? 'no-minimum'
                : 'has-minimum'
            }
            onValueChange={(value) => {
              if (value === 'not-configured') {
                onFieldChange('minimumSpend', null);
              } else if (value === 'no-minimum') {
                onFieldChange('minimumSpend', 0);
              } else {
                onFieldChange('minimumSpend', 1000);
              }
            }}
          >
            <SelectTrigger className="h-9 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not-configured">Not configured</SelectItem>
              <SelectItem value="no-minimum">No minimum</SelectItem>
              <SelectItem value="has-minimum">Has minimum</SelectItem>
            </SelectContent>
          </Select>
          {state.minimumSpend !== null && state.minimumSpend !== undefined && state.minimumSpend > 0 && (
            <div className="relative mt-2">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                type="number"
                value={state.minimumSpend}
                onChange={(e) => onFieldChange('minimumSpend', parseFloat(e.target.value) || 0)}
                step="100"
                min="0"
                max="100000"
                className="pl-8 h-8"
                placeholder="1000"
              />
            </div>
          )}
        </div>

        {/* Billing Cycle */}
        <div>
          <Label className="text-sm text-muted-foreground">Billing Cycle</Label>
          <Select
            value={state.billingCycleType ?? card.billingCycle?.type ?? 'calendar'}
            onValueChange={(value: 'calendar' | 'billing') => {
              onFieldChange('billingCycleType', value);
            }}
          >
            <SelectTrigger className="h-9 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="calendar">Calendar month</SelectItem>
              <SelectItem value="billing">Billing cycle</SelectItem>
            </SelectContent>
          </Select>
          {state.billingCycleType === 'billing' && (
            <div className="mt-2">
              <Label htmlFor={`day-${card.id}`} className="text-xs text-muted-foreground">
                Day of month
              </Label>
              <Input
                id={`day-${card.id}`}
                type="number"
                value={state.billingCycleDay ?? card.billingCycle?.dayOfMonth ?? 1}
                onChange={(e) => onFieldChange('billingCycleDay', parseInt(e.target.value) || 1)}
                min="1"
                max="31"
                className="h-8 mt-1"
                placeholder="1"
              />
            </div>
          )}
        </div>

        {/* Current Value Display */}
        <div className="lg:col-span-2 flex items-center justify-end gap-4">
          {cardType === 'cashback' ? (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Effective rate</p>
              <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                {state.earningRate ?? card.earningRate ?? 1}%
              </p>
            </div>
          ) : (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Miles rate</p>
              <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                {state.earningRate ?? card.earningRate ?? 1} miles
                <span className="text-xs text-muted-foreground ml-1">
                  per ${state.milesBlockSize ?? card.milesBlockSize ?? 1}
                </span>
              </p>
            </div>
          )}
          {isChanged && (
            <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              Modified
            </Badge>
          )}
        </div>
      </div>
    );
  }

  // Full layout for individual card settings
  return (
    <div className="space-y-6">
      {/* Card Name & Issuer */}
      {showNameAndIssuer && (
        <>
          <div className="space-y-2">
            <Label htmlFor="name">Card Name</Label>
            <Input
              id="name"
              value={state.name ?? card.name}
              onChange={(e) => onFieldChange('name', e.target.value)}
              placeholder="e.g., Chase Sapphire Preferred"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="issuer">Issuer</Label>
            <Input
              id="issuer"
              value={state.issuer ?? card.issuer ?? ''}
              onChange={(e) => onFieldChange('issuer', e.target.value)}
              placeholder="e.g., Chase, Amex, Citi"
              minLength={2}
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              Name of the bank or financial institution
            </p>
          </div>
        </>
      )}

      {/* Reward Type */}
      {showCardType && (
        <div className="space-y-2">
          <Label>Reward Type</Label>
          <RadioGroup
            value={cardType}
            onValueChange={(value) => onFieldChange('type', value as 'cashback' | 'miles')}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="cashback" id="cashback" />
              <Label htmlFor="cashback" className="font-normal cursor-pointer">
                Cashback (percentage rewards)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="miles" id="miles" />
              <Label htmlFor="miles" className="font-normal cursor-pointer">
                Miles/Points (travel rewards)
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

      {/* Billing Cycle */}
      <div className="space-y-2">
        <Label>Billing Cycle</Label>
        <RadioGroup
          value={state.billingCycleType ?? card.billingCycle?.type ?? 'calendar'}
          onValueChange={(value) => onFieldChange('billingCycleType', value as 'calendar' | 'billing')}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="calendar" id="calendar" />
            <Label htmlFor="calendar" className="font-normal cursor-pointer">
              Calendar month (1st to last day)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="billing" id="billing" />
            <Label htmlFor="billing" className="font-normal cursor-pointer">
              Custom billing cycle
            </Label>
          </div>
        </RadioGroup>

        {(state.billingCycleType ?? card.billingCycle?.type) === 'billing' && (
          <div className="ml-6 mt-3">
            <Label htmlFor="billingDay">Statement closes on day</Label>
            <Select
              value={String(state.billingCycleDay ?? card.billingCycle?.dayOfMonth ?? 1)}
              onValueChange={(value) => onFieldChange('billingCycleDay', parseInt(value))}
            >
              <SelectTrigger id="billingDay" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                  <SelectItem key={day} value={String(day)}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Earning Rate */}
      <div className="space-y-2">
        <Label htmlFor="earningRate">Earning Rate</Label>
        <div className="flex items-center gap-2">
          {cardType === 'cashback' ? (
            <>
              <div className="relative flex-1">
                <Input
                  id="earningRate"
                  type="number"
                  value={state.earningRate ?? card.earningRate ?? 1}
                  onChange={(e) => onFieldChange('earningRate', parseFloat(e.target.value) || 0)}
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="e.g., 2"
                />
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">cashback</span>
            </>
          ) : (
            <>
              <div className="flex-1">
                <Input
                  id="earningRate"
                  type="number"
                  value={state.earningRate ?? card.earningRate ?? 1}
                  onChange={(e) => onFieldChange('earningRate', parseFloat(e.target.value) || 0)}
                  step="0.1"
                  min="0"
                  placeholder="e.g., 1.5"
                />
              </div>
              <span className="text-sm text-muted-foreground">miles per dollar</span>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {cardType === 'cashback'
            ? 'Percentage of cashback earned on purchases'
            : 'Number of miles earned per dollar spent'}
        </p>
      </div>

      {/* Minimum Spend Requirement */}
      <div className="space-y-2">
        <Label>Minimum Spend Requirement</Label>
        <RadioGroup
          value={
            state.minimumSpend === null || state.minimumSpend === undefined
              ? 'not-configured'
              : state.minimumSpend === 0
              ? 'no-minimum'
              : 'has-minimum'
          }
          onValueChange={(value) => {
            if (value === 'not-configured') {
              onFieldChange('minimumSpend', null);
            } else if (value === 'no-minimum') {
              onFieldChange('minimumSpend', 0);
            } else {
              onFieldChange('minimumSpend', 1000); // Default $1000
            }
          }}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="not-configured" id="not-configured" />
            <Label htmlFor="not-configured" className="font-normal cursor-pointer">
              Not configured (will show setup reminder)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no-minimum" id="no-minimum" />
            <Label htmlFor="no-minimum" className="font-normal cursor-pointer">
              No minimum spend required
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="has-minimum" id="has-minimum" />
            <Label htmlFor="has-minimum" className="font-normal cursor-pointer">
              Has minimum spend requirement
            </Label>
          </div>
        </RadioGroup>

        {state.minimumSpend !== null && state.minimumSpend !== undefined && state.minimumSpend > 0 && (
          <div className="ml-6 mt-3">
            <Label htmlFor="minimumSpendAmount">Minimum spend amount</Label>
            <div className="relative flex-1 mt-1">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="minimumSpendAmount"
                type="number"
                value={state.minimumSpend}
                onChange={(e) => onFieldChange('minimumSpend', parseFloat(e.target.value) || 0)}
                step="100"
                min="0"
                max="100000"
                placeholder="e.g., 1000"
                className="pl-8"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Amount required to earn rewards for this billing period
            </p>
          </div>
        )}
      </div>

      {/* Active Status */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="active">Active Card</Label>
          <p className="text-sm text-muted-foreground">
            Include this card in recommendations and tracking
          </p>
        </div>
        <Switch
          id="active"
          checked={state.active ?? card.active}
          onCheckedChange={(checked) => onFieldChange('active', checked)}
        />
      </div>
    </div>
  );
}