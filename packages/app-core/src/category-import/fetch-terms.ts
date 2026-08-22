import { validatePublicHttpUrl } from './source';

export const CATEGORY_IMPORT_FETCH_TIMEOUT_MS = 15_000;
export const CATEGORY_IMPORT_MAX_TERMS_BYTES = 1_500_000;

const READ_FAILED = 'Could not read those terms.';
const PASTE_INSTEAD = 'Could not read those terms. Paste the text instead.';

export async function fetchCategoryImportTerms(input: {
  url: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<string> {
  const invalid = validatePublicHttpUrl(input.url);
  if (invalid) {
    throw new Error(invalid.message);
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? CATEGORY_IMPORT_FETCH_TIMEOUT_MS,
  );

  try {
    const response = await fetchImpl(input.url, {
      method: 'GET',
      redirect: 'follow',
      headers: { Accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(READ_FAILED);
    }

    const redirected = validatePublicHttpUrl(response.url || input.url);
    if (redirected) {
      throw new Error(redirected.message);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/pdf')) {
      throw new Error(PASTE_INSTEAD);
    }

    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > CATEGORY_IMPORT_MAX_TERMS_BYTES) {
      throw new Error(PASTE_INSTEAD);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > CATEGORY_IMPORT_MAX_TERMS_BYTES) {
      throw new Error(PASTE_INSTEAD);
    }

    return new TextDecoder().decode(buffer);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(READ_FAILED);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function categoryImportFetchFailureMessage(error: unknown): string {
  if (
    error instanceof Error
    && (
      error.message === PASTE_INSTEAD
      || error.message === 'That link is not a public web address.'
    )
  ) {
    return error.message;
  }
  return READ_FAILED;
}
