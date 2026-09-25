'use client';

import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function downloadJson(json: string, filename: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function JsonExportDialog({ json, filename, title, description, onOpenChange }: {
  json: string | null;
  filename: string;
  title: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <Dialog
      open={json !== null}
      onOpenChange={(open) => {
        if (!open) setCopyState('idle');
        onOpenChange(open);
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <textarea
          readOnly
          value={json ?? ''}
          aria-label={title}
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-[50vh] w-full flex-1 resize-none rounded-md border border-input bg-muted/40 p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <DialogFooter className="gap-2 sm:items-center">
          {copyState === 'failed' && (
            <p role="status" className="text-sm text-destructive sm:mr-auto">
              Couldn’t copy. Select the text and copy it manually.
            </p>
          )}
          <Button variant="outline" onClick={() => json && downloadJson(json, filename)}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
          <Button onClick={() => void copy()}>
            {copyState === 'copied' ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copyState === 'copied' ? 'Copied' : 'Copy JSON'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
