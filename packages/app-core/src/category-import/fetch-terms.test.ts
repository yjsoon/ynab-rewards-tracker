import { describe, expect, it, vi } from 'vitest';

import { categoryImportFetchFailureMessage, fetchCategoryImportTerms } from './fetch-terms';

describe('fetchCategoryImportTerms', () => {
  it('rejects a private URL before fetching', async () => {
    const fetchImpl = vi.fn() as typeof fetch;
    await expect(fetchCategoryImportTerms({
      url: 'http://127.0.0.1/terms',
      fetchImpl,
    })).rejects.toThrow('That link is not a public web address.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks the user to paste when the response is a PDF', async () => {
    const fetchImpl = vi.fn(async () => new Response('binary', {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    })) as typeof fetch;

    await expect(fetchCategoryImportTerms({
      url: 'https://bank.example/terms.pdf',
      fetchImpl,
    })).rejects.toThrow('Could not read those terms. Paste the text instead.');
  });

  it('returns HTML for a public page', async () => {
    const fetchImpl = vi.fn(async () => new Response('<p>4% dining</p>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })) as typeof fetch;

    await expect(fetchCategoryImportTerms({
      url: 'https://bank.example/terms',
      fetchImpl,
    })).resolves.toBe('<p>4% dining</p>');
  });
});

describe('categoryImportFetchFailureMessage', () => {
  it('keeps the paste-instead wording', () => {
    expect(categoryImportFetchFailureMessage(
      new Error('Could not read those terms. Paste the text instead.'),
    )).toBe('Could not read those terms. Paste the text instead.');
  });

  it('hides unknown fetch errors', () => {
    expect(categoryImportFetchFailureMessage(new Error('ECONNRESET'))).toBe(
      'Could not read those terms.',
    );
  });
});
