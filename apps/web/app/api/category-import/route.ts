import { NextResponse } from 'next/server';
import {
  completeCategoryImportChat,
  defaultModelFor,
  fetchCategoryImportTerms,
  getCategoryImportProvider,
  parseCategoryImportSource,
  proposeCardCategories,
  type ExistingCategoryImportSubcategory,
} from '@ynab-counter/app-core/category-import';
import type { CategoryImportProvider, CreditCard } from '@ynab-counter/app-core/storage/types';
import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from '@ynab-counter/app-core/ynab/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PROVIDERS: CategoryImportProvider[] = ['openai', 'openrouter', 'opencode'];
const CARD_TYPES: Array<CreditCard['type']> = ['cashback', 'miles'];
const FLAG_VALUES = new Set<string>([
  UNFLAGGED_FLAG.value,
  ...YNAB_FLAG_COLORS.map((flag) => flag.value),
]);

interface CategoryImportBody {
  provider?: string;
  model?: string;
  apiKey?: string;
  cardType?: string;
  instructions?: string;
  termsUrl?: string;
  earningRate?: number | null;
  existingSubcategories?: Array<{
    name?: string;
    flagColor?: string;
    id?: string;
    createdAt?: string;
  }>;
}

export async function POST(request: Request) {
  let body: CategoryImportBody;
  try {
    body = await request.json() as CategoryImportBody;
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (!isProvider(body.provider)) {
    return NextResponse.json({ error: 'Choose OpenAI, OpenRouter, or OpenCode.' }, { status: 400 });
  }
  if (!isCardType(body.cardType)) {
    return NextResponse.json({ error: 'Card type must be cashback or miles.' }, { status: 400 });
  }
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!apiKey) {
    const label = getCategoryImportProvider(body.provider).label;
    return NextResponse.json({
      error: `Add ${articleFor(label)} ${label} API key.`,
    }, { status: 400 });
  }

  const source = parseCategoryImportSource({
    instructions: typeof body.instructions === 'string' ? body.instructions : undefined,
    termsUrl: typeof body.termsUrl === 'string' ? body.termsUrl : undefined,
  });
  if (source.kind !== 'ok') {
    return NextResponse.json({ error: source.message, kind: source.kind }, { status: 400 });
  }

  const model = typeof body.model === 'string' && body.model.trim()
    ? body.model.trim()
    : defaultModelFor(body.provider);

  const result = await proposeCardCategories(
    {
      cardType: body.cardType,
      source: source.source,
      earningRate: typeof body.earningRate === 'number' ? body.earningRate : null,
      existingSubcategories: parseExisting(body.existingSubcategories),
    },
    { provider: body.provider, apiKey, model },
    {
      fetchText: (url) => fetchCategoryImportTerms({ url }),
      completeChat: (input) => completeCategoryImportChat(input),
    },
  );

  if (result.kind !== 'ok') {
    const status = result.kind === 'provider_failed' ? 502 : result.kind === 'unparseable' ? 422 : 400;
    return NextResponse.json({ error: result.message, kind: result.kind }, { status });
  }

  return NextResponse.json({ proposal: result.proposal });
}

function articleFor(label: string): 'a' | 'an' {
  return /^[aeiou]/i.test(label) ? 'an' : 'a';
}

function isProvider(value: unknown): value is CategoryImportProvider {
  return typeof value === 'string' && PROVIDERS.includes(value as CategoryImportProvider);
}

function isCardType(value: unknown): value is CreditCard['type'] {
  return typeof value === 'string' && CARD_TYPES.includes(value as CreditCard['type']);
}

function parseExisting(
  value: CategoryImportBody['existingSubcategories'],
): ExistingCategoryImportSubcategory[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const rows = value.flatMap((entry) => {
    if (
      !entry
      || typeof entry.name !== 'string'
      || !entry.name.trim()
      || typeof entry.flagColor !== 'string'
      || !FLAG_VALUES.has(entry.flagColor)
    ) {
      return [];
    }
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt.trim() : '';
    return [{
      name: entry.name.trim(),
      flagColor: entry.flagColor as YnabFlagColor,
      ...(id ? { id } : {}),
      ...(createdAt ? { createdAt } : {}),
    }];
  });
  return rows.length > 0 ? rows : undefined;
}
