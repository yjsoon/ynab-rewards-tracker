'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, AlertCircle } from 'lucide-react';
import { useCreditCards } from '@/hooks/useLocalStorage';
import { storage, type CardSubcategory, type CreditCard } from '@/lib/storage';
import { validateIssuer, sanitizeInput } from '@/lib/validation';
import { CardSettingsEditor, computeCardFieldDiff, type CardEditState } from '@/components/CardSettingsEditor';
import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from '@/lib/ynab-constants';

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
import { prepareSubcategoriesForSave } from '@/lib/subcategory-utils';
import { YnabClient } from '@/lib/ynab-client';

interface CardSettingsProps {
  card: CreditCard;
  onUpdate: (card: CreditCard) => void;
  initialEditing?: boolean;
}

// Move createFormState outside component to avoid recreating it
const createFormState = (nextCard: CreditCard): CardEditState => ({
  name: nextCard.name,
  issuer: nextCard.issuer || '',
  type: nextCard.type,
  featured: nextCard.featured ?? true,
  billingCycleType: nextCard.billingCycle?.type || 'calendar',
  billingCycleDay: nextCard.billingCycle?.dayOfMonth || 1,
  earningRate: nextCard.earningRate || (nextCard.type === 'cashback' ? 1 : 1),
  earningBlockSize: nextCard.earningBlockSize,
  minimumSpend: nextCard.minimumSpend,
  maximumSpend: nextCard.maximumSpend,
  subcategoriesEnabled: nextCard.subcategoriesEnabled ?? false,
  subcategories: nextCard.subcategories || [],
});

export default function CardSettings({ card, onUpdate, initialEditing = false }: CardSettingsProps) {
  const { updateCard } = useCreditCards();
  const [editing, setEditing] = useState(initialEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [issuerError, setIssuerError] = useState('');
  const [flagNames, setFlagNames] = useState(() => storage.getFlagNames());


  const [formData, setFormData] = useState<CardEditState>(() => createFormState(card));

  useEffect(() => {
    setFormData(createFormState(card));
  }, [card]);

  useEffect(() => {
    const budget = storage.getSelectedBudget();
    const pat = storage.getPAT();
    if (!pat || !budget?.id) return;

    // Only fetch if we don't have flag names yet
    const hasFlagNames = Object.keys(flagNames).length > 0;
    if (hasFlagNames) return;

    let cancelled = false;
    const client = new YnabClient(pat);

    client
      .getCustomFlagNames(budget.id)
      .then((names) => {
        if (cancelled || !names || Object.keys(names).length === 0) {
          return;
        }
        storage.mergeFlagNames(names);
        setFlagNames(storage.getFlagNames());
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [flagNames]);

  const fieldDiffs = useMemo(() => computeCardFieldDiff(card, formData), [card, formData]);
  const hasUnsavedChanges = useMemo(() => Object.values(fieldDiffs).some(Boolean), [fieldDiffs]);

  const handleFieldChange = useCallback((field: keyof CardEditState, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field === 'issuer') {
      setIssuerError('');
    }
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setIssuerError('');

    // Validate issuer if provided
    if (formData.issuer) {
      const issuerValidation = validateIssuer(formData.issuer);
      if (!issuerValidation.valid) {
        setIssuerError(issuerValidation.error || 'Invalid issuer');
        setSaving(false);
        return;
      }
    }

    try {
      const toggledOn = Boolean(formData.subcategoriesEnabled);
      const preparedSubcategories = toggledOn
        ? prepareSubcategoriesForSave(
            formData.subcategories as CardSubcategory[] | undefined,
            formData.earningRate ?? card.earningRate ?? 0
          )
        : [];

      const updatedCard: CreditCard = {
        ...card,
        name: formData.name || card.name,
        issuer: formData.issuer ? sanitizeInput(formData.issuer) : card.issuer,
        type: formData.type || card.type,
        featured: formData.featured !== undefined ? formData.featured : (card.featured ?? true),
        billingCycle: formData.billingCycleType === 'billing'
          ? { type: 'billing', dayOfMonth: formData.billingCycleDay || 1 }
          : { type: 'calendar' },
        earningRate: formData.earningRate,
        earningBlockSize: formData.earningBlockSize,
        minimumSpend: formData.minimumSpend,
        maximumSpend: formData.maximumSpend,
        subcategoriesEnabled: toggledOn,
        subcategories: preparedSubcategories,
      };

      updateCard(updatedCard);

      const storedCard = storage.getCards().find((c) => c.id === updatedCard.id);
      if (storedCard) {
        onUpdate(storedCard);
        setFormData(createFormState(storedCard));
      } else {
        onUpdate(updatedCard);
        setFormData(createFormState(updatedCard));
      }
      setEditing(false);
    } catch (err) {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData(createFormState(card));
    setEditing(false);
    setError('');
    setIssuerError('');
  };

  if (!editing) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Card Settings</CardTitle>
              <CardDescription>Configure your card properties</CardDescription>
            </div>
            <Button onClick={() => setEditing(true)} variant="outline">
              Edit Settings
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Card Name</p>
              <p className="mt-1 font-medium">{card.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Issuer</p>
              <p className="mt-1 font-medium">{card.issuer || 'Not specified'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Reward Type</p>
              <p className="mt-1 font-medium">
                {card.type === 'cashback' ? 'Cashback' : 'Miles/Points'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Dashboard placement</p>
              <p className="mt-1 font-medium">
                {card.featured ? 'Featured on dashboard' : 'Hidden from dashboard'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Billing Cycle</p>
              <p className="mt-1 font-medium">
                {card.billingCycle?.type === 'billing'
                  ? `Day ${card.billingCycle.dayOfMonth} of month`
                  : 'Calendar month'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">YNAB Account</p>
              <p className="mt-1 font-mono text-sm text-muted-foreground">{card.ynabAccountId}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Earning Rate</p>
              <p className="mt-1 font-medium">
                {card.type === 'cashback'
                  ? `${card.earningRate || 1}% cashback`
                  : `${card.earningRate || 1} miles per dollar`}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Earning Method</p>
              <p className="mt-1 font-medium">
                {card.earningBlockSize === null || card.earningBlockSize === undefined
                  ? 'Exact amount (down to the cent)'
                  : `Fixed blocks: $${card.earningBlockSize} per block`}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Minimum Spend</p>
              <p className="mt-1 font-medium">
                {card.minimumSpend === null || card.minimumSpend === undefined
                  ? 'Not configured'
                  : card.minimumSpend === 0
                  ? 'No minimum required'
                  : `$${card.minimumSpend.toLocaleString()} required`}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Maximum Spend</p>
              <p className="mt-1 font-medium">
                {card.maximumSpend === null || card.maximumSpend === undefined
                  ? 'Not configured'
                  : card.maximumSpend === 0
                  ? 'No limit'
                  : `$${card.maximumSpend.toLocaleString()} limit`}
              </p>
            </div>
          </div>
          <div className="mt-6">
            <h3 className="text-sm font-medium text-muted-foreground">Subcategory rewards</h3>
            {card.subcategoriesEnabled && card.subcategories && card.subcategories.length > 0 ? (
              <div className="mt-2 space-y-2">
                {card.subcategories
                  .slice()
                  .sort((a, b) => a.priority - b.priority)
                  .map((subcategory) => {
                    const rewardValue = typeof subcategory.rewardValue === 'number' ? subcategory.rewardValue : 0;
                    const rateLabel = card.type === 'cashback'
                      ? `${rewardValue.toFixed(2)}% cashback`
                      : `${rewardValue.toFixed(2)} miles per dollar`;
                    const minLabel = typeof subcategory.minimumSpend === 'number'
                      ? subcategory.minimumSpend === 0
                        ? 'No minimum'
                        : `$${subcategory.minimumSpend.toLocaleString()}`
                      : 'Not configured';
                    const maxLabel = typeof subcategory.maximumSpend === 'number'
                      ? subcategory.maximumSpend === 0
                        ? 'No cap'
                        : `$${subcategory.maximumSpend.toLocaleString()}`
                      : 'Not configured';
                    const flagLabel = flagNames[subcategory.flagColor as YnabFlagColor] ?? (
                      subcategory.flagColor === UNFLAGGED_FLAG.value
                        ? UNFLAGGED_FLAG.label
                        : YNAB_FLAG_COLORS.find((flag) => flag.value === subcategory.flagColor)?.label ?? subcategory.flagColor
                    );

                    const isExcluded = subcategory.excludeFromRewards;
                    const flagColor = FLAG_COLOR_MAP[subcategory.flagColor] || FLAG_COLOR_MAP.unflagged;

                    return (
                      <div
                        key={subcategory.id}
                        className="flex items-center justify-between gap-4 rounded-lg border border-border/40 bg-muted/10 p-3 overflow-hidden"
                        style={{
                          borderLeftWidth: '3px',
                          borderLeftColor: isExcluded ? '#f97316' : flagColor,
                        }}
                      >
                        <div className="flex flex-1 items-center gap-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: isExcluded ? '#f97316' : flagColor }}
                            />
                            <Badge variant="secondary" className="text-xs">{flagLabel}</Badge>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{subcategory.name}</p>
                              {isExcluded && (
                                <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">
                                  Excluded
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {isExcluded ? (
                                <span className="text-orange-600 dark:text-orange-400">Not counted toward rewards</span>
                              ) : (
                                <>
                                  {rateLabel} • Min {minLabel} • Max {maxLabel}
                                  {card.type === 'miles' && subcategory.milesBlockSize
                                    ? ` • ${subcategory.milesBlockSize} mile block`
                                    : ''}
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        {!subcategory.active && (
                          <Badge variant="outline" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Subcategory rewards disabled.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }


  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {issuerError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{issuerError}</AlertDescription>
        </Alert>
      )}

      <CardSettingsEditor
        card={card}
        state={formData}
        onFieldChange={handleFieldChange}
        showNameAndIssuer={true}
        showCardType={true}
        isChanged={hasUnsavedChanges}
        flagNames={flagNames}
      />

      {/* Actions */}
      <div className="flex gap-3 pt-4 mt-6 border-t">
        <Button
          onClick={handleSave}
          disabled={saving || !formData.name}
          className="flex-1"
        >
          {saving ? (
            <>Saving...</>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
        <Button variant="outline" onClick={handleCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </>
  );
}
