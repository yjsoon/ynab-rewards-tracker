'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCreditCards, useTagMappings } from '@/hooks/useLocalStorage';
import type { TagMapping } from '@/lib/storage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function EditMappingPage() {
  const params = useParams();
  const cardId = params.id as string;
  const mappingId = params.mappingId as string;
  const router = useRouter();
  const { cards } = useCreditCards();
  const { mappings, saveMapping, deleteMapping } = useTagMappings(cardId);

  const card = useMemo(() => cards.find(c => c.id === cardId), [cards, cardId]);
  const existing = useMemo(() => mappings.find(m => m.id === mappingId), [mappings, mappingId]);

  const [form, setForm] = useState<TagMapping | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => { if (existing) setForm(existing); }, [existing]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.ynabTag.trim() || !form.rewardCategory.trim()) { setMessage('Please enter both the YNAB tag and reward category.'); return; }
    saveMapping({ ...form, ynabTag: form.ynabTag.trim(), rewardCategory: form.rewardCategory.trim() });
    router.push(`/cards/${cardId}`);
  }

  if (!card || !form) return null;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit Tag Mapping</CardTitle>
          <CardDescription>Update mapping between YNAB tag and reward category</CardDescription>
        </CardHeader>
        <CardContent>
          {message && <p className="mb-4 text-sm text-orange-600">{message}</p>}
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm mb-1">YNAB tag (flag colour or name)</label>
              <input
                className="w-full px-3 py-2 border rounded"
                value={form.ynabTag}
                onChange={e => setForm(prev => (prev ? { ...prev, ynabTag: e.target.value } : prev))}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Reward category</label>
              <input
                className="w-full px-3 py-2 border rounded"
                value={form.rewardCategory}
                onChange={e => setForm(prev => (prev ? { ...prev, rewardCategory: e.target.value } : prev))}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit">Save Changes</Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/cards/${cardId}`}>Cancel</Link>
              </Button>
              <div className="ml-auto" />
              <Button type="button" variant="destructive" onClick={() => { deleteMapping(mappingId); router.push(`/cards/${cardId}`); }}>Delete</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
