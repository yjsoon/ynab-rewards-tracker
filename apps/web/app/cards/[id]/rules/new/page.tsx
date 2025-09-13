'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCreditCards, useRewardRules } from '@/hooks/useLocalStorage';
import type { RewardRule } from '@/lib/storage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

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
  const [message, setMessage] = useState('');

  function addCategory() {
    const trimmed = categoryInput.trim();
    if (!trimmed) return;
    setForm(prev => ({ ...prev, categories: Array.from(new Set([...prev.categories, trimmed])) }));
    setCategoryInput('');
  }

  function addCap() {
    const cat = capCategory.trim();
    const max = Number(capMax);
    if (!cat || !isFinite(max) || max <= 0) return;
    setForm(prev => ({ ...prev, categoryCaps: [...(prev.categoryCaps || []), { category: cat, maxSpend: max }] }));
    setCapCategory('');
    setCapMax('');
  }

  function removeCap(index: number) {
    setForm(prev => ({ ...prev, categoryCaps: (prev.categoryCaps || []).filter((_, i) => i !== index) }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setMessage('Please enter a rule name.'); return; }
    if (!['cashback','miles'].includes(form.rewardType)) { setMessage('Invalid reward type.'); return; }
    if (!isFinite(form.rewardValue) || form.rewardValue <= 0) { setMessage('Enter a positive reward value.'); return; }
    saveRule({ ...form, name: form.name.trim() });
    router.push(`/cards/${cardId}`);
  }

  if (!card) return null;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>New Reward Rule</CardTitle>
          <CardDescription>Define how rewards are calculated for this card</CardDescription>
        </CardHeader>
        <CardContent>
          {message && <p className="mb-4 text-sm text-orange-600">{message}</p>}
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm mb-1">Rule name</label>
              <input className="w-full px-3 py-2 border rounded" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm mb-1">Reward type</label>
                <select className="w-full px-3 py-2 border rounded" value={form.rewardType} onChange={e => setForm({ ...form, rewardType: e.target.value as any })}>
                  <option value="cashback">Cashback</option>
                  <option value="miles">Miles</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Reward value</label>
                <input type="number" step="0.01" className="w-full px-3 py-2 border rounded" value={form.rewardValue} onChange={e => setForm({ ...form, rewardValue: Number(e.target.value) })} />
                <p className="text-xs text-muted-foreground mt-1">% for cashback; units per dollar for miles</p>
              </div>
              <div>
                <label className="block text-sm mb-1">Block size ($)</label>
                <input type="number" step="1" className="w-full px-3 py-2 border rounded" value={form.milesBlockSize || ''} onChange={e => setForm({ ...form, milesBlockSize: e.target.value ? Number(e.target.value) : undefined })} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Minimum spend ($)</label>
                <input type="number" step="0.01" className="w-full px-3 py-2 border rounded" value={form.minimumSpend ?? ''} onChange={e => setForm({ ...form, minimumSpend: e.target.value ? Number(e.target.value) : undefined })} />
              </div>
              <div>
                <label className="block text-sm mb-1">Maximum spend ($)</label>
                <input type="number" step="0.01" className="w-full px-3 py-2 border rounded" value={form.maximumSpend ?? ''} onChange={e => setForm({ ...form, maximumSpend: e.target.value ? Number(e.target.value) : undefined })} />
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1">Eligible categories</label>
              <div className="flex gap-2">
                <input className="flex-1 px-3 py-2 border rounded" placeholder="e.g. food, online" value={categoryInput} onChange={e => setCategoryInput(e.target.value)} />
                <Button type="button" variant="outline" onClick={addCategory}>Add</Button>
              </div>
              {form.categories.length > 0 && (
                <p className="mt-2 text-sm">{form.categories.join(', ')}</p>
              )}
            </div>

            <div>
              <label className="block text-sm mb-1">Per‑category caps</label>
              <div className="flex gap-2">
                <input className="flex-1 px-3 py-2 border rounded" placeholder="category" value={capCategory} onChange={e => setCapCategory(e.target.value)} />
                <input className="w-36 px-3 py-2 border rounded" placeholder="max $" type="number" step="0.01" value={capMax} onChange={e => setCapMax(e.target.value)} />
                <Button type="button" variant="outline" onClick={addCap}>Add</Button>
              </div>
              {form.categoryCaps && form.categoryCaps.length > 0 && (
                <ul className="mt-2 text-sm space-y-1">
                  {form.categoryCaps.map((c, i) => (
                    <li key={`${c.category}-${i}`} className="flex justify-between items-center border rounded px-2 py-1">
                      <span>{c.category}: ${c.maxSpend}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeCap(i)}>Remove</Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm mb-1">Start date</label>
                <input type="date" className="w-full px-3 py-2 border rounded" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm mb-1">End date</label>
                <input type="date" className="w-full px-3 py-2 border rounded" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
              </div>
              <div className="flex items-end gap-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active
                </label>
                <input type="number" className="w-24 px-3 py-2 border rounded" value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })} />
                <span className="text-sm text-muted-foreground">Priority</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit">Save Rule</Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/cards/${cardId}`}>Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
