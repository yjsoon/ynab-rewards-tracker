'use client';

import { useState } from 'react';
import { storage } from '@/lib/storage';
import { getErrorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function AccountConfigExport({ account, disabled = false }: {
  account?: { id: string; name: string };
  disabled?: boolean;
}) {
  const [message, setMessage] = useState('');

  function download() {
    if (!account) return;
    try {
      const json = storage.exportAccountConfig(account.id);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `rewards-account-config-${account.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage('Saved rewards configuration exported. No transactions or balances are included.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={download} disabled={disabled || !account}>Export Account Config</Button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>
  );
}
