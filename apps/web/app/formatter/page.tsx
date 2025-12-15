'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { FileUploader } from '@/components/formatter/FileUploader';
import { TransactionTable } from '@/components/formatter/TransactionTable';
import { ProviderConfigCard } from '@/components/formatter/ProviderConfigCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useStatementFormatterSettings } from '@/hooks/useLocalStorage';
import type { StatementFormatterProvider, StatementFormatterTransaction } from '@/types/statement-formatter';

const DEFAULT_MODEL: Record<StatementFormatterProvider, string> = {
  gemini: 'gemini-2.5-flash-lite',
  openai: 'gpt-4o-mini',
  openrouter: 'google/gemini-2.5-flash-lite',
};

function sortTransactions(transactions: StatementFormatterTransaction[]) {
  return [...transactions].sort((a, b) => {
    const aTime = Date.parse(a.date ?? '');
    const bTime = Date.parse(b.date ?? '');
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return aTime - bTime;
  });
}

export default function FormatterPage() {
  const { settings, updateSettings } = useStatementFormatterSettings();
  const [customPrompt, setCustomPrompt] = useState(settings.customPrompt || '');
  const [transactions, setTransactions] = useState<StatementFormatterTransaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [hasGeneratedResults, setHasGeneratedResults] = useState(false);
  const [fileDecisionOpen, setFileDecisionOpen] = useState(false);
  const fileDecisionResolver = useRef<((value: 'append' | 'replace' | 'cancel') => void) | null>(null);
  const cancelProcessingRef = useRef(false);

  const provider: StatementFormatterProvider = settings.provider || 'gemini';
  const model = settings.modelByProvider?.[provider] || DEFAULT_MODEL[provider];
  const apiKey = settings.apiKeys?.[provider] || '';

  useEffect(() => {
    setCustomPrompt(settings.customPrompt || '');
  }, [settings.customPrompt]);

  const handleProviderChange = useCallback(
    (next: StatementFormatterProvider) => {
      updateSettings({ provider: next });
    },
    [updateSettings]
  );

  const handleModelChange = useCallback(
    (nextModel: string) => {
      updateSettings({ modelByProvider: { [provider]: nextModel } });
    },
    [provider, updateSettings]
  );

  const handleApiKeyChange = useCallback(
    (key: string) => {
      updateSettings({ apiKeys: { [provider]: key } });
    },
    [provider, updateSettings]
  );

  const handlePromptChange = useCallback(
    (value: string) => {
      setCustomPrompt(value);
      updateSettings({ customPrompt: value });
    },
    [updateSettings]
  );

  const handleTransactionsChange = useCallback((rows: StatementFormatterTransaction[]) => {
    setTransactions(rows);
  }, []);

  const requestFileDecision = useCallback(() => {
    return new Promise<'append' | 'replace' | 'cancel'>((resolve) => {
      fileDecisionResolver.current = resolve;
      setFileDecisionOpen(true);
    });
  }, []);

  const resolveFileDecision = useCallback((decision: 'append' | 'replace' | 'cancel') => {
    if (fileDecisionResolver.current) {
      fileDecisionResolver.current(decision);
      fileDecisionResolver.current = null;
    }
    setFileDecisionOpen(false);
  }, []);

  const handleBeforeFileAdd = useCallback(async () => {
    if (!hasGeneratedResults) {
      return 'append' as const;
    }

    const decision = await requestFileDecision();
    if (decision === 'replace') {
      setWarning(null);
      setTransactions([]);
      setHasGeneratedResults(false);
    }
    return decision;
  }, [hasGeneratedResults, requestFileDecision]);

  const handleFileProcess = useCallback(
    async (files: File[], prompt: string) => {
      if (!apiKey) {
        setError('Add your API key before processing statements.');
        return;
      }

      cancelProcessingRef.current = false;
      setIsProcessing(true);
      setError(null);
      setWarning(null);
      setProgressMessage('Uploading files…');
      const isAppending = hasGeneratedResults && transactions.length > 0;
      const baseRows = isAppending ? [...transactions] : [];
      const aggregated: StatementFormatterTransaction[] = [...baseRows];
      const errors: string[] = [];
      let cancelled = false;

      for (let index = 0; index < files.length; index += 1) {
        if (cancelProcessingRef.current) {
          cancelled = true;
          break;
        }

        const file = files[index];
        setProgressMessage(`Processing ${file.name} (${index + 1}/${files.length})`);
        const body = new FormData();
        body.append('file', file);
        body.append('provider', provider);
        body.append('model', model);
        body.append('apiKey', apiKey);
        if (prompt) {
          body.append('customPrompt', prompt);
        }

        try {
          const response = await fetch('/api/formatter', {
            method: 'POST',
            body,
          });
          const data = await response.json();
          if (!response.ok) {
            errors.push(`${file.name}: ${data.error || 'Unable to process statement'}`);
            continue;
          }
          if (Array.isArray(data.transactions)) {
            aggregated.push(...(data.transactions as StatementFormatterTransaction[]));
          }
        } catch (processingError) {
          const message = processingError instanceof Error ? processingError.message : 'Unknown error';
          errors.push(`${file.name}: ${message}`);
        }

        if (cancelProcessingRef.current) {
          cancelled = true;
          break;
        }
      }

      setProgressMessage('');
      setTransactions(sortTransactions(aggregated));
      setHasGeneratedResults(aggregated.length > 0);
      setIsProcessing(false);

      if (cancelled) {
        cancelProcessingRef.current = false;
        setWarning('Processing cancelled.');
        return;
      }

      cancelProcessingRef.current = false;

      if (errors.length > 0) {
        setWarning(errors.join('\n'));
      }
      if (aggregated.length === 0 && errors.length === 0) {
        setWarning('No transactions returned. Try another model or adjust your instructions.');
      }
    },
    [apiKey, hasGeneratedResults, model, provider, transactions]
  );

  const handleClearAll = useCallback(() => {
    if (isProcessing) {
      cancelProcessingRef.current = true;
      setProgressMessage('Cancelling…');
    }
  }, [isProcessing]);

  return (
    <>
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="space-y-2 mb-6">
        <h1 className="text-3xl font-bold">Formatter</h1>
        <p className="text-muted-foreground">
          Convert scanned or downloaded card statements into YNAB-ready CSVs using your own Gemini, OpenAI, or OpenRouter key. Files and keys stay in local storage until you process them, then travel through Rewards Tracker&apos;s formatter API before reaching your selected model.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <FileUploader
            onFileProcess={handleFileProcess}
            isLoading={isProcessing}
            customPrompt={customPrompt}
            onCustomPromptChange={handlePromptChange}
            onBeforeFileAdd={handleBeforeFileAdd}
            onClearAll={handleClearAll}
          />

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>We could not process that</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {warning && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Heads-up</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap">{warning}</AlertDescription>
            </Alert>
          )}

          {isProcessing && progressMessage && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>{progressMessage}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="space-y-6">
          <ProviderConfigCard
            provider={provider}
            onProviderChange={handleProviderChange}
            model={model}
            onModelChange={handleModelChange}
            apiKey={apiKey}
            onApiKeyChange={handleApiKeyChange}
          />
        </div>
      </div>

      {transactions.length > 0 && (
        <div className="mt-6">
          <TransactionTable
            transactions={transactions}
            onChange={handleTransactionsChange}
          />
        </div>
      )}
    </div>

    <Dialog open={fileDecisionOpen} onOpenChange={(open) => {
      if (!open) {
        resolveFileDecision('cancel');
      }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How should we handle these files?</DialogTitle>
          <DialogDescription>
            Append them to the current batch to keep your existing results, or replace the batch to discard the previous extraction.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => resolveFileDecision('cancel')} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => resolveFileDecision('append')} className="w-full sm:w-auto">
            Append to current batch
          </Button>
          <Button variant="destructive" onClick={() => resolveFileDecision('replace')} className="w-full sm:w-auto">
            Replace batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
