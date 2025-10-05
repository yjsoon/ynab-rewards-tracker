'use client';

import Link from 'next/link';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useYnabPAT, useCreditCards, useSettings, useSelectedBudget, useTrackedAccountIds } from '@/hooks/useLocalStorage';
import {
  createMnemonic,
  encryptJson,
  decryptJson,
  computeKeyId,
  fetchEncryptedSettings,
  uploadEncryptedSettings,
  deleteEncryptedSettings,
  isValidMnemonic,
  normaliseMnemonic,
} from '@/lib/cloud-sync';
import { YnabClient } from '@/lib/ynab-client';
import type { CreditCard } from '@/lib/storage';
import { validateYnabToken } from '@/lib/validation';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getErrorMessage, cn } from '@/lib/utils';
import {
  CheckCircle2,
  CreditCard as CreditCardIcon,
  Trash2,
  Download,
  Upload,
  AlertCircle,
  RefreshCw,
  Wallet,
  DollarSign,
  CloudUpload,
  CloudDownload,
  Copy,
  CloudOff,
  KeyRound,
} from 'lucide-react';

interface YnabBudget {
  id: string;
  name: string;
  last_modified_on: string;
}

interface YnabAccount {
  id: string;
  name: string;
  type: string;
  on_budget: boolean;
  closed: boolean;
  balance: number;
}

// Constants for account type labels
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  creditCard: 'Credit Card',
  checking: 'Checking',
  savings: 'Savings',
  cash: 'Cash',
  lineOfCredit: 'Line of Credit',
};

function buildTrackedCard(accountId: string, accountName: string): CreditCard {
  return {
    id: `ynab-${accountId}`,
    name: accountName,
    issuer: 'Unknown',
    type: 'cashback',
    featured: true,
    ynabAccountId: accountId,
    billingCycle: {
      type: 'calendar',
      dayOfMonth: 1,
    },
    earningRate: 1,
    earningBlockSize: null,
    minimumSpend: null,
    maximumSpend: null,
    subcategoriesEnabled: false,
    subcategories: [],
  };
}

interface TrackedAccountCardProps {
  account: YnabAccount;
  isTracked: boolean;
  linkedCard?: CreditCard;
  onToggle: () => void;
}

function TrackedAccountCard({ account, isTracked, linkedCard, onToggle }: TrackedAccountCardProps) {
  const accountTypeLabel = ACCOUNT_TYPE_LABELS[account.type] || account.type;
  const Icon = account.type === 'creditCard' ? CreditCardIcon :
               account.type === 'checking' ? Wallet :
               DollarSign;

  return (
    <div
      className={cn(
        'flex h-full flex-col justify-between rounded-xl border p-4 text-left transition-shadow',
        isTracked ? 'border-primary/60 bg-primary/5 shadow-sm' : 'hover:border-primary/40'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{account.name}</span>
            </div>
            <div className="text-sm text-muted-foreground">{accountTypeLabel}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Switch
            id={`account-${account.id}`}
            checked={isTracked}
            onCheckedChange={onToggle}
            aria-label={isTracked ? `Stop tracking ${account.name}` : `Track ${account.name}`}
          />
          <span className="text-xs text-muted-foreground">Track</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>Balance</span>
        <span>${(account.balance / 1000).toFixed(2)}</span>
      </div>

      {isTracked && linkedCard ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-4 w-full justify-center"
          asChild
        >
          <Link href={`/cards/${linkedCard.id}?tab=settings`} aria-label={`View ${linkedCard.name} details`}>
            View card details
          </Link>
        </Button>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          {isTracked
            ? 'Card initialised, sync pending. Give it a moment.'
            : 'Switch on tracking to create a linked rewards card.'}
        </p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { pat, setPAT, isLoading: patLoading } = useYnabPAT();
  const { cards, saveCard, deleteCard, isLoading: cardsLoading } = useCreditCards();
  const { settings, updateSettings, exportSettings, importSettings, clearAll } = useSettings();
  
  const [tokenInput, setTokenInput] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const hasRequestedBudgetsRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cloudSyncPhrase, setCloudSyncPhrase] = useState('');
  const [generatedCloudPhrase, setGeneratedCloudPhrase] = useState<string | null>(null);
  const [cloudSyncMessage, setCloudSyncMessage] = useState('');
  const [cloudSyncError, setCloudSyncError] = useState('');
  const [cloudSyncAction, setCloudSyncAction] = useState<'idle' | 'generate' | 'upload' | 'download' | 'delete'>('idle');

  // Budget and account selection state
  const [budgets, setBudgets] = useState<YnabBudget[]>([]);
  const { selectedBudget, setSelectedBudget: persistSelectedBudget } = useSelectedBudget();
  const [accounts, setAccounts] = useState<YnabAccount[]>([]);
  const { trackedAccountIds, setTrackedAccountIds: persistTrackedAccountIds, isAccountTracked } = useTrackedAccountIds();
  const [loadingBudgets, setLoadingBudgets] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [showBudgetSelector, setShowBudgetSelector] = useState(false);

  // Valuation settings
  const [milesValuation, setMilesValuation] = useState<number>(
    typeof settings.milesValuation === 'number' ? settings.milesValuation : 0.01
  );
  // Points removed; only miles valuation remains
  const [valuationMessage, setValuationMessage] = useState<string>("");

  const isCloudSyncBusy = cloudSyncAction !== 'idle';
  const cloudSyncLastSynced = settings.cloudSyncLastSyncedAt
    ? new Date(settings.cloudSyncLastSyncedAt).toLocaleString()
    : null;
  const isGeneratingCloudSync = cloudSyncAction === 'generate';
  const isUploadingCloudSync = cloudSyncAction === 'upload';
  const isDownloadingCloudSync = cloudSyncAction === 'download';
  const isDeletingCloudSync = cloudSyncAction === 'delete';

  useEffect(() => {
    if (typeof settings.milesValuation === 'number') {
      setMilesValuation(settings.milesValuation);
    }
  }, [settings.milesValuation]);

  const cardsByAccountId = useMemo(() => {
    const entries = cards
      .filter((card): card is CreditCard & { ynabAccountId: string } => Boolean(card.ynabAccountId))
      .map(card => [card.ynabAccountId, card] as const);
    return new Map(entries);
  }, [cards]);

  const syncCardsWithAccounts = useCallback((ynabAccounts: YnabAccount[]) => {
    ynabAccounts.forEach((account) => {
      if (!trackedAccountIds.includes(account.id)) {
        return;
      }

      const existingCard = cardsByAccountId.get(account.id);
      if (!existingCard) {
        saveCard(buildTrackedCard(account.id, account.name));
      }
    });
  }, [trackedAccountIds, cardsByAccountId, saveCard]);

  const fetchAccounts = useCallback(async (budgetId: string) => {
    if (!pat) return;

    setLoadingAccounts(true);
    try {
      const client = new YnabClient(pat);
      const fetchedAccounts = await client.getAccounts<YnabAccount>(budgetId);
      const openAccounts = fetchedAccounts.filter((acc) => !acc.closed && acc.on_budget);
      setAccounts(openAccounts);
      syncCardsWithAccounts(openAccounts);
    } catch (error) {
      setConnectionMessage(`Failed to fetch accounts: ${getErrorMessage(error)}`);
    } finally {
      setLoadingAccounts(false);
    }
  }, [pat, syncCardsWithAccounts]);

  const handleBudgetSelect = useCallback((budgetId: string, budgetName: string) => {
    persistSelectedBudget(budgetId, budgetName);
    setShowBudgetSelector(false);
    fetchAccounts(budgetId);
  }, [fetchAccounts, persistSelectedBudget]);

  const fetchBudgets = useCallback(async () => {
    if (!pat) return;

    setLoadingBudgets(true);
    try {
      const client = new YnabClient(pat);
      const fetchedBudgets = await client.getBudgets();
      setBudgets(fetchedBudgets);

      if (fetchedBudgets.length === 1) {
        handleBudgetSelect(fetchedBudgets[0].id, fetchedBudgets[0].name);
      }
    } catch (error) {
      setConnectionMessage(`Failed to fetch budgets: ${getErrorMessage(error)}`);
    } finally {
      setLoadingBudgets(false);
    }
  }, [pat, handleBudgetSelect]);

  useEffect(() => {
    if (!valuationMessage) return;
    const timeout = setTimeout(() => setValuationMessage(''), 2500);
    return () => clearTimeout(timeout);
  }, [valuationMessage]);

  useEffect(() => {
    if (!cloudSyncMessage && !cloudSyncError) {
      return;
    }
    const timeout = setTimeout(() => {
      setCloudSyncMessage('');
      setCloudSyncError('');
    }, 5000);
    return () => clearTimeout(timeout);
  }, [cloudSyncMessage, cloudSyncError]);

  // Kick off initial account/budget fetch based on stored selection
  useEffect(() => {
    if (!pat) {
      hasRequestedBudgetsRef.current = false;
      return;
    }

    if (selectedBudget.id) {
      hasRequestedBudgetsRef.current = false;
      fetchAccounts(selectedBudget.id);
      return;
    }

    if (!hasRequestedBudgetsRef.current) {
      hasRequestedBudgetsRef.current = true;
      fetchBudgets();
    }
  }, [pat, selectedBudget.id, fetchAccounts, fetchBudgets]);


  async function handleSaveToken(e: React.FormEvent) {
    e.preventDefault();
    
    const validation = validateYnabToken(tokenInput);
    if (!validation.valid) {
      setConnectionMessage(`❌ ${validation.error}`);
      return;
    }

    setPAT(tokenInput);
    setConnectionMessage('Token saved! Fetching budgets...');
    setTokenInput('');
    
    // Immediately fetch budgets after saving token
    fetchBudgets();
  }

  function handleAccountToggle(accountId: string, accountName: string) {
    const currentlyTracked = isAccountTracked(accountId);
    const newTrackedIds = currentlyTracked
      ? trackedAccountIds.filter(id => id !== accountId)
      : [...trackedAccountIds, accountId];

    persistTrackedAccountIds(newTrackedIds);

    if (!currentlyTracked) {
      saveCard(buildTrackedCard(accountId, accountName));
    } else {
      const cardToDelete = cardsByAccountId.get(accountId);
      if (cardToDelete) {
        deleteCard(cardToDelete.id);
      }
    }
  }

  async function testConnection() {
    if (!pat) {
      setConnectionMessage('Please save a token first');
      return;
    }

    setTestingConnection(true);
    setConnectionMessage('');

    try {
      const client = new YnabClient(pat);
      const budgets = await client.getBudgets();
      setConnectionMessage(`✅ Connected! Found ${budgets.length} budget(s)`);
    } catch (error) {
      setConnectionMessage(`❌ Connection failed: ${getErrorMessage(error)}`);
    } finally {
      setTestingConnection(false);
    }
  }

  function handleExport() {
    const json = exportSettings();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ynab-rewards-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        importSettings(event.target?.result as string);
        setConnectionMessage('✅ Settings imported successfully');
      } catch (error) {
        setConnectionMessage(`❌ Failed to import settings: ${getErrorMessage(error)}`);
      }
    };
    reader.readAsText(file);
  }

  function handleSaveValuations(e: React.FormEvent) {
    e.preventDefault();
    const mv = isFinite(milesValuation) && milesValuation >= 0 ? milesValuation : 0.01;
    updateSettings({ milesValuation: mv });
    setValuationMessage('Saved valuations. Recommendations will use normalised dollars.');
  }

  function handleClearAll() {
    clearAll();
    setPAT('');
    setBudgets([]);
    persistSelectedBudget('', '');
    setAccounts([]);
    persistTrackedAccountIds([]);
    setShowClearDialog(false);
  }

  function parseExportedSettings(): unknown {
    try {
      return JSON.parse(exportSettings());
    } catch (error) {
      throw new Error('Failed to prepare settings for cloud sync');
    }
  }

  async function uploadWithPhrase(phrase: string, options: { generated?: boolean } = {}) {
    const normalised = normaliseMnemonic(phrase);
    if (!isValidMnemonic(normalised)) {
      throw new Error('Invalid sync code. Check the words and try again.');
    }

    const payload = parseExportedSettings();
    const keyId = await computeKeyId(normalised);
    const { ciphertext, iv } = await encryptJson(normalised, payload);
    const { updatedAt } = await uploadEncryptedSettings({ keyId, ciphertext, iv });

    updateSettings({ cloudSyncKeyId: keyId, cloudSyncLastSyncedAt: updatedAt });
    setCloudSyncPhrase(normalised);
    setGeneratedCloudPhrase(options.generated ? normalised : null);
    setCloudSyncMessage('Settings uploaded to Cloudflare KV. Copy your sync code to keep it safe.');
  }

  async function handleGenerateCloudSync() {
    setCloudSyncError('');
    setCloudSyncMessage('');
    const phrase = createMnemonic();
    setCloudSyncAction('generate');
    try {
      await uploadWithPhrase(phrase, { generated: true });
    } catch (error) {
      setGeneratedCloudPhrase(null);
      setCloudSyncError(getErrorMessage(error));
    } finally {
      setCloudSyncAction('idle');
    }
  }

  async function handleCloudUpload() {
    if (!cloudSyncPhrase.trim()) {
      setCloudSyncError('Enter your sync code before uploading.');
      return;
    }

    setCloudSyncError('');
    setCloudSyncMessage('');
    setCloudSyncAction('upload');
    try {
      await uploadWithPhrase(cloudSyncPhrase);
    } catch (error) {
      setCloudSyncError(getErrorMessage(error));
    } finally {
      setCloudSyncAction('idle');
    }
  }

  async function handleCloudDownload() {
    if (!cloudSyncPhrase.trim()) {
      setCloudSyncError('Enter your sync code before downloading.');
      return;
    }

    setCloudSyncError('');
    setCloudSyncMessage('');
    setCloudSyncAction('download');
    try {
      const normalised = normaliseMnemonic(cloudSyncPhrase);
      if (!isValidMnemonic(normalised)) {
        throw new Error('Invalid sync code.');
      }

      const keyId = await computeKeyId(normalised);
      const stored = await fetchEncryptedSettings(keyId);

      if (!stored) {
        throw new Error('No cloud backup found for this sync code.');
      }

      const decrypted = await decryptJson<unknown>(normalised, stored.ciphertext, stored.iv);
      importSettings(JSON.stringify(decrypted, null, 2));
      updateSettings({ cloudSyncKeyId: keyId, cloudSyncLastSyncedAt: stored.updatedAt });
      setCloudSyncPhrase(normalised);
      setGeneratedCloudPhrase(null);
      setCloudSyncMessage('Settings downloaded and applied.');
    } catch (error) {
      setCloudSyncError(getErrorMessage(error));
    } finally {
      setCloudSyncAction('idle');
    }
  }

  async function handleCloudDelete() {
    const trimmedInput = cloudSyncPhrase.trim();
    let keyId = settings.cloudSyncKeyId;

    if (!keyId && trimmedInput) {
      const normalised = normaliseMnemonic(trimmedInput);
      if (!isValidMnemonic(normalised)) {
        setCloudSyncError('Enter a valid sync code before deleting.');
        return;
      }
      keyId = await computeKeyId(normalised);
    }

    if (!keyId) {
      setCloudSyncError('Nothing to delete. Upload once before removing the backup.');
      return;
    }

    setCloudSyncError('');
    setCloudSyncMessage('');
    setCloudSyncAction('delete');
    try {
      await deleteEncryptedSettings(keyId);
      updateSettings({ cloudSyncKeyId: undefined, cloudSyncLastSyncedAt: undefined });
      setGeneratedCloudPhrase(null);
      setCloudSyncPhrase('');
      setCloudSyncMessage('Cloud backup deleted.');
    } catch (error) {
      setCloudSyncError(getErrorMessage(error));
    } finally {
      setCloudSyncAction('idle');
    }
  }

  async function handleCopyGeneratedPhrase() {
    if (!generatedCloudPhrase) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedCloudPhrase);
      setCloudSyncMessage('Sync code copied to clipboard.');
    } catch (error) {
      setCloudSyncError(`Copy failed: ${getErrorMessage(error)}`);
    }
  }

  if (patLoading || cardsLoading) {
    return <div className="p-5">Loading settings...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      {/* YNAB Connection */}
      <Card id="settings-budget">
        <CardHeader>
          <CardTitle>YNAB Connection</CardTitle>
          <CardDescription>
            Connect your YNAB account to sync transactions and budgets
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pat ? (
            <form onSubmit={handleSaveToken} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Get your Personal Access Token from your{' '}
                <a 
                  href="https://app.ynab.com/settings/developer" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  YNAB Developer Settings
                </a>
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste your YNAB Personal Access Token"
                  className="flex-1 px-3 py-2 border rounded-md"
                />
                <Button type="submit">Save Token</Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                <span className="font-medium">Token configured</span>
              </div>
              
              {/* Budget Selection */}
              {selectedBudget.id && !showBudgetSelector ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Selected Budget</p>
                      <p className="text-lg">{selectedBudget.name}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        fetchBudgets();
                        setShowBudgetSelector(true);
                      }}
                    >
                      Change Budget
                    </Button>
                  </div>
                </div>
              ) : loadingBudgets ? (
                <p className="text-sm">Loading budgets...</p>
              ) : (budgets.length > 0 || showBudgetSelector) ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select a budget:</label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedBudget.id || ''}
                      onValueChange={(value) => {
                        const budget = budgets.find(b => b.id === value);
                        if (budget) handleBudgetSelect(budget.id, budget.name);
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Choose a budget..." />
                      </SelectTrigger>
                      <SelectContent>
                        {budgets.map(budget => (
                          <SelectItem key={budget.id} value={budget.id}>
                            {budget.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedBudget.id && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setShowBudgetSelector(false)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <Button 
                  variant="outline"
                  onClick={fetchBudgets}
                >
                  Load Budgets
                </Button>
              )}
              
              <div className="flex gap-2">
                <Button 
                  variant="outline"
                  onClick={testConnection} 
                  disabled={testingConnection}
                >
                  {testingConnection ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      Testing...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => {
                    setPAT('');
                    setBudgets([]);
                    persistSelectedBudget('', '');
                    setAccounts([]);
                    persistTrackedAccountIds([]);
                  }}
                >
                  Clear Token
                </Button>
              </div>
            </div>
          )}
          {connectionMessage && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{connectionMessage}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Accounts for Rewards Tracking */}
      {selectedBudget.id && (
        <Card id="settings-accounts">
          <CardHeader>
            <CardTitle>Accounts for Rewards Tracking</CardTitle>
            <CardDescription>
              Select which accounts you want to track for rewards (including checking, savings, and credit cards)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAccounts ? (
              <p className="text-sm">Loading accounts...</p>
            ) : accounts.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {accounts.map(account => {
                  const isTracked = trackedAccountIds.includes(account.id);
                  const linkedCard = cardsByAccountId.get(account.id);

                  return (
                    <TrackedAccountCard
                      key={account.id} 
                      account={account}
                      isTracked={isTracked}
                      linkedCard={linkedCard}
                      onToggle={() => handleAccountToggle(account.id, account.name)}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No accounts found in this budget.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rewards Cards Management */}
      <Card>
        <CardHeader>
          <CardTitle>Rewards Preferences</CardTitle>
          <CardDescription>
            Optimise valuations for your rewards. Use the tracked accounts grid above to dive straight into detailed card settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveValuations} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Dollars per mile</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={milesValuation}
                onChange={(e) => setMilesValuation(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-md mt-1"
                placeholder="0.01"
                aria-label="Miles valuation in dollars per mile"
              />
              <p className="text-xs text-muted-foreground mt-1">Typical range 0.010–0.020. Defaults to 0.010.</p>
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <Button type="submit">Save Valuations</Button>
              {valuationMessage && (
                <span className="text-sm text-muted-foreground">{valuationMessage}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cloud Sync (optional)</CardTitle>
          <CardDescription>
            Encrypt your settings with a 12-word sync code and store them in Cloudflare KV via Netlify functions. No sign-in required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {generatedCloudPhrase && (
              <div className="rounded-md border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
                    <span className="text-sm font-medium">New sync code</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyGeneratedPhrase}
                  >
                    <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                    Copy
                  </Button>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words font-mono text-sm">
                  {generatedCloudPhrase}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="cloud-sync-phrase">
                Sync code
              </label>
              <textarea
                id="cloud-sync-phrase"
                className="w-full rounded-md border px-3 py-2 font-mono text-sm"
                rows={2}
                value={cloudSyncPhrase}
                onChange={(event) => setCloudSyncPhrase(event.target.value)}
                placeholder="twelve lowercase words separated by spaces"
              />
              <p className="text-xs text-muted-foreground">
                Paste your existing code or generate a new one. Keep it private — anyone with the code can import your settings.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleGenerateCloudSync}
                disabled={isCloudSyncBusy}
              >
                <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                {isGeneratingCloudSync ? 'Generating…' : 'Generate & upload'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloudUpload}
                disabled={isCloudSyncBusy}
              >
                <CloudUpload className="mr-2 h-4 w-4" aria-hidden="true" />
                {isUploadingCloudSync ? 'Uploading…' : 'Upload with code'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloudDownload}
                disabled={isCloudSyncBusy}
              >
                <CloudDownload className="mr-2 h-4 w-4" aria-hidden="true" />
                {isDownloadingCloudSync ? 'Downloading…' : 'Download & apply'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleCloudDelete}
                disabled={isCloudSyncBusy}
              >
                <CloudOff className="mr-2 h-4 w-4" aria-hidden="true" />
                {isDeletingCloudSync ? 'Deleting…' : 'Delete cloud backup'}
              </Button>
            </div>

            {cloudSyncLastSynced && (
              <p className="text-xs text-muted-foreground">
                Last synced: {cloudSyncLastSynced}
              </p>
            )}

            {cloudSyncMessage && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>{cloudSyncMessage}</AlertDescription>
              </Alert>
            )}

            {cloudSyncError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>{cloudSyncError}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>
            Export, import, or clear all your settings and data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export Settings
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Import Settings
            </Button>
            <Button 
              variant="destructive"
              onClick={() => setShowClearDialog(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear All Data
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
            aria-label="Import settings file"
          />
          <p className="text-sm text-muted-foreground mt-3">
            Export saves your cards and rules (but not your PAT). Import merges with existing data.
          </p>
        </CardContent>
      </Card>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showClearDialog}
        title="Clear All Data"
        message="This will delete all your settings, cards, and data. Your PAT will also be removed. This action cannot be undone."
        confirmText="Clear All"
        cancelText="Cancel"
        onConfirm={handleClearAll}
        onCancel={() => setShowClearDialog(false)}
      />

    </div>
  );
}
