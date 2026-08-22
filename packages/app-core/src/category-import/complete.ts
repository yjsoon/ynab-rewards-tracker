import type { CategoryImportProvider } from '../storage/types';
import { getCategoryImportProvider } from './providers';

const DEFAULT_TIMEOUT_MS = 45_000;
const LUNA_MAX_TIMEOUT_MS = 90_000;
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
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? (isGpt56Luna(input.model) ? LUNA_MAX_TIMEOUT_MS : DEFAULT_TIMEOUT_MS),
  );

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
      body: JSON.stringify(chatCompletionsPayload(input)),
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

const GENERIC_PROVIDER_FAILURE = 'The model request failed. Check the API key and try again.';

export function categoryImportProviderFailureMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message) {
    return GENERIC_PROVIDER_FAILURE;
  }
  if (
    error.message.endsWith(' API key was rejected.')
    || error.message.endsWith(' returned an empty response.')
    || error.message.endsWith(' request timed out.')
    || / request failed \(\d+\)\.$/.test(error.message)
  ) {
    return error.message;
  }
  return GENERIC_PROVIDER_FAILURE;
}

export function isGpt56Luna(model: string): boolean {
  return isExactOrPrefixedModel(model, 'gpt-5.6-luna');
}

function isGpt56Family(model: string): boolean {
  return isExactOrPrefixedModel(model, 'gpt-5.6-luna')
    || isExactOrPrefixedModel(model, 'gpt-5.6-terra')
    || isExactOrPrefixedModel(model, 'gpt-5.6-sol');
}

function isExactOrPrefixedModel(model: string, id: string): boolean {
  return model === id || model.endsWith(`/${id}`);
}

function chatCompletionsPayload(input: {
  model: string;
  system: string;
  user: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: input.model,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.user },
    ],
  };
  if (isGpt56Luna(input.model)) {
    payload.reasoning_effort = 'max';
  }
  if (!isGpt56Family(input.model)) {
    payload.temperature = 0.1;
  }
  return payload;
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
