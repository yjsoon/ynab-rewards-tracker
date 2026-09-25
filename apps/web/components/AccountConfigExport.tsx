'use client';

import { useState } from 'react';
import { storage } from '@/lib/storage';
import { getErrorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { JsonExportDialog, downloadJson } from '@/components/JsonExportDialog';

export function AccountConfigExport({ account, disabled = false }: {
  account?: { id: string; name: string };
  disabled?: boolean;
}) {
  const [message, setMessage] = useState('');
  const [viewedJson, setViewedJson] = useState<string | null>(null);
  const filename = `rewards-account-config-${(account?.name ?? '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;

  function exportJson(): string | null {
    if (!account) return null;
    try {
      return storage.exportAccountConfig(account.id);
    } catch (error) {
      setMessage(getErrorMessage(error));
      return null;
    }
  }

  function download() {
    const json = exportJson();
    if (json === null) return;
    downloadJson(json, filename);
    setMessage('Saved rewards configuration exported. No transactions or balances are included.');
  }

  function view() {
    const json = exportJson();
    if (json === null) return;
    setMessage('');
    setViewedJson(json);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={download} disabled={disabled || !account}>Export Account Config</Button>
        <Button variant="outline" onClick={view} disabled={disabled || !account}>View JSON</Button>
      </div>
      {message && <p role="status" className="text-sm">{message}</p>}
      <JsonExportDialog
        json={viewedJson}
        filename={filename}
        title="Account Rewards Configuration"
        description={account ? `Saved rewards configuration for ${account.name}. No transactions or balances are included.` : undefined}
        onOpenChange={(open) => { if (!open) setViewedJson(null); }}
      />
    </div>
  );
}
