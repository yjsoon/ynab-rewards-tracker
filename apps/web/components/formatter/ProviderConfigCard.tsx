'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, CheckCircle2, Loader2, Info } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { StatementFormatterProvider } from '@/types/statement-formatter';

interface ProviderConfigCardProps {
  provider: StatementFormatterProvider;
  onProviderChange: (provider: StatementFormatterProvider) => void;
  model: string;
  onModelChange: (model: string) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
}

const PROVIDER_COPY: Record<StatementFormatterProvider, {
  label: string;
  description: string;
  docsUrl: string;
  docsLabel: string;
  placeholder: string;
}> = {
  gemini: {
    label: 'Gemini',
    description: 'Google AI Studio multi-modal models with generous free tiers.',
    docsUrl: 'https://aistudio.google.com/api-keys',
    docsLabel: 'Google AI Studio',
    placeholder: 'AIza...'
  },
  openai: {
    label: 'OpenAI',
    description: 'GPT-4o family with strong OCR and reasoning.',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'OpenAI',
    placeholder: 'sk-...'
  },
  openrouter: {
    label: 'OpenRouter',
    description: 'Unified gateway to third-party models (Gemini, Claude, GPT-4o, etc).',
    docsUrl: 'https://openrouter.ai/keys',
    docsLabel: 'OpenRouter',
    placeholder: 'or-...'
  },
};

const MODEL_OPTIONS: Record<StatementFormatterProvider, Array<{ value: string; label: string }>> = {
  gemini: [
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ],
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
  ],
  openrouter: [
    { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Google)' },
    { value: 'google/gemini-flash-1.5-8b', label: 'Gemini Flash 1.5 8B (Google)' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (OpenAI)' },
    { value: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku (Anthropic)' },
  ],
};

export function ProviderConfigCard({ provider, onProviderChange, model, onModelChange, apiKey, onApiKeyChange }: ProviderConfigCardProps) {
  const providerMeta = PROVIDER_COPY[provider];
  const modelOptions = MODEL_OPTIONS[provider];
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>(apiKey ? 'saved' : 'idle');
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (saveState === 'saving') {
      setSaveState('saved');
      timeoutRef.current = window.setTimeout(() => setSaveState('idle'), 2000);
    }
  }, [apiKey, saveState]);

  const handleApiKeyChange = (value: string) => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    setSaveState('saving');
    onApiKeyChange(value);
  };

  const defaultKeyMessage = 'Keys save automatically in local storage and only leave your browser when you run an extraction.';

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-primary font-semibold">
          <Sparkles className="h-4 w-4" />
          LLM & API key
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="llm-provider">Provider</Label>
          <Select value={provider} onValueChange={(value) => onProviderChange(value as StatementFormatterProvider)}>
            <SelectTrigger id="llm-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PROVIDER_COPY) as StatementFormatterProvider[]).map((option) => (
                <SelectItem key={option} value={option}>
                  {PROVIDER_COPY[option].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {providerMeta.description}
            {' '}
            <a className="underline" href={providerMeta.docsUrl} target="_blank" rel="noreferrer">
              View {providerMeta.docsLabel} docs and get an API key here
            </a>
            .
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-model">Model</Label>
          <Select value={model} onValueChange={(value) => onModelChange(value)}>
            <SelectTrigger id="llm-model">
              <SelectValue placeholder="Pick a model" />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-api-key">API key</Label>
          <Input
            id="llm-api-key"
            type="password"
            placeholder={providerMeta.placeholder}
            value={apiKey}
            onChange={(event) => handleApiKeyChange(event.target.value)}
            autoComplete="off"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {saveState === 'saving' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : saveState === 'saved' ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : (
              <Info className="h-3 w-3" />
            )}
            <span>
              {saveState === 'saving'
                ? 'Saving locally…'
                : saveState === 'saved'
                  ? 'Key saved locally. Keys only leave your browser when you run an extraction.'
                  : defaultKeyMessage}
            </span>
          </div>
        </div>

        <div className="rounded-md border border-dashed border-muted-foreground/30 p-3 text-xs text-muted-foreground space-y-1">
          <a
            className="underline text-foreground"
            href="https://support.ynab.com/en_us/file-based-import-a-guide-Bkj4Sszyo#import"
            target="_blank"
            rel="noreferrer"
          >
            Learn how to import the CSV into YNAB →
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
