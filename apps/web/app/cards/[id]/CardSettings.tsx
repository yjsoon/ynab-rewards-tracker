'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, AlertCircle } from 'lucide-react';
import { useCreditCards } from '@/hooks/useLocalStorage';
import { storage, type CreditCard, type CardSubcategory } from '@/lib/storage';
import { validateIssuer, sanitizeInput } from '@/lib/validation';
import { CardSettingsEditor, computeCardFieldDiff, type CardEditState } from '@/components/CardSettingsEditor';
import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from '@/lib/ynab-constants';
import { YnabClient } from '@/lib/ynab-client';

interface CardSettingsProps {
  card: CreditCard;
  onUpdate: (card: CreditCard) => void;
  initialEditing?: boolean;
}

export default function CardSettings({ card, onUpdate, initialEditing = false }: CardSettingsProps) {
  const { updateCard } = useCreditCards();
  const [editing, setEditing] = useState(initialEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [issuerError, setIssuerError] = useState('');
  const [flagNames, setFlagNames] = useState(() => storage.getFlagNames());

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
  subcategories: nextCard.subcategories ? nextCard.subcategories.map((sub) => ({ ...sub })) : [],
});

const cloneAndDedupeSubcategories = (
  subcategories: CardSubcategory[] | undefined,
  flagNames: Partial<Record<YnabFlagColor, string>>,
  rewardFallback: number,
): CardSubcategory[] => {
  const seen = new Set<YnabFlagColor>();
  const clones = Array.isArray(subcategories)
    ? subcategories.map((sub) => ({ ...sub }))
    : [];

  const deduped = clones.filter((sub) => {
    const colour = sub.flagColor as YnabFlagColor;
    if (seen.has(colour)) return false;
    seen.add(colour);
    return true;
  });

  if (!seen.has(UNFLAGGED_FLAG.value)) {
    deduped.push({
      id: subcategories?.find((sub) => sub.flagColor === UNFLAGGED_FLAG.value)?.id ?? `subcat-${Math.random().toString(36).slice(2, 10)}`,
      name:
        flagNames[UNFLAGGED_FLAG.value] ??
        subcategories?.find((sub) => sub.flagColor === UNFLAGGED_FLAG.value)?.name ??
        UNFLAGGED_FLAG.label,
      flagColor: UNFLAGGED_FLAG.value,
      rewardValue: rewardFallback,
      milesBlockSize: null,
      minimumSpend: null,
      maximumSpend: null,
      priority: deduped.length,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return deduped.map((sub, index) => ({
    ...sub,
    priority: index,
    name:
      sub.name && sub.name.trim().length > 0
        ? sub.name.trim()
        : flagNames[sub.flagColor as YnabFlagColor] ??
          (sub.flagColor === UNFLAGGED_FLAG.value
            ? UNFLAGGED_FLAG.label
            : YNAB_FLAG_COLORS.find((flag) => flag.value === sub.flagColor)?.label ?? sub.flagColor),
    rewardValue:
      typeof sub.rewardValue === 'number' && Number.isFinite(sub.rewardValue)
        ? sub.rewardValue
        : rewardFallback,
    milesBlockSize:
      typeof sub.milesBlockSize === 'number' && Number.isFinite(sub.milesBlockSize)
        ? sub.milesBlockSize
        : null,
    minimumSpend:
      typeof sub.minimumSpend === 'number' && Number.isFinite(sub.minimumSpend)
        ? sub.minimumSpend
        : sub.minimumSpend === 0
        ? 0
        : null,
    maximumSpend:
      typeof sub.maximumSpend === 'number' && Number.isFinite(sub.maximumSpend)
        ? sub.maximumSpend
        : sub.maximumSpend === 0
        ? 0
        : null,
    active: sub.active !== false,
    createdAt: sub.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
};

  const [formData, setFormData] = useState<CardEditState>(() => createFormState(card));

  useEffect(() => {
    setFormData(createFormState(card));
  }, [card]);

  useEffect(() => {
    const budget = storage.getSelectedBudget();
    const pat = storage.getPAT();
    if (!pat || !budget?.id) return;
    const missingFlag = YNAB_FLAG_COLORS.some((flag) => !flagNames[flag.value as YnabFlagColor]);
    if (!missingFlag) return;

    let cancelled = false;
    const client = new YnabClient(pat);

    client
      .getFlagNames(budget.id)
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
  }, [flagNames, card.id]);

  const fieldDiffs = useMemo(() => computeCardFieldDiff(card, formData), [card, formData]);
  const hasUnsavedChanges = useMemo(() => Object.values(fieldDiffs).some(Boolean), [fieldDiffs]);

  const handleFieldChange = (field: keyof CardEditState, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field === 'issuer') {
      setIssuerError('');
    }
  };

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
        ? cloneAndDedupeSubcategories(
            formData.subcategories as CardSubcategory[] | undefined,
            flagNames,
            formData.earningRate ?? card.earningRate ?? 0,
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

                    return (
                      <div
                        key={subcategory.id}
                        className="flex items-center justify-between gap-4 rounded-lg border border-border/40 bg-muted/10 p-3"
                      >
                        <div className="flex flex-1 items-center gap-3">
                          <Badge variant="secondary">{flagLabel}</Badge>
                          <div>
                            <p className="font-medium">{subcategory.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {rateLabel} • Min {minLabel} • Max {maxLabel}
                              {card.type === 'miles' && subcategory.milesBlockSize
                                ? ` • ${subcategory.milesBlockSize} mile block`
                                : ''}
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
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Edit Card Settings</CardTitle>
        <CardDescription>Update your card configuration</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
