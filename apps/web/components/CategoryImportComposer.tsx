'use client';

import { useMemo, useState } from 'react';
import {
  applyCategoryProposal,
  CATEGORY_IMPORT_PROVIDERS,
  defaultModelFor,
  getCategoryImportProvider,
  type CardCategoryPatch,
} from '@ynab-counter/app-core/category-import';
import type { CardSubcategory, CategoryImportProvider, CreditCard } from '@ynab-counter/app-core/storage/types';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useStatementFormatterSettings } from '@/hooks/useLocalStorage';
import { requestCategoryImport } from '@/lib/category-import/client';

interface CategoryImportComposerProps {
  card: CreditCard;
  cardType: CreditCard['type'];
  earningRate?: number | null;
  existingSubcategories: CardSubcategory[];
  onApply: (patch: CardCategoryPatch) => void;
}

export function CategoryImportComposer({
  card,
  cardType,
  earningRate,
  existingSubcategories,
  onApply,
}: CategoryImportComposerProps) {
  const { settings, updateSettings } = useStatementFormatterSettings();
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [termsUrl, setTermsUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [keyDraft, setKeyDraft] = useState<string | null>(null);

  const provider: CategoryImportProvider = settings.categoryImportProvider ?? 'openai';
  const providerInfo = getCategoryImportProvider(provider);
  const model = settings.modelByProvider?.[provider] || defaultModelFor(provider);
  const apiKey = keyDraft ?? settings.apiKeys?.[provider] ?? '';
  const modelOptions = useMemo(() => {
    if (providerInfo.models.some((option) => option.value === model)) {
      return providerInfo.models;
    }
    return [{ value: model, label: model }, ...providerInfo.models];
  }, [model, providerInfo.models]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const proposal = await requestCategoryImport({
        provider,
        model,
        apiKey,
        cardType,
        instructions,
        termsUrl,
        earningRate,
        existingSubcategories,
      });
      onApply(applyCategoryProposal({ card: { ...card, type: cardType, earningRate }, proposal }));
      setNotes(proposal.notes);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create those categories.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Paste the card terms or a link. Review the categories before you save.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          Create from terms
        </Button>
      </div>
      {notes.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create from terms</DialogTitle>
            <DialogDescription>
              Use your own OpenAI, OpenRouter, or OpenCode key. Nothing is stored on the server.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="category-import-provider">Provider</Label>
                <Select
                  value={provider}
                  onValueChange={(value) => {
                    setKeyDraft(null);
                    updateSettings({
                      categoryImportProvider: value as CategoryImportProvider,
                    });
                  }}
                >
                  <SelectTrigger id="category-import-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_IMPORT_PROVIDERS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category-import-model">Model</Label>
                <Select
                  value={model}
                  onValueChange={(value) => updateSettings({
                    modelByProvider: { [provider]: value },
                  })}
                >
                  <SelectTrigger id="category-import-model">
                    <SelectValue />
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-import-key">API key</Label>
              <Input
                id="category-import-key"
                type="password"
                autoComplete="off"
                placeholder={providerInfo.placeholder}
                value={apiKey}
                onChange={(event) => {
                  setKeyDraft(event.target.value);
                  updateSettings({ apiKeys: { [provider]: event.target.value } });
                }}
              />
              <p className="text-xs text-muted-foreground">
                Saved in this browser only.
                {' '}
                <a className="underline" href={providerInfo.docsUrl} target="_blank" rel="noreferrer">
                  Get a {providerInfo.docsLabel} key
                </a>
                .
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-import-url">Terms link</Label>
              <Input
                id="category-import-url"
                type="url"
                placeholder="https://"
                value={termsUrl}
                onChange={(event) => setTermsUrl(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-import-instructions">Instructions</Label>
              <Textarea
                id="category-import-instructions"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="e.g. UOB PPV, 4 mpd on contactless, exclude annual fee"
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={create} disabled={busy || !apiKey}>
              {busy ? 'Reading terms…' : 'Create categories'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
