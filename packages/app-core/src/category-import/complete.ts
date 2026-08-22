import type { CategoryImportProvider } from '../storage/types';
import { getCategoryImportProvider } from './providers';

const DEFAULT_TIMEOUT_MS = 45_000;
const OPENROUTER_REFERRER = 'https://rewards.soon.sg';
const OPENROUTER_TITLE = 'Rewards Tracker';

export async function completeCategoryImportChat(input: {
  provider: CategoryImportProvider;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<string> {
  const provider = getCategoryImportProvider(input.provider);
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${input.apiKey}`,
  };
  if (input.provider === 'openrouter') {
    headers['HTTP-Referer'] = OPENROUTER_REFERRER;
    headers['X-Title'] = OPENROUTER_TITLE;
  }

  try {
    const response = await fetchImpl(provider.chatCompletionsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: input.model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(`${provider.label} API key was rejected.`);
      }
      throw new Error(`${provider.label} request failed (${response.status}).`);
    }

    const json = await response.json() as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const text = extractText(json.choices?.[0]?.message?.content);
    if (!text) {
      throw new Error(`${provider.label} returned an empty response.`);
    }
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${provider.label} request timed out.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractText(content: unknown): string | null {
  if (typeof content === 'string' && content.trim()) {
    return content;
  }
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('\n')
      .trim();
    return joined || null;
  }
  return null;
}
