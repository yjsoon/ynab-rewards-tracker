'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCreditCards, useRewardRules } from '@/hooks/useLocalStorage';
import type { RewardRule } from '@/lib/storage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import {
  AlertCircle,
  Plus,
  X,
  Calendar,
  DollarSign,
  Percent,
  Hash,
  Layers,
  Target,
  TrendingUp
} from 'lucide-react';

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function NewRulePage() {
  const params = useParams();
  const cardId = params.id as string;
  const router = useRouter();
  const { cards } = useCreditCards();
  const { saveRule } = useRewardRules(cardId);

  const card = useMemo(() => cards.find(c => c.id === cardId), [cards, cardId]);

  useEffect(() => {
    if (!card && cards.length > 0) router.push('/');
  }, [card, cards.length, router]);

  const [form, setForm] = useState<RewardRule>({
    id: uid(),
    cardId,
    name: '',
    rewardType: 'cashback',
    rewardValue: 1,
    categories: [],
    minimumSpend: undefined,
    maximumSpend: undefined,
    categoryCaps: [],
    milesBlockSize: undefined,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
    active: true,
    priority: 0,
  });

  const [categoryInput, setCategoryInput] = useState('');
  const [capCategory, setCapCategory] = useState('');
  const [capMax, setCapMax] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function addCategory() {
    const trimmed = categoryInput.trim().toLowerCase();
    if (!trimmed) return;
    if (form.categories.includes(trimmed)) {
      setErrors({ ...errors, category: 'Category already added' });
      setTimeout(() => setErrors(e => ({ ...e, category: '' })), 3000);
      return;
    }
    setForm(prev => ({ ...prev, categories: [...prev.categories, trimmed] }));
    setCategoryInput('');
  }

  function removeCategory(category: string) {
    setForm(prev => ({
      ...prev,
      categories: prev.categories.filter(c => c !== category),
      categoryCaps: (prev.categoryCaps || []).filter(cap => cap.category !== category)
    }));
  }

  function addCap() {
    const cat = capCategory.trim().toLowerCase();
    const max = Number(capMax);

    if (!cat) {
      setErrors({ ...errors, cap: 'Please select a category' });
      return;
    }
    if (!isFinite(max) || max <= 0) {
      setErrors({ ...errors, cap: 'Please enter a valid maximum spend' });
      return;
    }
    if ((form.categoryCaps || []).some(c => c.category === cat)) {
      setErrors({ ...errors, cap: 'Cap already exists for this category' });
      return;
    }

    setForm(prev => ({
      ...prev,
      categoryCaps: [...(prev.categoryCaps || []), { category: cat, maxSpend: max }]
    }));
    setCapCategory('');
    setCapMax('');
    setErrors({ ...errors, cap: '' });
  }

  function removeCap(index: number) {
    setForm(prev => ({
      ...prev,
      categoryCaps: (prev.categoryCaps || []).filter((_, i) => i !== index)
    }));
  }

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) {
      newErrors.name = 'Rule name is required';
    }
    if (!isFinite(form.rewardValue) || form.rewardValue <= 0) {
      newErrors.rewardValue = 'Please enter a positive reward value';
    }
    if (form.rewardType === 'miles' && form.milesBlockSize &&
        (!isFinite(form.milesBlockSize) || form.milesBlockSize <= 0)) {
      newErrors.blockSize = 'Please enter a valid block size';
    }
    if (form.minimumSpend !== undefined && form.minimumSpend < 0) {
      newErrors.minSpend = 'Minimum spend cannot be negative';
    }
    if (form.maximumSpend !== undefined && form.maximumSpend <= 0) {
      newErrors.maxSpend = 'Maximum spend must be positive';
    }
    if (form.minimumSpend && form.maximumSpend && form.minimumSpend >= form.maximumSpend) {
      newErrors.spendRange = 'Maximum spend must be greater than minimum spend';
    }

    // Date window validation
    if (form.startDate && form.endDate) {
      const start = new Date(form.startDate);
      const end = new Date(form.endDate);
      if (start > end) {
        newErrors.dateRange = 'End date must be on or after start date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    saveRule({ ...form, name: form.name.trim() });
    router.push(`/cards/${cardId}`);
  }

  if (!card) return null;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">New Reward Rule</CardTitle>
            <CardDescription>
              Configure how {card.name} earns rewards
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Basic Information
              </h3>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Rule Name
                </label>
                <input
                  className={`w-full px-3 py-2 border rounded-md text-sm ${
                    errors.name ? 'border-red-500' : ''
                  }`}
                  placeholder="e.g., Q1 2025 Bonus Categories"
                  value={form.name}
                  onChange={e => {
                    setForm({ ...form, name: e.target.value });
                    if (errors.name) setErrors({ ...errors, name: '' });
                  }}
                />
                {errors.name && (
                  <p className="text-sm text-red-500 mt-1">{errors.name}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Start Date
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="date"
                      className="w-full pl-10 pr-3 py-2 border rounded-md text-sm"
                      value={form.startDate}
                      onChange={e => setForm({ ...form, startDate: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    End Date
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="date"
                      className="w-full pl-10 pr-3 py-2 border rounded-md text-sm"
                      value={form.endDate}
                      onChange={e => setForm({ ...form, endDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-6" />

            {/* Reward Configuration Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Reward Configuration
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Reward Type
                  </label>
                  <Select
                    value={form.rewardType}
                    onValueChange={(value: 'cashback' | 'miles') => {
                      setForm({ ...form, rewardType: value, milesBlockSize: value === 'miles' ? form.milesBlockSize : undefined });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cashback">
                        <div className="flex items-center gap-2">
                          <Percent className="h-3 w-3" />
                          Cashback
                        </div>
                      </SelectItem>
                      <SelectItem value="miles">
                        <div className="flex items-center gap-2">
                          <Hash className="h-3 w-3" />
                          Miles
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Reward Value
                  </label>
                  <div className="relative">
                    {form.rewardType === 'cashback' ?
                      <Percent className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" /> :
                      <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    }
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className={`w-full pl-10 pr-3 py-2 border rounded-md text-sm ${
                        errors.rewardValue ? 'border-red-500' : ''
                      }`}
                      placeholder={form.rewardType === 'cashback' ? '1.5' : '2'}
                      value={form.rewardValue}
                      onChange={e => {
                        setForm({ ...form, rewardValue: Number(e.target.value) });
                        if (errors.rewardValue) setErrors({ ...errors, rewardValue: '' });
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.rewardType === 'cashback'
                      ? '% of spend as cashback'
                      : 'Miles per dollar'}
                  </p>
                  {errors.rewardValue && (
                    <p className="text-sm text-red-500 mt-1">{errors.rewardValue}</p>
                  )}
                </div>

                {form.rewardType === 'miles' && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Block Size (Optional)
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="number"
                        step="1"
                        min="1"
                        className={`w-full pl-10 pr-3 py-2 border rounded-md text-sm ${
                          errors.blockSize ? 'border-red-500' : ''
                        }`}
                        placeholder="5"
                        value={form.milesBlockSize || ''}
                        onChange={e => {
                          setForm({
                            ...form,
                            milesBlockSize: e.target.value ? Number(e.target.value) : undefined
                          });
                          if (errors.blockSize) setErrors({ ...errors, blockSize: '' });
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Spending rounded down to blocks
                    </p>
                    {errors.blockSize && (
                      <p className="text-sm text-red-500 mt-1">{errors.blockSize}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t pt-6" />

            {/* Spending Limits Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Target className="h-4 w-4" />
                Spending Limits
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Minimum Spend (Optional)
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={`w-full pl-10 pr-3 py-2 border rounded-md text-sm ${
                        errors.minSpend ? 'border-red-500' : ''
                      }`}
                      placeholder="500"
                      value={form.minimumSpend ?? ''}
                      onChange={e => {
                        setForm({
                          ...form,
                          minimumSpend: e.target.value ? Number(e.target.value) : undefined
                        });
                        if (errors.minSpend || errors.spendRange) {
                          setErrors({ ...errors, minSpend: '', spendRange: '' });
                        }
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    No rewards until this amount
                  </p>
                  {errors.minSpend && (
                    <p className="text-sm text-red-500 mt-1">{errors.minSpend}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Maximum Spend (Optional)
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="number"
                      step="0.01"
                      className={`w-full pl-10 pr-3 py-2 border rounded-md text-sm ${
                        errors.maxSpend ? 'border-red-500' : ''
                      }`}
                      placeholder="1500"
                      value={form.maximumSpend ?? ''}
                      onChange={e => {
                        setForm({
                          ...form,
                          maximumSpend: e.target.value ? Number(e.target.value) : undefined
                        });
                        if (errors.maxSpend || errors.spendRange) {
                          setErrors({ ...errors, maxSpend: '', spendRange: '' });
                        }
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Rewards capped at this amount
                  </p>
                  {errors.maxSpend && (
                    <p className="text-sm text-red-500 mt-1">{errors.maxSpend}</p>
                  )}
                </div>
              </div>

              {errors.spendRange && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{errors.spendRange}</AlertDescription>
                </Alert>
              )}
            </div>

            <div className="border-t pt-6" />

            {/* Categories Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">
                Eligible Categories
              </h3>
              <p className="text-sm text-muted-foreground">
                Leave empty to apply to all purchases, or specify categories for bonus rewards
              </p>

              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 border rounded-md text-sm"
                  placeholder="Enter category (e.g., dining, grocery, travel)"
                  value={categoryInput}
                  onChange={e => setCategoryInput(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addCategory())}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addCategory}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>

              {errors.category && (
                <p className="text-sm text-red-500">{errors.category}</p>
              )}

              {form.categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.categories.map(cat => (
                    <Badge
                      key={cat}
                      variant="secondary"
                      className="pl-3 pr-1 py-1 gap-2"
                    >
                      {cat}
                      <button
                        type="button"
                        onClick={() => removeCategory(cat)}
                        className="ml-1 rounded-full hover:bg-muted p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Per-Category Caps Section */}
            {form.categories.length > 0 && (
              <>
                <div className="border-t pt-6" />
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">
                    Per-Category Spending Caps
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Set maximum reward amounts for specific categories
                  </p>

                  <div className="flex gap-2">
                    <Select value={capCategory} onValueChange={setCapCategory}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {form.categories
                          .filter(cat => !(form.categoryCaps || []).some(c => c.category === cat))
                          .map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>

                    <div className="relative w-40">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        className="w-full pl-10 pr-3 py-2 border rounded-md text-sm"
                        placeholder="Max"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={capMax}
                        onChange={e => setCapMax(e.target.value)}
                      />
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={addCap}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Cap
                    </Button>
                  </div>

                  {errors.cap && (
                    <p className="text-sm text-red-500">{errors.cap}</p>
                  )}

                  {form.categoryCaps && form.categoryCaps.length > 0 && (
                    <div className="space-y-2">
                      {form.categoryCaps.map((cap, i) => (
                        <div
                          key={`${cap.category}-${i}`}
                          className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-2"
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">{cap.category}</Badge>
                            <span className="text-sm">
                              Max: <span className="font-medium">${cap.maxSpend}</span>
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCap(i)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="border-t pt-6" />

            {/* Advanced Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Advanced Settings</h3>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">Rule Status</label>
                  <p className="text-xs text-muted-foreground">
                    Active rules will be used for reward calculations
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={form.active}
                    onChange={e => setForm({ ...form, active: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  <span className="ml-3 text-sm font-medium">
                    {form.active ? 'Active' : 'Inactive'}
                  </span>
                </label>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Priority
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    className="w-24 px-3 py-2 border rounded-md text-sm"
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: Number(e.target.value) })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Higher priority rules are applied first when multiple rules match
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 mt-6">
          <Button type="submit" size="lg">
            Create Rule
          </Button>
          <Button type="button" variant="outline" size="lg" asChild>
            <Link href={`/cards/${cardId}`}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
