'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, DollarSign, Hash, Layers, Percent, Target, TrendingUp, X } from 'lucide-react';
import type { RewardRule } from '@/lib/storage';
import { validateRewardRule } from '@/lib/validators/rewardRule';

export interface RuleFormProps {
  mode: 'new' | 'edit';
  cardName: string;
  initialRule: RewardRule;
  onSubmit: (rule: RewardRule) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export default function RuleForm({ mode, cardName, initialRule, onSubmit, onCancel, onDelete }: RuleFormProps) {
  const [form, setForm] = useState<RewardRule>(initialRule);
  const [categoryInput, setCategoryInput] = useState('');
  const [capCategory, setCapCategory] = useState('');
  const [capMax, setCapMax] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  const categoryOptions = useMemo(() => Array.from(new Set((form.categories || []).map(c => c.toLowerCase()))).sort(), [form.categories]);

  function addCategory() {
    const trimmed = categoryInput.trim().toLowerCase();
    if (!trimmed) return;
    if (categoryOptions.includes(trimmed)) {
      setErrors(prev => ({ ...prev, category: 'Category already added' }));
      return;
    }
    setForm(prev => ({ ...prev, categories: [...(prev.categories || []), trimmed] }));
    setCategoryInput('');
    setErrors(prev => ({ ...prev, category: '' }));
  }

  function removeCategory(category: string) {
    setForm(prev => ({
      ...prev,
      categories: (prev.categories || []).filter(c => c !== category),
      categoryCaps: (prev.categoryCaps || []).filter(cap => cap.category !== category),
    }));
  }

  function addCap() {
    const cat = capCategory.trim().toLowerCase();
    const max = Number(capMax);
    if (!cat) { setErrors(prev => ({ ...prev, cap: 'Please select a category' })); return; }
    if (!isFinite(max) || max <= 0) { setErrors(prev => ({ ...prev, cap: 'Please enter a valid maximum spend' })); return; }
    if (!categoryOptions.includes(cat)) { setErrors(prev => ({ ...prev, cap: 'Category not found in rule' })); return; }
    if ((form.categoryCaps || []).some(c => c.category === cat)) { setErrors(prev => ({ ...prev, cap: 'Cap already exists for this category' })); return; }
    setForm(prev => ({ ...prev, categoryCaps: [...(prev.categoryCaps || []), { category: cat, maxSpend: max }] }));
    setCapCategory('');
    setCapMax('');
    setErrors(prev => ({ ...prev, cap: '' }));
  }

  function removeCap(index: number) {
    setForm(prev => ({ ...prev, categoryCaps: (prev.categoryCaps || []).filter((_, i) => i !== index) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const candidate: RewardRule = {
      ...form,
      name: form.name.trim(),
      milesBlockSize: form.rewardType === 'miles' ? form.milesBlockSize : undefined,
    };
    const result = validateRewardRule(candidate as any);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError(Object.values(result.errors)[0] || 'Please fix the highlighted errors');
      return;
    }
    setErrors({});
    onSubmit(candidate);
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">{mode === 'new' ? 'New Reward Rule' : 'Edit Reward Rule'}</CardTitle>
          <CardDescription>
            Configure how {cardName} earns rewards
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Basic Information
            </h3>

            <div>
              <label className="text-sm font-medium mb-2 block">Rule Name</label>
              <input
                className={`w-full px-3 py-2 border rounded-md text-sm ${errors.name ? 'border-red-500' : ''}`}
                placeholder="e.g., Q1 2025 Bonus Categories"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
              {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Start Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input type="date" className="w-full pl-10 pr-3 py-2 border rounded-md text-sm" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">End Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input type="date" className="w-full pl-10 pr-3 py-2 border rounded-md text-sm" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
                </div>
                {errors.endDate && <p className="text-sm text-red-500 mt-1">{errors.endDate}</p>}
              </div>
            </div>
          </div>

          <div className="border-t pt-6" />

          {/* Reward Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Reward Configuration
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Reward Type</label>
                <Select value={form.rewardType} onValueChange={(value: 'cashback' | 'miles') => setForm({ ...form, rewardType: value, milesBlockSize: value === 'miles' ? form.milesBlockSize : undefined })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashback"><div className="flex items-center gap-2"><Percent className="h-3 w-3" /> Cashback</div></SelectItem>
                    <SelectItem value="miles"><div className="flex items-center gap-2"><Hash className="h-3 w-3" /> Miles</div></SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Reward Value</label>
                <div className="relative">
                  {form.rewardType === 'cashback' ? <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /> : <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />}
                  <input type="number" step="0.01" min={0.01} className={`w-full pl-10 pr-3 py-2 border rounded-md text-sm ${errors.rewardValue ? 'border-red-500' : ''}`} value={form.rewardValue} onChange={e => setForm({ ...form, rewardValue: Number(e.target.value) })} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{form.rewardType === 'cashback' ? '% of spend as cashback' : 'Miles per dollar'}</p>
                {errors.rewardValue && <p className="text-sm text-red-500 mt-1">{errors.rewardValue}</p>}
              </div>

              {form.rewardType === 'miles' && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Block Size (Optional)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input type="number" step="1" min={1} className={`w-full pl-10 pr-3 py-2 border rounded-md text-sm ${errors.milesBlockSize ? 'border-red-500' : ''}`} value={form.milesBlockSize || ''} onChange={e => setForm({ ...form, milesBlockSize: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Spending rounded down to blocks</p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t pt-6" />

          {/* Spending Limits */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              Spending Limits
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Minimum Spend (Optional)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input type="number" step="0.01" min={0} className={`w-full pl-10 pr-3 py-2 border rounded-md text-sm ${errors.minimumSpend ? 'border-red-500' : ''}`} value={form.minimumSpend ?? ''} onChange={e => setForm({ ...form, minimumSpend: e.target.value ? Number(e.target.value) : undefined })} />
                </div>
                {errors.minimumSpend && <p className="text-sm text-red-500 mt-1">{errors.minimumSpend}</p>}
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Maximum Spend (Optional)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input type="number" step="0.01" min={0.01} className={`w-full pl-10 pr-3 py-2 border rounded-md text-sm ${errors.maximumSpend ? 'border-red-500' : ''}`} value={form.maximumSpend ?? ''} onChange={e => setForm({ ...form, maximumSpend: e.target.value ? Number(e.target.value) : undefined })} />
                </div>
                {errors.maximumSpend && <p className="text-sm text-red-500 mt-1">{errors.maximumSpend}</p>}
                {errors.spendRange && <p className="text-sm text-red-500 mt-1">{errors.spendRange}</p>}
              </div>
            </div>
          </div>

          <div className="border-t pt-6" />

          {/* Categories and Caps */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Eligible Categories</h3>
            <div className="flex flex-wrap gap-2">
              {(form.categories || []).map(cat => (
                <Badge key={cat} variant="outline" className="flex items-center gap-2">
                  {cat}
                  <button type="button" aria-label={`Remove ${cat}`} onClick={() => removeCategory(cat)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 px-3 py-2 border rounded-md text-sm" placeholder="e.g., dining, online" value={categoryInput} onChange={e => setCategoryInput(e.target.value)} />
              <Button type="button" variant="secondary" onClick={addCategory}>Add Category</Button>
            </div>
            {errors.category && <p className="text-sm text-red-500">{errors.category}</p>}

            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Per‑category caps</h4>
              <div className="flex items-center gap-2 mb-2">
                <Select value={capCategory} onValueChange={setCapCategory}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative w-40">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input className="w-full pl-10 pr-3 py-2 border rounded-md text-sm" placeholder="Max" type="number" step="0.01" min={0.01} value={capMax} onChange={e => setCapMax(e.target.value)} />
                </div>
                <Button type="button" variant="secondary" onClick={addCap}>Add Cap</Button>
              </div>
              {errors.cap && <p className="text-sm text-red-500">{errors.cap}</p>}
              {(form.categoryCaps || []).length > 0 && (
                <div className="space-y-2">
                  {(form.categoryCaps || []).map((cap, i) => (
                    <div key={`${cap.category}-${i}`} className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-2">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{cap.category}</Badge>
                        <span className="text-sm">Max: <span className="font-medium">${cap.maxSpend}</span></span>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeCap(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="border-t pt-6" />

          {/* Advanced Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Advanced Settings</h3>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">Rule Status</label>
                <p className="text-xs text-muted-foreground">Active rules will be used for reward calculations</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                <span className="ml-3 text-sm font-medium">{form.active ? 'Active' : 'Inactive'}</span>
              </label>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Priority</label>
              <div className="flex items-center gap-3">
                <input type="number" className="w-24 px-3 py-2 border rounded-md text-sm" value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })} />
                <p className="text-xs text-muted-foreground">Higher priority rules are applied first when multiple rules match</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 mt-6">
        <Button type="submit" size="lg">{mode === 'new' ? 'Create Rule' : 'Save Changes'}</Button>
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>Cancel</Button>
        {mode === 'edit' && onDelete && (
          <div className="ml-auto" />
        )}
        {mode === 'edit' && onDelete && (
          <Button type="button" variant="destructive" size="lg" onClick={onDelete}>Delete</Button>
        )}
      </div>
    </form>
  );
}

