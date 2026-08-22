import type {
  CategoryImportCredentials,
  CategoryImportDeps,
  CategoryImportRequest,
  CategoryImportResult,
  CategoryImportSource,
} from './types';
import { categoryImportProviderFailureMessage } from './complete';
import { compileCategoryProposal } from './compile';
import { categoryImportFetchFailureMessage } from './fetch-terms';
import { htmlToPlainText } from './html-text';
import { parseCategoryImportResponse } from './parse';
import { buildCategoryImportPrompt } from './prompt';
import { defaultModelFor } from './providers';
import { parseCategoryImportSource } from './source';

export async function proposeCardCategories(
  request: CategoryImportRequest,
  credentials: CategoryImportCredentials,
  deps: CategoryImportDeps,
): Promise<CategoryImportResult> {
  let source: CategoryImportSource;
  if (request.source) {
    source = request.source;
  } else {
    const sourceResult = parseCategoryImportSource({
      instructions: request.instructions,
      url: request.url,
    });
    if (sourceResult.kind !== 'ok') {
      return sourceResult;
    }
    source = sourceResult.source;
  }

  let termsText: string | undefined;
  const url = source.kind === 'instructions' ? undefined : source.url;
  const instructions = source.kind === 'termsUrl' ? undefined : source.instructions;

  if (url) {
    try {
      const fetched = await deps.fetchText(url);
      const { text, truncated } = htmlToPlainText(fetched);
      if (!text) {
        return { kind: 'fetch_failed', message: 'Could not read those terms.' };
      }
      termsText = text;
      if (truncated) {
        termsText = `${text}\n\n[Terms were truncated.]`;
      }
    } catch (error) {
      return { kind: 'fetch_failed', message: categoryImportFetchFailureMessage(error) };
    }
  }

  const prompt = buildCategoryImportPrompt({
    cardType: request.cardType,
    instructions,
    termsText,
  });

  let raw: string;
  try {
    raw = await deps.completeChat({
      provider: credentials.provider,
      apiKey: credentials.apiKey,
      model: credentials.model?.trim() || defaultModelFor(credentials.provider),
      system: prompt.system,
      user: prompt.user,
    });
  } catch (error) {
    return { kind: 'provider_failed', message: categoryImportProviderFailureMessage(error) };
  }

  const parsed = parseCategoryImportResponse(raw);
  if (parsed.kind !== 'ok') {
    return parsed;
  }

  return {
    kind: 'ok',
    proposal: compileCategoryProposal({
      parsed: parsed.parsed,
      cardType: request.cardType,
      earningRate: request.earningRate,
    }),
  };
}
