'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCreditCards, useTagMappings } from '@/hooks/useLocalStorage';
import type { TagMapping } from '@/lib/storage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function uid() { return Math.random().toString(36).slice(2); }

export default function NewMappingPage() {
  const params = useParams();
  const cardId = params.id as string;
  const router = useRouter();
  const { cards } = useCreditCards();
  const { saveMapping } = useTagMappings(cardId);

  const card = useMemo(() => cards.find(c => c.id === cardId), [cards, cardId]);
  const [form, setForm] = useState<TagMapping>({ id: uid(), cardId, ynabTag: '', rewardCategory: '' });
  const [message, setMessage] = useState('');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ynabTag.trim() || !form.rewardCategory.trim()) { setMessage('Please enter both the YNAB tag and reward category.'); return; }
    saveMapping({ ...form, ynabTag: form.ynabTag.trim(), rewardCategory: form.rewardCategory.trim() });
    router.push(`/cards/${cardId}`);
  }

  if (!card) return null;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>New Tag Mapping</CardTitle>
          <CardDescription>Map a YNAB tag to a reward category</CardDescription>
        </CardHeader>
        <CardContent>
          {message && <p className="mb-4 text-sm text-orange-600">{message}</p>}
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm mb-1">YNAB tag (flag colour or name)</label>
              <input className="w-full px-3 py-2 border rounded" value={form.ynabTag} onChange={e => setForm({ ...form, ynabTag: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm mb-1">Reward category</label>
              <input className="w-full px-3 py-2 border rounded" value={form.rewardCategory} onChange={e => setForm({ ...form, rewardCategory: e.target.value })} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit">Save Mapping</Button>
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

