'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useYnabPAT, useCreditCards, useSettings } from '@/hooks/useLocalStorage';
import { YnabClient } from '@/lib/ynab-client';
import { CreditCard, storage } from '@/lib/storage';
import { sanitizeInput, validateYnabToken, validateCardName, validateIssuer } from '@/lib/validation';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  Edit2, 
  Download, 
  Upload, 
  AlertCircle,
  RefreshCw,
  Link2,
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

// Type guard for card types
function isValidCardType(value: string): value is 'cashback' | 'points' | 'miles' {
  return value === 'cashback' || value === 'points' || value === 'miles';
}

export default function SettingsPage() {
  const { pat, setPAT, isLoading: patLoading } = useYnabPAT();
  const { cards, saveCard, deleteCard, isLoading: cardsLoading } = useCreditCards();
  const { exportSettings, importSettings, clearAll } = useSettings();
  
  const [tokenInput, setTokenInput] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showDeleteCardDialog, setShowDeleteCardDialog] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Budget and account selection state
  const [budgets, setBudgets] = useState<YnabBudget[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<{ id?: string; name?: string }>({});
  const [accounts, setAccounts] = useState<YnabAccount[]>([]);
  const [trackedAccountIds, setTrackedAccountIds] = useState<string[]>([]);
  const [loadingBudgets, setLoadingBudgets] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [showBudgetSelector, setShowBudgetSelector] = useState(false);

  // Card form state
  const [showCardForm, setShowCardForm] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  type CardFormData = {
    name: string;
    issuer: string;
    type: 'cashback' | 'points' | 'miles';
  };

  const [cardForm, setCardForm] = useState<CardFormData>({
    name: '',
    issuer: '',
    type: 'cashback',
  });

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
    
    // Create cards for tracked accounts that don't exist yet
    ynabAccounts.forEach((account) => {
      if (savedTrackedIds.includes(account.id)) {
        const existingCard = cards.find(c => c.ynabAccountId === account.id);
        if (!existingCard) {
          // Create a new card for this YNAB account
          const newCard: CreditCard = {
            id: `ynab-${account.id}`,
            name: account.name,
            issuer: 'Unknown', // User can edit later
            type: 'cashback', // Default, user can edit
            active: true,
            ynabAccountId: account.id,
            isManual: false,
          };
          saveCard(newCard);
        }
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
    
    // If adding an account, create a card for it
    if (!trackedAccountIds.includes(accountId)) {
      const newCard: CreditCard = {
        id: `ynab-${accountId}`,
        name: accountName,
        issuer: 'Unknown',
        type: 'cashback',
        active: true,
        ynabAccountId: accountId,
        isManual: false,
      };
      saveCard(newCard);
    } else {
      // If removing, delete the associated card
      const cardToDelete = cards.find(c => c.ynabAccountId === accountId);
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


  function handleEditCard(card: CreditCard) {
    setEditingCard(card);
    setCardForm({ name: card.name, issuer: card.issuer || '', type: card.type });
    setShowCardForm(true);
  }

  function handleSaveCard(e: React.FormEvent) {
    e.preventDefault();
    
    // Validate inputs
    const nameValidation = validateCardName(cardForm.name);
    if (!nameValidation.valid) {
      setConnectionMessage(`❌ ${nameValidation.error}`);
      return;
    }
    
    const issuerValidation = validateIssuer(cardForm.issuer);
    if (!issuerValidation.valid) {
      setConnectionMessage(`❌ ${issuerValidation.error}`);
      return;
    }
    
    const card: CreditCard = {
      id: editingCard?.id || `card-${Date.now()}`,
      name: sanitizeInput(cardForm.name),
      issuer: sanitizeInput(cardForm.issuer),
      type: cardForm.type,
      active: editingCard?.active ?? true,
      ynabAccountId: editingCard?.ynabAccountId,
      isManual: editingCard?.isManual ?? true,
    };
    saveCard(card);
    setShowCardForm(false);
    setCardForm({ name: '', issuer: '', type: 'cashback' });
    setConnectionMessage('');
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
      <Card>
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
        <Card>
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
              <div className="space-y-2">
                {accounts.map(account => {
                  const accountTypeLabel = ACCOUNT_TYPE_LABELS[account.type] || account.type;
                  const Icon = account.type === 'creditCard' ? CreditCardIcon : 
                               account.type === 'checking' ? Wallet :
                               DollarSign;
                  
                  return (
                    <label 
                      key={account.id} 
                      className={cn(
                        "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        trackedAccountIds.includes(account.id)
                          ? "bg-primary/10 border-primary/50 hover:bg-primary/20"
                          : "hover:bg-secondary/50"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={trackedAccountIds.includes(account.id)}
                        onChange={() => handleAccountToggle(account.id, account.name)}
                        className="rounded"
                      />
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium">{account.name}</div>
                        <div className="text-sm text-muted-foreground">{accountTypeLabel}</div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        ${(account.balance / 1000).toFixed(2)}
                      </div>
                    </label>
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
          <CardTitle>Rewards Cards Management</CardTitle>
          <CardDescription>
            Manage your cards and their reward rules
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {showCardForm && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Edit Card
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveCard} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Card Name</label>
                    <input
                      type="text"
                      value={cardForm.name}
                      onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })}
                      required
                      className="w-full px-3 py-2 border rounded-md mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Issuer</label>
                    <input
                      type="text"
                      value={cardForm.issuer}
                      onChange={(e) => setCardForm({ ...cardForm, issuer: e.target.value })}
                      required
                      placeholder="e.g., Chase, Amex, Citi"
                      className="w-full px-3 py-2 border rounded-md mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Type</label>
                    <Select
                      value={cardForm.type}
                      onValueChange={(value) => {
                        if (isValidCardType(value)) {
                          setCardForm({ ...cardForm, type: value });
                        }
                      }}
                    >
                      <SelectTrigger className="w-full mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cashback">Cashback</SelectItem>
                        <SelectItem value="points">Points</SelectItem>
                        <SelectItem value="miles">Miles</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit">Save Card</Button>
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => setShowCardForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cards configured yet.</p>
          ) : (
            <div className="space-y-4">
              {cards.filter(card => !card.isManual).length > 0 && (
                <>
                  <h3 className="font-semibold text-sm">YNAB-Linked Cards</h3>
                  <div className="space-y-2">
                    {cards.filter(card => !card.isManual).map((card) => (
                      <div 
                        key={card.id} 
                        className="flex items-center justify-between p-3 rounded-lg border bg-blue-50 dark:bg-blue-950"
                      >
                        <div className="flex items-center gap-3">
                          <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          <div>
                            <div className="font-medium">{card.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {card.issuer} • {card.type}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleEditCard(card)}
                            aria-label={`Edit ${card.name}`}
                          >
                            <Edit2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => setShowDeleteCardDialog(card.id)}
                            aria-label={`Delete ${card.name}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              
              {cards.filter(card => card.isManual).length > 0 && (
                <>
                  <h3 className="font-semibold text-sm">Manual Cards</h3>
                  <div className="space-y-2">
                    {cards.filter(card => card.isManual).map((card) => (
                      <div 
                        key={card.id} 
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <CreditCardIcon className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{card.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {card.issuer} • {card.type}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleEditCard(card)}
                            aria-label={`Edit ${card.name}`}
                          >
                            <Edit2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => setShowDeleteCardDialog(card.id)}
                            aria-label={`Delete ${card.name}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
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

      <ConfirmDialog
        isOpen={!!showDeleteCardDialog}
        title="Delete Card"
        message="Are you sure you want to delete this card? This will also delete all associated reward rules."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => {
          if (showDeleteCardDialog) {
            deleteCard(showDeleteCardDialog);
            // If it's a YNAB-linked card, also remove from tracked accounts
            const card = cards.find(c => c.id === showDeleteCardDialog);
            if (card?.ynabAccountId) {
              const newTrackedIds = trackedAccountIds.filter(id => id !== card.ynabAccountId);
              setTrackedAccountIds(newTrackedIds);
              storage.setTrackedAccountIds(newTrackedIds);
            }
            setShowDeleteCardDialog(null);
          }
        }}
        onCancel={() => setShowDeleteCardDialog(null)}
      />
    </div>
  );
}