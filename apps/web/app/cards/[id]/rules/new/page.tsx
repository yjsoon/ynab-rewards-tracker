"use client";

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCreditCards, useRewardRules } from '@/hooks/useLocalStorage';
import type { RewardRule } from '@/lib/storage';
import RuleForm from '@/components/rules/RuleForm';

function uid() { return Math.random().toString(36).slice(2); }

export default function NewRulePage() {
  const params = useParams();
  const cardId = params.id as string;
  const router = useRouter();
  const { cards } = useCreditCards();
  const { saveRule } = useRewardRules(cardId);

  const card = useMemo(() => cards.find(c => c.id === cardId), [cards, cardId]);
  useEffect(() => { if (!card && cards.length > 0) router.push('/'); }, [card, cards.length, router]);
  if (!card) return null;

  const initial: RewardRule = {
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
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <RuleForm
        mode="new"
        cardName={card.name}
        initialRule={initial}
        onSubmit={(rule) => { saveRule(rule); router.push(`/cards/${cardId}`); }}
        onCancel={() => router.push(`/cards/${cardId}`)}
      />
    </div>
  );
}

