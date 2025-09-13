'use client';

import { z } from 'zod';

export const rewardTypeEnum = z.enum(['cashback', 'miles']);

export const categoryCapSchema = z.object({
  category: z.string().min(1),
  maxSpend: z.number().positive(),
});

export const rewardRuleSchema = z.object({
  id: z.string().min(1),
  cardId: z.string().min(1),
  name: z.string().trim().min(1, 'Rule name is required'),
  rewardType: rewardTypeEnum,
  rewardValue: z.number().positive('Reward value must be positive'),
  milesBlockSize: z.number().int().positive().optional(),
  categories: z.array(z.string().min(1)).default([]),
  minimumSpend: z.number().min(0).optional(),
  maximumSpend: z.number().positive().optional(),
  categoryCaps: z.array(categoryCapSchema).optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  active: z.boolean().default(true),
  priority: z.number().int().default(0),
}).superRefine((rule, ctx) => {
  // milesBlockSize only valid for miles
  if (rule.rewardType === 'cashback' && rule.milesBlockSize !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['milesBlockSize'], message: 'Block size applies to miles only' });
  }

  // start <= end
  const start = new Date(rule.startDate);
  const end = new Date(rule.endDate);
  if (start > end) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'End date must be on or after start date' });
  }

  // min < max when both present
  if (rule.minimumSpend !== undefined && rule.maximumSpend !== undefined) {
    if (rule.minimumSpend >= rule.maximumSpend) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maximumSpend'], message: 'Maximum spend must be greater than minimum spend' });
    }
  }

  // Caps must reference existing categories
  const cats = new Set((rule.categories || []).map(c => c.toLowerCase()));
  for (const cap of rule.categoryCaps || []) {
    if (!cats.has(cap.category.toLowerCase())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['categoryCaps'], message: `Cap refers to missing category: ${cap.category}` });
    }
  }
});

export type RewardRuleInput = z.infer<typeof rewardRuleSchema>;

export function validateRewardRule(input: RewardRuleInput) {
  const parsed = rewardRuleSchema.safeParse(input);
  if (parsed.success) return { ok: true as const, value: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = (issue.path[0] as string) || 'form';
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false as const, errors };
}

