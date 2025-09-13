"use client";

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCreditCards, useRewardRules } from '@/hooks/useLocalStorage';
import RuleForm from '@/components/rules/RuleForm';

export default function EditRulePage() {
  const params = useParams();
  const cardId = params.id as string;
  const ruleId = params.ruleId as string;
  const router = useRouter();
  const { cards } = useCreditCards();
  const { rules, saveRule, deleteRule } = useRewardRules(cardId);

  const card = useMemo(() => cards.find(c => c.id === cardId), [cards, cardId]);
  const existing = useMemo(() => rules.find(r => r.id === ruleId), [rules, ruleId]);

  useEffect(() => { if (!card && cards.length > 0) router.push('/'); }, [card, cards.length, router]);
  if (!card || !existing) return null;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <RuleForm
        mode="edit"
        cardName={card.name}
        initialRule={existing}
        onSubmit={(rule) => { saveRule(rule); router.push(`/cards/${cardId}`); }}
        onCancel={() => router.push(`/cards/${cardId}`)}
        onDelete={() => { deleteRule(ruleId); router.push(`/cards/${cardId}`); }}
      />
    </div>
  );
}
