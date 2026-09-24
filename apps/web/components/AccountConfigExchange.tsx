'use client';

import { useRef, useState } from 'react';
import { parseAccountConfig } from '@ynab-counter/app-core/storage/account-config';
import { storage, type CreditCard } from '@/lib/storage';
import { useStorageContext } from '@/contexts/StorageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getErrorMessage } from '@/lib/utils';
import { AccountConfigExport } from '@/components/AccountConfigExport';

export function AccountConfigExchange({ accounts, cards }: {
  accounts: Array<{ id: string; name: string }>;
  cards: CreditCard[];
}) {
  const { triggerRefresh } = useStorageContext();
  const [accountId, setAccountId] = useState('');
  const [pending, setPending] = useState<{ json: string; account: { id: string; name: string }; source: string } | null>(null);
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const destinations = accounts.length ? accounts : cards.map((card) => ({ id: card.ynabAccountId, name: card.name }));
  const account = destinations.find(({ id }) => id === accountId);

  async function readFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !account) return;
    setMessage('');
    try {
      const json = await file.text();
      const config = parseAccountConfig(json);
      setPending({ json, account, source: config.name });
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  }

  function apply() {
    if (!pending) return;
    try {
      storage.importAccountConfig(pending.json, pending.account);
      triggerRefresh();
      setMessage(`Rewards configuration imported for ${pending.account.name}. Other accounts and transactions are unchanged.`);
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
    setPending(null);
  }

  return (
    <Card id="account-rewards-config">
      <CardHeader>
        <CardTitle>Account Rewards Configuration</CardTitle>
        <CardDescription>Exchange one account’s reward rates, categories and spending tiers with HowMuch. No transactions or balances.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="rewards-config-account">Destination / export account</label>
        <select id="rewards-config-account" value={accountId} onChange={(event) => { setAccountId(event.target.value); setMessage(''); }} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">Choose an existing account</option>
          {destinations.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
        {!destinations.length && <p className="text-sm text-muted-foreground">Connect a budget and load its accounts first.</p>}
        <div className="flex flex-wrap items-start gap-2">
          <AccountConfigExport key={accountId} account={account} disabled={!cards.some((card) => card.ynabAccountId === account?.id)} />
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={!account}>Import Account Config</Button>
        </div>
        <input ref={fileInput} type="file" accept=".json,application/json" aria-label="Import account rewards configuration file" className="hidden" onChange={readFile} />
        <p className="text-sm text-muted-foreground">Import replaces only the selected account’s rewards configuration, including clearing fields omitted from the file. Its name and account link stay unchanged.</p>
        {message && <p role="status" className="text-sm">{message}</p>}
        <ConfirmDialog isOpen={!!pending} title="Replace rewards configuration?" message={`Import “${pending?.source}” into “${pending?.account.name}”? Existing rewards configuration for this account will be replaced. Transactions, balances and other accounts will not change.`} confirmText="Replace Configuration" cancelText="Cancel" onConfirm={apply} onCancel={() => setPending(null)} />
      </CardContent>
    </Card>
  );
}
