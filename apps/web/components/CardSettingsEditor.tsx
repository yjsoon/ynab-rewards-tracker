'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Percent, DollarSign, CreditCard as CreditCardIcon } from 'lucide-react';
import type { CreditCard } from '@/lib/storage';

export interface CardEditState {
  earningRate?: number;
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
  showNameAndIssuer?: boolean; // For individual card page
  showCardType?: boolean; // For individual card page where type can be changed
}

export function CardSettingsEditor({
  card,
  state,
  onFieldChange,
  isChanged = false,
  showNameAndIssuer = false,
  showCardType = false,
}: CardSettingsEditorProps) {
  const cardType = state.type ?? card.type;
  
  return (
    <div className="space-y-4">
      {/* Name, Issuer, and Type Row - only shown for individual card settings */}
      {(showNameAndIssuer || showCardType) && (
        <div
          className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 border rounded-lg ${
            isChanged ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700' : ''
          }`}
        >
          {showNameAndIssuer && (
            <>
              <div>
                <Label htmlFor={`name-${card.id}`} className="text-sm text-muted-foreground">
                  Card Name
                </Label>
                <Input
                  id={`name-${card.id}`}
                  value={state.name ?? card.name}
                  onChange={(e) => onFieldChange('name', e.target.value)}
                  placeholder="e.g., Chase Sapphire Preferred"
                  className="h-9 mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor={`issuer-${card.id}`} className="text-sm text-muted-foreground">
                  Issuer
                </Label>
                <Input
                  id={`issuer-${card.id}`}
                  value={state.issuer ?? card.issuer ?? ''}
                  onChange={(e) => onFieldChange('issuer', e.target.value)}
                  placeholder="e.g., Chase, Amex, Citi"
                  className="h-9 mt-1"
                />
              </div>
            </>
          )}
          
          {showCardType && (
            <div>
              <Label className="text-sm text-muted-foreground">Reward Type</Label>
              <Select
                value={cardType}
                onValueChange={(value) => onFieldChange('type', value as 'cashback' | 'miles')}
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cashback">Cashback</SelectItem>
                  <SelectItem value="miles">Miles/Points</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Main Settings Grid */}
      <div 
        className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 p-4 border rounded-lg ${
          isChanged && !showNameAndIssuer ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700' : ''
        }`}
      >
        {/* Card Name & Status */}
        <div className="lg:col-span-1">
          {!showNameAndIssuer && (
            <div className="flex items-center gap-2 mb-2">
              <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{card.name}</span>
            </div>
          )}
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
                  per $1
                </span>
              </p>
            </div>
          )}
          {isChanged && !showNameAndIssuer && (
            <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              Modified
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}