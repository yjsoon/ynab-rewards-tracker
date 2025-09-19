'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, AlertCircle, Percent, DollarSign } from 'lucide-react';
import { useCreditCards } from '@/hooks/useLocalStorage';
import type { CreditCard } from '@/lib/storage';
import { validateIssuer, sanitizeInput } from '@/lib/validation';

interface CardSettingsProps {
  card: CreditCard;
  onUpdate: (card: CreditCard) => void;
}

export default function CardSettings({ card, onUpdate }: CardSettingsProps) {
  const { updateCard } = useCreditCards();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: card.name,
    issuer: card.issuer || '',
    type: card.type,
    active: card.active,
    billingCycleType: card.billingCycle?.type || 'calendar',
    billingCycleDay: card.billingCycle?.dayOfMonth || 1,
    earningRate: card.earningRate || (card.type === 'cashback' ? 1 : 1),
    milesBlockSize: card.milesBlockSize || 1,
  });
  const [issuerError, setIssuerError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setIssuerError('');

    // Validate issuer
    const issuerValidation = validateIssuer(formData.issuer);
    if (!issuerValidation.valid) {
      setIssuerError(issuerValidation.error || 'Invalid issuer');
      setSaving(false);
      return;
    }

    try {
      const updatedCard: CreditCard = {
        ...card,
        name: formData.name,
        issuer: sanitizeInput(formData.issuer),
        type: formData.type,
        active: formData.active,
        billingCycle: formData.billingCycleType === 'billing'
          ? { type: 'billing', dayOfMonth: formData.billingCycleDay }
          : { type: 'calendar' },
        earningRate: formData.earningRate,
        milesBlockSize: formData.type === 'miles' ? formData.milesBlockSize : undefined,
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
      milesBlockSize: card.milesBlockSize || 1,
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
                  : `${card.earningRate || 1}x miles${card.milesBlockSize && card.milesBlockSize > 1 ? ` per $${card.milesBlockSize}` : ' per dollar'}`}
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
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Card Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Card Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Chase Sapphire Preferred"
          />
        </div>

        {/* Issuer */}
        <div className="space-y-2">
          <Label htmlFor="issuer">Issuer</Label>
          <Input
            id="issuer"
            value={formData.issuer}
            onChange={(e) => {
              setFormData({ ...formData, issuer: e.target.value });
              setIssuerError('');
            }}
            placeholder="e.g., Chase, Amex, Citi"
            minLength={2}
            maxLength={100}
          />
          {issuerError && (
            <p className="text-sm text-destructive">{issuerError}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Name of the bank or financial institution
          </p>
        </div>

        {/* Reward Type */}
        <div className="space-y-2">
          <Label>Reward Type</Label>
          <RadioGroup
            value={formData.type}
            onValueChange={(value) => setFormData({ ...formData, type: value as 'cashback' | 'miles' })}
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

        {/* Billing Cycle */}
        <div className="space-y-2">
          <Label>Billing Cycle</Label>
          <RadioGroup
            value={formData.billingCycleType}
            onValueChange={(value) => setFormData({ ...formData, billingCycleType: value as 'calendar' | 'billing' })}
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

          {formData.billingCycleType === 'billing' && (
            <div className="ml-6 mt-3">
              <Label htmlFor="billingDay">Statement closes on day</Label>
              <Select
                value={String(formData.billingCycleDay)}
                onValueChange={(value) => setFormData({ ...formData, billingCycleDay: parseInt(value) })}
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
            {formData.type === 'cashback' ? (
              <>
                <div className="relative flex-1">
                  <Input
                    id="earningRate"
                    type="number"
                    value={formData.earningRate}
                    onChange={(e) => setFormData({ ...formData, earningRate: parseFloat(e.target.value) || 0 })}
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
                    value={formData.earningRate}
                    onChange={(e) => setFormData({ ...formData, earningRate: parseFloat(e.target.value) || 0 })}
                    step="0.1"
                    min="0"
                    placeholder="e.g., 1.5"
                  />
                </div>
                <span className="text-sm text-muted-foreground">miles per</span>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    value={formData.milesBlockSize}
                    onChange={(e) => setFormData({ ...formData, milesBlockSize: parseInt(e.target.value) || 1 })}
                    step="1"
                    min="1"
                    className="w-24 pl-8"
                    placeholder="1"
                  />
                </div>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formData.type === 'cashback'
              ? 'Percentage of cashback earned on purchases'
              : 'Number of miles earned per dollar (or per spending block) spent'}
          </p>
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
            checked={formData.active}
            onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t">
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