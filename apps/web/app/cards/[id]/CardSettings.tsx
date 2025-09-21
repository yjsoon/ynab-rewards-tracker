'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, AlertCircle } from 'lucide-react';
import { useCreditCards } from '@/hooks/useLocalStorage';
import type { CreditCard } from '@/lib/storage';
import { validateIssuer, sanitizeInput } from '@/lib/validation';
import { CardSettingsEditor, type CardEditState } from '@/components/CardSettingsEditor';

interface CardSettingsProps {
  card: CreditCard;
  onUpdate: (card: CreditCard) => void;
}

export default function CardSettings({ card, onUpdate }: CardSettingsProps) {
  const { updateCard } = useCreditCards();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [issuerError, setIssuerError] = useState('');

  const [formData, setFormData] = useState<CardEditState>({
    name: card.name,
    issuer: card.issuer || '',
    type: card.type,
    active: card.active,
    billingCycleType: card.billingCycle?.type || 'calendar',
    billingCycleDay: card.billingCycle?.dayOfMonth || 1,
    earningRate: card.earningRate || (card.type === 'cashback' ? 1 : 1),
    earningBlockSize: card.earningBlockSize,
    minimumSpend: card.minimumSpend,
    maximumSpend: card.maximumSpend,
  });

  const handleFieldChange = (field: keyof CardEditState, value: any) => {
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
      const updatedCard: CreditCard = {
        ...card,
        name: formData.name || card.name,
        issuer: formData.issuer ? sanitizeInput(formData.issuer) : card.issuer,
        type: formData.type || card.type,
        active: formData.active !== undefined ? formData.active : card.active,
        billingCycle: formData.billingCycleType === 'billing'
          ? { type: 'billing', dayOfMonth: formData.billingCycleDay || 1 }
          : { type: 'calendar' },
        earningRate: formData.earningRate,
        earningBlockSize: formData.earningBlockSize,
        minimumSpend: formData.minimumSpend,
        maximumSpend: formData.maximumSpend,
      };

      updateCard(updatedCard);
      onUpdate(updatedCard);
      setEditing(false);
    } catch (err) {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: card.name,
      issuer: card.issuer || '',
      type: card.type,
      active: card.active,
      billingCycleType: card.billingCycle?.type || 'calendar',
      billingCycleDay: card.billingCycle?.dayOfMonth || 1,
      earningRate: card.earningRate || (card.type === 'cashback' ? 1 : 1),
      earningBlockSize: card.earningBlockSize,
      minimumSpend: card.minimumSpend,
      maximumSpend: card.maximumSpend,
    });
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
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <p className="mt-1 font-medium">
                {card.active ? 'Active' : 'Inactive'}
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