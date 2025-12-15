import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import type { StatementFormatterProvider, StatementFormatterTransaction } from '@/types/statement-formatter';

const PROVIDER_DEFAULT_MODEL: Record<StatementFormatterProvider, string> = {
  gemini: 'gemini-2.5-flash-lite',
  openai: 'gpt-4o-mini',
  openrouter: 'google/gemini-2.5-flash-lite',
};

const PROVIDER_LABEL: Record<StatementFormatterProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
};

const OPENROUTER_REFERRER = process.env.OPENROUTER_REFERRER || 'https://yj-ab.app';
const OPENROUTER_TITLE = process.env.OPENROUTER_TITLE || 'Rewards Tracker Statement Formatter';

const PROVIDER_VALUES: StatementFormatterProvider[] = ['gemini', 'openai', 'openrouter'];
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'] as const;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_FETCH_TIMEOUT_MS = 45_000;

function isValidProvider(value: string | null): value is StatementFormatterProvider {
  return PROVIDER_VALUES.includes(value as StatementFormatterProvider);
}

function generatePrompt(current: Date, customPrompt?: string | null): string {
  const today = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
  return `Extract every credit card transaction from this statement image.

Today's date: ${today}

Return a JSON array where each transaction has these fields:
- date: YYYY-MM-DD format (use the actual transaction date)
- payee: merchant name
- memo: only foreign currency (e.g. "USD 50.00") or location notes
- outflow: debit amount formatted as "$123.45" (empty string when not applicable)
- inflow: credit amount formatted as "$50.00" (empty string when not applicable)

Rules:
- Statement dates may be DD/MM/YYYY or MM/DD/YYYY. Prefer DD/MM when ambiguous and keep all rows within a single inferred year. If the statement wraps month numbers, keep the same year throughout unless a printed year is visible.
- Only one of outflow or inflow may be non-empty per row.
- Ignore reference numbers and card fragments in memo.
${customPrompt ? `\nAdditional instructions from user:\n${customPrompt}` : ''}
\nReturn ONLY the JSON array.`;
}

interface LlmResponsePayload {
  transactions?: Array<Record<string, unknown>>;
}

function extractTextFromMessage(content: unknown): string | null {
  if (!content) {
    return null;
  }

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('\n')
      .trim();
    return joined || null;
  }

  if (typeof content === 'object' && content !== null && 'text' in content && typeof (content as { text?: string }).text === 'string') {
    return (content as { text: string }).text;
  }

  return null;
}

function sanitiseTransactions(data: unknown): StatementFormatterTransaction[] {
  let rows: Record<string, unknown>[] | undefined;

  if (Array.isArray(data)) {
    rows = data as Record<string, unknown>[];
  } else if (data && typeof data === 'object' && Array.isArray((data as LlmResponsePayload).transactions)) {
    rows = (data as LlmResponsePayload).transactions;
  }

  if (!rows) {
    throw new Error('AI response did not include any transactions');
  }

  return rows.map((tx) => ({
    date: typeof tx.date === 'string' ? tx.date : '',
    payee: typeof tx.payee === 'string' ? tx.payee : typeof tx.merchant === 'string' ? tx.merchant : '',
    memo: typeof tx.memo === 'string' ? tx.memo : typeof tx.details === 'string' ? tx.details : '',
    outflow: typeof tx.outflow === 'string' ? tx.outflow : '',
    inflow: typeof tx.inflow === 'string' ? tx.inflow : '',
  }));
}

function extractFirstJsonArray(str: string): string | null {
  let bracketDepth = 0;
  let startIndex = -1;
  let inString: '"' | '\'' | null = null;
  let escape = false;

  for (let index = 0; index < str.length; index += 1) {
    const char = str[index];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (inString) {
      if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      inString = char;
      continue;
    }

    if (char === '[') {
      if (bracketDepth === 0) {
        startIndex = index;
      }
      bracketDepth += 1;
    } else if (char === ']') {
      bracketDepth -= 1;
      if (bracketDepth === 0 && startIndex !== -1) {
        return str.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function parseModelResponse(rawContent: string): StatementFormatterTransaction[] {
  const cleaned = rawContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  let target = cleaned;

  try {
    JSON.parse(cleaned);
  } catch {
    const extracted = extractFirstJsonArray(cleaned);
    if (!extracted) {
      throw new Error('Could not extract a JSON array from model response');
    }
    target = extracted;
  }

  const parsed = JSON.parse(target) as unknown;
  return sanitiseTransactions(parsed);
}

async function fetchWithTimeout(input: Parameters<typeof fetch>[0], init: RequestInit, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini(model: string, apiKey: string, prompt: string, imageData: string, mimeType: string) {
  try {
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: imageData.replace(/^data:[^;]+;base64,/, ''),
                  },
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4000 },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Gemini API unauthorized (${response.status})`);
      }
      throw new Error(`Gemini API error (${response.status})`);
    }

    const json = await response.json();
    const candidateParts = json?.candidates?.[0]?.content?.parts ?? [];
    const text = candidateParts.map((part: { text?: string }) => part?.text ?? '').join('\n').trim();
    if (!text) {
      throw new Error('Gemini response did not include text');
    }
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Gemini API request timed out');
    }
    throw error;
  }
}

async function callOpenAI(model: string, apiKey: string, prompt: string, imageData: string) {
  try {
    const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 4000,
        messages: [
          {
            role: 'system',
            content: 'You are a financial data extraction assistant. Output JSON only.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageData } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(`OpenAI API unauthorized (${response.status})`);
      }
      throw new Error(`OpenAI API error (${response.status})`);
    }

    const json = await response.json();
    const rawContent = json?.choices?.[0]?.message?.content;
    const text = extractTextFromMessage(rawContent);
    if (!text) {
      throw new Error('OpenAI response was empty');
    }
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OpenAI API request timed out');
    }
    throw error;
  }
}

async function callOpenRouter(model: string, apiKey: string, prompt: string, imageData: string) {
  try {
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': OPENROUTER_REFERRER,
        'X-Title': OPENROUTER_TITLE,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 4000,
        messages: [
          {
            role: 'system',
            content: 'You are a financial data extraction assistant. Output JSON only.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageData } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(`OpenRouter API unauthorized (${response.status})`);
      }
      throw new Error(`OpenRouter API error (${response.status})`);
    }

    const json = await response.json();
    const rawContent = json?.choices?.[0]?.message?.content;
    const text = extractTextFromMessage(rawContent);
    if (!text) {
      throw new Error('OpenRouter response was empty');
    }
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OpenRouter API request timed out');
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  let provider: StatementFormatterProvider = 'gemini';
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const providerParam = formData.get('provider');
    const modelParam = formData.get('model');
    const apiKeyParam = formData.get('apiKey');
    const customPrompt = formData.get('customPrompt');

    // Duck-type check for File-like object (instanceof File fails in Node.js serverless)
    if (!file || typeof file !== 'object' || !('arrayBuffer' in file) || !('type' in file)) {
      return NextResponse.json({ error: 'No statement image supplied' }, { status: 400 });
    }
    const uploadedFile = file as { arrayBuffer: () => Promise<ArrayBuffer>; type: string; size: number; name?: string };

    if (uploadedFile.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'Files larger than 10MB are not supported' }, { status: 400 });
    }

    if (!uploadedFile.type || !ALLOWED_IMAGE_TYPES.includes(uploadedFile.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return NextResponse.json({ error: 'Only PNG, JPEG, JPG, or WEBP image files are supported right now' }, { status: 400 });
    }

    provider = isValidProvider(typeof providerParam === 'string' ? providerParam : null)
      ? (providerParam as StatementFormatterProvider)
      : 'gemini';
    const providerLabel = PROVIDER_LABEL[provider];

    if (typeof apiKeyParam !== 'string' || apiKeyParam.trim().length === 0) {
      return NextResponse.json({ error: `Please add a ${providerLabel} API key` }, { status: 400 });
    }
    const model = typeof modelParam === 'string' && modelParam.trim() ? modelParam : PROVIDER_DEFAULT_MODEL[provider];
    const apiKey = apiKeyParam.trim();

    const bytes = await uploadedFile.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mimeType = uploadedFile.type || 'image/png';
    const imageData = `data:${mimeType};base64,${base64}`;

    const prompt = generatePrompt(new Date(), typeof customPrompt === 'string' ? customPrompt : undefined);

    let rawContent: string;
    if (provider === 'gemini') {
      rawContent = await callGemini(model, apiKey, prompt, imageData, mimeType);
    } else if (provider === 'openai') {
      rawContent = await callOpenAI(model, apiKey, prompt, imageData);
    } else {
      rawContent = await callOpenRouter(model, apiKey, prompt, imageData);
    }

    const transactions = parseModelResponse(rawContent);
    const cleaned = transactions.map((tx) => ({
      date: tx.date || '',
      payee: tx.payee || '',
      memo: tx.memo || '',
      outflow: tx.outflow || '',
      inflow: tx.inflow || '',
    }));

    return NextResponse.json({
      provider: provider,
      model,
      transactions: cleaned,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('[formatter] Failed to process statement', error);
    const status = /unauthorized|api key/i.test(message) ? 401 : 500;
    const providerName = PROVIDER_LABEL[provider] ?? PROVIDER_LABEL.gemini;
    const details = status === 401 ? `Invalid ${providerName} API key` : `Failed to process statement: ${message}`;
    return NextResponse.json({ error: details }, { status });
  }
}
