'use client';

import Link from 'next/link';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useYnabPAT, useCreditCards, useSettings } from '@/hooks/useLocalStorage';
import { YnabClient } from '@/lib/ynab-client';
import type { CreditCard } from '@/lib/storage';
import { storage } from '@/lib/storage';
import { validateYnabToken } from '@/lib/validation';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  DollarSign
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
    active: true,
    ynabAccountId: accountId,
    billingCycle: {
      type: 'calendar',
      dayOfMonth: 1,
    },
    earningRate: 1,
    earningBlockSize: null,
    minimumSpend: null,
    maximumSpend: null,
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
              {isTracked && (
                <Badge variant="outline" className="bg-primary/10 text-primary">
                  Tracking
                </Badge>
              )}
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
  const { exportSettings, importSettings, clearAll } = useSettings();
  
  const [tokenInput, setTokenInput] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Budget and account selection state
  const [budgets, setBudgets] = useState<YnabBudget[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<{ id?: string; name?: string }>({});
  const [accounts, setAccounts] = useState<YnabAccount[]>([]);
  const [trackedAccountIds, setTrackedAccountIds] = useState<string[]>([]);
  const [loadingBudgets, setLoadingBudgets] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [showBudgetSelector, setShowBudgetSelector] = useState(false);

  // Valuation settings
  const initialSettings = useMemo(() => storage.getSettings(), []);
  const [milesValuation, setMilesValuation] = useState<number>(
    typeof initialSettings.milesValuation === 'number' ? initialSettings.milesValuation : 0.01
  );
  // Points removed; only miles valuation remains
  const [valuationMessage, setValuationMessage] = useState<string>("");

  const cardsByAccountId = useMemo(() => {
    const entries = cards
      .filter((card): card is CreditCard & { ynabAccountId: string } => Boolean(card.ynabAccountId))
      .map(card => [card.ynabAccountId, card] as const);
    return new Map(entries);
  }, [cards]);

  useEffect(() => {
    if (!valuationMessage) return;
    const timeout = setTimeout(() => setValuationMessage(''), 2500);
    return () => clearTimeout(timeout);
  }, [valuationMessage]);

  // Load saved budget and tracked accounts on mount
  useEffect(() => {
    const savedBudget = storage.getSelectedBudget();
    setSelectedBudget(savedBudget);
    setTrackedAccountIds(storage.getTrackedAccountIds());
    
    // If we have a PAT and selected budget, fetch accounts
    if (pat && savedBudget.id) {
      fetchAccounts(savedBudget.id);
    }
    // If we have a PAT but no budget, fetch budgets
    else if (pat && !savedBudget.id) {
      fetchBudgets();
    }
  }, [pat]);

  async function fetchBudgets() {
    if (!pat) return;
    
    setLoadingBudgets(true);
    try {
      const client = new YnabClient(pat);
      const fetchedBudgets = await client.getBudgets();
      setBudgets(fetchedBudgets);
      
      // If only one budget, auto-select it
      if (fetchedBudgets.length === 1) {
        handleBudgetSelect(fetchedBudgets[0].id, fetchedBudgets[0].name);
      }
    } catch (error) {
      setConnectionMessage(`Failed to fetch budgets: ${getErrorMessage(error)}`);
    } finally {
      setLoadingBudgets(false);
    }
  }

  async function fetchAccounts(budgetId: string) {
    if (!pat) return;
    
    setLoadingAccounts(true);
    try {
      const client = new YnabClient(pat);
      const fetchedAccounts = await client.getAccounts(budgetId);
      // Filter to only show open accounts (all types - checking, savings, credit cards, etc.)
      const openAccounts = fetchedAccounts.filter(
        (acc: YnabAccount) => !acc.closed && acc.on_budget
      );
      setAccounts(openAccounts);
      
      // Sync tracked accounts with existing cards
      syncCardsWithAccounts(openAccounts);
    } catch (error) {
      setConnectionMessage(`Failed to fetch accounts: ${getErrorMessage(error)}`);
    } finally {
      setLoadingAccounts(false);
    }
  }

  function syncCardsWithAccounts(ynabAccounts: YnabAccount[]) {
    const savedTrackedIds = storage.getTrackedAccountIds();
    
    ynabAccounts.forEach((account) => {
      if (!savedTrackedIds.includes(account.id)) {
        return;
      }

      const existingCard = cardsByAccountId.get(account.id);
      if (!existingCard) {
        saveCard(buildTrackedCard(account.id, account.name));
      }
    });
  }

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

  function handleBudgetSelect(budgetId: string, budgetName: string) {
    storage.setSelectedBudget(budgetId, budgetName);
    setSelectedBudget({ id: budgetId, name: budgetName });
    setShowBudgetSelector(false);
    fetchAccounts(budgetId);
  }

  function handleAccountToggle(accountId: string, accountName: string) {
    const newTrackedIds = trackedAccountIds.includes(accountId)
      ? trackedAccountIds.filter(id => id !== accountId)
      : [...trackedAccountIds, accountId];
    
    setTrackedAccountIds(newTrackedIds);
    storage.setTrackedAccountIds(newTrackedIds);
    
    if (!trackedAccountIds.includes(accountId)) {
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
    storage.updateSettings({ milesValuation: mv });
    setValuationMessage('Saved valuations. Recommendations will use normalised dollars.');
  }

  function handleClearAll() {
    clearAll();
    setPAT('');
    setBudgets([]);
    setSelectedBudget({});
    setAccounts([]);
    setTrackedAccountIds([]);
    setShowClearDialog(false);
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
                    setSelectedBudget({});
                    setAccounts([]);
                    setTrackedAccountIds([]);
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
