import type { CategoryImportProvider } from '../storage/types';
import {
  getCategoryImportProvider,
  isGpt56Luna,
  resolveCategoryImportEndpoint,
  type CategoryImportModelRoute,
  type CategoryImportTransport,
} from './providers';

const DEFAULT_TIMEOUT_MS = 45_000;
const LUNA_MAX_TIMEOUT_MS = 90_000;
const OPENROUTER_REFERRER = 'https://rewards.soon.sg';
const OPENROUTER_TITLE = 'Rewards Tracker';
const ANTHROPIC_MAX_TOKENS = 8192;

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
  const endpoint = resolveCategoryImportEndpoint(input.provider, input.model);
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? (isGpt56Luna(endpoint.apiModel) ? LUNA_MAX_TIMEOUT_MS : DEFAULT_TIMEOUT_MS),
  );

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${input.apiKey}`,
  };
  if (input.provider === 'openrouter') {
    headers['HTTP-Referer'] = OPENROUTER_REFERRER;
    headers['X-Title'] = OPENROUTER_TITLE;
  }
  if (endpoint.transport === 'messages') {
    headers['anthropic-version'] = '2023-06-01';
    headers['x-api-key'] = input.apiKey;
  }

  try {
    const response = await fetchImpl(endpoint.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestPayload(endpoint, input)),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(`${provider.label} API key was rejected.`);
      }
      throw new Error(`${provider.label} request failed (${response.status}).`);
    }

    const text = extractCompletionText(endpoint.transport, await response.json());
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

export { isGpt56Luna };

function requestPayload(
  endpoint: CategoryImportModelRoute,
  input: { system: string; user: string },
): Record<string, unknown> {
  switch (endpoint.transport) {
    case 'chat':
      return chatCompletionsPayload({
        model: endpoint.apiModel,
        system: input.system,
        user: input.user,
      });
    case 'responses':
      return responsesPayload({
        model: endpoint.apiModel,
        system: input.system,
        user: input.user,
      });
    case 'messages':
      return messagesPayload({
        model: endpoint.apiModel,
        system: input.system,
        user: input.user,
      });
    default: {
      const _exhaustive: never = endpoint.transport;
      return _exhaustive;
    }
  }
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

function isGpt56Family(model: string): boolean {
  return isGpt56Luna(model)
    || model === 'gpt-5.6-terra'
    || model.endsWith('/gpt-5.6-terra')
    || model === 'gpt-5.6-sol'
    || model.endsWith('/gpt-5.6-sol');
}

function responsesPayload(input: {
  model: string;
  system: string;
  user: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: input.model,
    instructions: input.system,
    input: input.user,
  };
  if (isGpt56Luna(input.model)) {
    payload.reasoning = { effort: 'max' };
  }
  return payload;
}

function messagesPayload(input: {
  model: string;
  system: string;
  user: string;
}): Record<string, unknown> {
  return {
    model: input.model,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    temperature: 0.1,
    system: input.system,
    messages: [{ role: 'user', content: input.user }],
  };
}

function extractCompletionText(transport: CategoryImportTransport, payload: unknown): string | null {
  switch (transport) {
    case 'chat':
      return extractChatText(payload);
    case 'responses':
      return extractResponsesText(payload);
    case 'messages':
      return extractMessagesText(payload);
    default: {
      const _exhaustive: never = transport;
      return _exhaustive;
    }
  }
}

function extractChatText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('choices' in payload)) {
    return null;
  }
  const choices = payload.choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') {
    return null;
  }
  const message = 'message' in choices[0] ? choices[0].message : undefined;
  if (!message || typeof message !== 'object' || !('content' in message)) {
    return null;
  }
  return extractTextParts(message.content);
}

function extractResponsesText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if ('output_text' in payload && typeof payload.output_text === 'string') {
    const direct = payload.output_text.trim();
    if (direct) return direct;
  }
  if (!('output' in payload) || !Array.isArray(payload.output)) {
    return null;
  }
  const parts: string[] = [];
  for (const item of payload.output) {
    if (!item || typeof item !== 'object' || !('content' in item) || !Array.isArray(item.content)) {
      continue;
    }
    for (const part of item.content) {
      if (!part || typeof part !== 'object' || !('text' in part) || typeof part.text !== 'string') {
        continue;
      }
      parts.push(part.text);
    }
  }
  return parts.join('\n').trim() || null;
}

function extractMessagesText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('content' in payload)) {
    return null;
  }
  return extractTextParts(payload.content);
}

function extractTextParts(content: unknown): string | null {
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
