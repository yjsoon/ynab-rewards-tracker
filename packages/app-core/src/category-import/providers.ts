import type { CategoryImportProvider } from '../storage/types';

export type CategoryImportTransport = 'chat' | 'responses' | 'messages';

export interface CategoryImportModelRoute {
  apiModel: string;
  url: string;
  transport: CategoryImportTransport;
}

export interface CategoryImportModelOption extends CategoryImportModelRoute {
  value: string;
  label: string;
}

export interface CategoryImportProviderInfo {
  id: CategoryImportProvider;
  label: string;
  docsUrl: string;
  docsLabel: string;
  placeholder: string;
  chatCompletionsUrl: string;
  defaultModel: string;
  models: readonly CategoryImportModelOption[];
}

const OPENAI_CHAT = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_CHAT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENCODE_ZEN_CHAT = 'https://opencode.ai/zen/v1/chat/completions';
const OPENCODE_ZEN_RESPONSES = 'https://opencode.ai/zen/v1/responses';
const OPENCODE_GO_CHAT = 'https://opencode.ai/zen/go/v1/chat/completions';
const OPENCODE_GO_RESPONSES = 'https://opencode.ai/zen/go/v1/responses';
const OPENCODE_GO_MESSAGES = 'https://opencode.ai/zen/go/v1/messages';

function chatModel(url: string, value: string, label: string): CategoryImportModelOption {
  return { value, label, apiModel: value, url, transport: 'chat' };
}

function routedModel(
  value: string,
  label: string,
  route: CategoryImportModelRoute,
): CategoryImportModelOption {
  return { value, label, ...route };
}

export const CATEGORY_IMPORT_PROVIDERS: readonly CategoryImportProviderInfo[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'OpenAI',
    placeholder: 'sk-...',
    chatCompletionsUrl: OPENAI_CHAT,
    defaultModel: 'gpt-5.6-luna',
    models: [
      chatModel(OPENAI_CHAT, 'gpt-5.6-luna', 'GPT-5.6 Luna Max'),
      chatModel(OPENAI_CHAT, 'gpt-5.6-terra', 'GPT-5.6 Terra'),
      chatModel(OPENAI_CHAT, 'gpt-5.6-sol', 'GPT-5.6 Sol'),
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    docsUrl: 'https://openrouter.ai/keys',
    docsLabel: 'OpenRouter',
    placeholder: 'sk-or-...',
    chatCompletionsUrl: OPENROUTER_CHAT,
    defaultModel: 'openai/gpt-5.6-luna',
    models: [
      chatModel(OPENROUTER_CHAT, 'openai/gpt-5.6-luna', 'GPT-5.6 Luna Max (OpenAI)'),
      chatModel(OPENROUTER_CHAT, '~deepseek/deepseek-v4-flash-latest', 'DeepSeek V4 Flash'),
      chatModel(OPENROUTER_CHAT, 'google/gemini-3.5-flash-lite', 'Gemini latest Flash Lite'),
      chatModel(OPENROUTER_CHAT, '~google/gemini-flash-latest', 'Gemini latest Flash'),
    ],
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    docsUrl: 'https://opencode.ai/auth',
    docsLabel: 'OpenCode',
    placeholder: 'zen-...',
    chatCompletionsUrl: OPENCODE_ZEN_CHAT,
    defaultModel: 'gpt-5.6-luna',
    models: [
      routedModel('gpt-5.6-luna', 'GPT-5.6 Luna Max', {
        apiModel: 'gpt-5.6-luna',
        url: OPENCODE_ZEN_RESPONSES,
        transport: 'responses',
      }),
      routedModel('deepseek-v4-flash', 'DeepSeek V4 Flash', {
        apiModel: 'deepseek-v4-flash',
        url: OPENCODE_ZEN_CHAT,
        transport: 'chat',
      }),
      routedModel('kimi-k3', 'Kimi K3', {
        apiModel: 'kimi-k3',
        url: OPENCODE_ZEN_CHAT,
        transport: 'chat',
      }),
      routedModel('minimax-m3', 'MiniMax M3', {
        apiModel: 'minimax-m3',
        url: OPENCODE_ZEN_CHAT,
        transport: 'chat',
      }),
      routedModel('muse-spark-1.2-contributor-free', 'Muse Spark 1.2 Contributor', {
        apiModel: 'muse-spark-1.2-contributor-free',
        url: OPENCODE_ZEN_RESPONSES,
        transport: 'responses',
      }),
      routedModel('go/gpt-5.6-luna', 'GPT-5.6 Luna Max (Go)', {
        apiModel: 'gpt-5.6-luna',
        url: OPENCODE_GO_RESPONSES,
        transport: 'responses',
      }),
      routedModel('go/deepseek-v4-flash', 'DeepSeek V4 Flash (Go)', {
        apiModel: 'deepseek-v4-flash',
        url: OPENCODE_GO_CHAT,
        transport: 'chat',
      }),
      routedModel('go/kimi-k3', 'Kimi K3 (Go)', {
        apiModel: 'kimi-k3',
        url: OPENCODE_GO_CHAT,
        transport: 'chat',
      }),
      routedModel('go/minimax-m3', 'MiniMax M3 (Go)', {
        apiModel: 'minimax-m3',
        url: OPENCODE_GO_MESSAGES,
        transport: 'messages',
      }),
      routedModel('go/muse-spark-1.2-contributor', 'Muse Spark 1.2 Contributor (Go)', {
        apiModel: 'muse-spark-1.2-contributor',
        url: OPENCODE_GO_RESPONSES,
        transport: 'responses',
      }),
    ],
  },
] as const;

const PROVIDER_BY_ID = new Map(
  CATEGORY_IMPORT_PROVIDERS.map((provider) => [provider.id, provider]),
);

export function getCategoryImportProvider(
  id: CategoryImportProvider,
): CategoryImportProviderInfo {
  const provider = PROVIDER_BY_ID.get(id);
  if (!provider) {
    throw new Error(`Unknown category-import provider: ${id}`);
  }
  return provider;
}

export function defaultModelFor(provider: CategoryImportProvider): string {
  return getCategoryImportProvider(provider).defaultModel;
}

export function resolveCategoryImportEndpoint(
  providerId: CategoryImportProvider,
  model: string,
): CategoryImportModelRoute {
  const provider = getCategoryImportProvider(providerId);
  const option = provider.models.find((row) => row.value === model);
  if (option) {
    return {
      apiModel: option.apiModel,
      url: option.url,
      transport: option.transport,
    };
  }
  return inferUnlistedEndpoint(providerId, provider.chatCompletionsUrl, model);
}

function inferUnlistedEndpoint(
  providerId: CategoryImportProvider,
  chatCompletionsUrl: string,
  model: string,
): CategoryImportModelRoute {
  if (providerId !== 'opencode') {
    return { apiModel: model, url: chatCompletionsUrl, transport: 'chat' };
  }

  const go = model.startsWith('go/');
  const apiModel = go ? model.slice(3) : model;
  if (isOpenCodeResponsesModel(apiModel)) {
    return {
      apiModel,
      url: go ? OPENCODE_GO_RESPONSES : OPENCODE_ZEN_RESPONSES,
      transport: 'responses',
    };
  }
  if (go && apiModel === 'minimax-m3') {
    return { apiModel, url: OPENCODE_GO_MESSAGES, transport: 'messages' };
  }
  return {
    apiModel,
    url: go ? OPENCODE_GO_CHAT : chatCompletionsUrl,
    transport: 'chat',
  };
}

function isOpenCodeResponsesModel(apiModel: string): boolean {
  return (
    isGpt56Luna(apiModel)
    || apiModel === 'muse-spark-1.2'
    || apiModel === 'muse-spark-1.2-contributor'
    || apiModel === 'muse-spark-1.2-contributor-free'
  );
}

export function isGpt56Luna(model: string): boolean {
  return isExactOrPrefixedModel(model, 'gpt-5.6-luna');
}

function isExactOrPrefixedModel(model: string, id: string): boolean {
  return model === id || model.endsWith(`/${id}`);
}
