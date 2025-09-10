'use client';

import { useState, useRef, useEffect } from 'react';
import { useYnabPAT, useCreditCards, useSettings } from '@/hooks/useLocalStorage';
import { YnabClient } from '@/lib/ynab-client';
import { CreditCard, storage } from '@/lib/storage';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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

// Style constants
const styles = {
  section: { marginBottom: 40 },
  inputFull: { width: '100%', padding: 8, marginTop: 5 },
  buttonSpacing: { marginLeft: 10 },
  cardItem: {
    padding: 10,
    marginBottom: 10,
    border: '1px solid #ddd',
    borderRadius: 4,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ynabCardItem: {
    padding: 10,
    marginBottom: 10,
    border: '1px solid #ddd',
    borderRadius: 4,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
  },
} as const;

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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setConnectionMessage(`Failed to fetch budgets: ${errorMessage}`);
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setConnectionMessage(`Failed to fetch accounts: ${errorMessage}`);
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
    if (!tokenInput.trim()) return;

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
      setConnectionMessage(`Connected successfully! Found ${budgets.length} budget(s)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setConnectionMessage(`Connection failed: ${errorMessage}`);
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        alert(`Failed to import settings: ${errorMessage}`);
      }
    };
    reader.readAsText(file);
  }

  function handleAddCard() {
    setEditingCard(null);
    setCardForm({ name: '', issuer: '', type: 'cashback' });
    setShowCardForm(true);
  }

  function handleEditCard(card: CreditCard) {
    setEditingCard(card);
    setCardForm({ name: card.name, issuer: card.issuer, type: card.type });
    setShowCardForm(true);
  }

  function handleSaveCard(e: React.FormEvent) {
    e.preventDefault();
    const card: CreditCard = {
      id: editingCard?.id || `card-${Date.now()}`,
      name: cardForm.name,
      issuer: cardForm.issuer,
      type: cardForm.type,
      active: editingCard?.active ?? true,
      ynabAccountId: editingCard?.ynabAccountId,
      isManual: editingCard?.isManual ?? true,
    };
    saveCard(card);
    setShowCardForm(false);
    setCardForm({ name: '', issuer: '', type: 'cashback' });
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
    return <div style={{ padding: 20 }}>Loading settings...</div>;
  }

  return (
    <div style={{ maxWidth: 800, margin: '20px auto', padding: 20 }}>
      <h1>Settings</h1>

      {/* YNAB Connection */}
      <section style={styles.section}>
        <h2>YNAB Connection</h2>
        {!pat ? (
          <form onSubmit={handleSaveToken}>
            <p>Get your Personal Access Token from your{' '}
              <a href="https://app.ynab.com/settings/developer" target="_blank" rel="noopener noreferrer">
                YNAB Developer Settings
              </a>
            </p>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste your YNAB Personal Access Token"
              style={{ width: '100%', padding: 8, marginTop: 10 }}
            />
            <button type="submit" style={{ marginTop: 10 }}>
              Save Token
            </button>
          </form>
        ) : (
          <div>
            <p style={{ color: 'green' }}>Token configured</p>
            
            {/* Budget Selection */}
            {selectedBudget.id && !showBudgetSelector ? (
              <div style={{ marginTop: 15 }}>
                <p><strong>Selected Budget:</strong> {selectedBudget.name}</p>
                <button onClick={() => {
                  fetchBudgets();
                  setShowBudgetSelector(true);
                }}>Change Budget</button>
              </div>
            ) : loadingBudgets ? (
              <p>Loading budgets...</p>
            ) : (budgets.length > 0 || showBudgetSelector) ? (
              <div style={{ marginTop: 15 }}>
                <label>
                  Select a budget:
                  <select 
                    value={selectedBudget.id || ''}
                    onChange={(e) => {
                      const budget = budgets.find(b => b.id === e.target.value);
                      if (budget) handleBudgetSelect(budget.id, budget.name);
                    }}
                    style={{ marginLeft: 10, padding: 5 }}
                  >
                    <option value="">Choose a budget...</option>
                    {budgets.map(budget => (
                      <option key={budget.id} value={budget.id}>
                        {budget.name}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedBudget.id && (
                  <button onClick={() => setShowBudgetSelector(false)} style={{ marginLeft: 10 }}>
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <button onClick={fetchBudgets} style={{ marginTop: 10 }}>
                Load Budgets
              </button>
            )}
            
            <div style={{ marginTop: 10 }}>
              <button onClick={testConnection} disabled={testingConnection}>
                {testingConnection ? 'Testing...' : 'Test Connection'}
              </button>
              <button onClick={() => {
                setPAT('');
                setBudgets([]);
                setSelectedBudget({});
                setAccounts([]);
                setTrackedAccountIds([]);
              }} style={{ marginLeft: 10 }}>
                Clear Token
              </button>
            </div>
          </div>
        )}
        {connectionMessage && <p style={{ marginTop: 10 }}>{connectionMessage}</p>}
      </section>

      {/* Accounts for Rewards Tracking */}
      {selectedBudget.id && (
        <section style={styles.section}>
          <h2>Accounts for Rewards Tracking</h2>
          <p>Select which accounts you want to track for rewards (including checking, savings, and credit cards):</p>
          
          {loadingAccounts ? (
            <p>Loading accounts...</p>
          ) : accounts.length > 0 ? (
            <div style={{ 
              border: '1px solid #ddd', 
              borderRadius: 8, 
              padding: 15,
              marginTop: 15 
            }}>
              {accounts.map(account => {
                const accountTypeLabel = ACCOUNT_TYPE_LABELS[account.type] || account.type;
                
                return (
                  <label key={account.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    padding: '8px 0',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f0f0f0'
                  }}>
                    <input
                      type="checkbox"
                      checked={trackedAccountIds.includes(account.id)}
                      onChange={() => handleAccountToggle(account.id, account.name)}
                      style={{ marginRight: 10 }}
                    />
                    <div style={{ flex: 1 }}>
                      <span>{account.name}</span>
                      <span style={{ marginLeft: 10, color: '#888', fontSize: '0.85em' }}>
                        {accountTypeLabel}
                      </span>
                    </div>
                    <span style={{ color: '#666', fontSize: '0.9em' }}>
                      Balance: ${(account.balance / 1000).toFixed(2)}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p>No accounts found in this budget.</p>
          )}
        </section>
      )}

      {/* Cards Management */}
      <section style={styles.section}>
        <h2>Rewards Cards Management</h2>
        <p>Manage your cards and their reward rules:</p>
        
        <button onClick={handleAddCard} style={{ marginBottom: 20 }}>
          + Add Manual Card
        </button>

        {showCardForm && (
          <form onSubmit={handleSaveCard} style={{ 
            border: '1px solid #ccc', 
            padding: 20, 
            marginBottom: 20,
            borderRadius: 8 
          }}>
            <h3>{editingCard ? 'Edit Card' : 'Add Manual Card'}</h3>
            <div style={{ marginBottom: 10 }}>
              <label>
                Card Name:
                <input
                  type="text"
                  value={cardForm.name}
                  onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })}
                  required
                  style={styles.inputFull}
                />
              </label>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>
                Issuer:
                <input
                  type="text"
                  value={cardForm.issuer}
                  onChange={(e) => setCardForm({ ...cardForm, issuer: e.target.value })}
                  required
                  placeholder="e.g., Chase, Amex, Citi"
                  style={styles.inputFull}
                />
              </label>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>
                Type:
                <select
                  value={cardForm.type}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isValidCardType(value)) {
                      setCardForm({ ...cardForm, type: value });
                    }
                  }}
                  style={styles.inputFull}
                >
                  <option value="cashback">Cashback</option>
                  <option value="points">Points</option>
                  <option value="miles">Miles</option>
                </select>
              </label>
            </div>
            <button type="submit">Save Card</button>
            <button type="button" onClick={() => setShowCardForm(false)} style={{ marginLeft: 10 }}>
              Cancel
            </button>
          </form>
        )}

        <div>
          {cards.length === 0 ? (
            <p>No cards configured yet.</p>
          ) : (
            <div>
              <h3>YNAB-Linked Cards</h3>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {cards.filter(card => !card.isManual).map((card) => (
                  <li key={card.id} style={styles.ynabCardItem}>
                    <div>
                      <strong>{card.name}</strong>
                      <span style={{ marginLeft: 10, color: '#666' }}>
                        {card.issuer} • {card.type} • YNAB-linked
                      </span>
                    </div>
                    <div>
                      <button onClick={() => handleEditCard(card)} style={{ marginRight: 10 }}>
                        Edit
                      </button>
                      <button onClick={() => setShowDeleteCardDialog(card.id)}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              
              {cards.some(card => card.isManual) && (
                <>
                  <h3>Manual Cards</h3>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {cards.filter(card => card.isManual).map((card) => (
                      <li key={card.id} style={styles.cardItem}>
                        <div>
                          <strong>{card.name}</strong>
                          <span style={{ marginLeft: 10, color: '#666' }}>
                            {card.issuer} • {card.type}
                          </span>
                        </div>
                        <div>
                          <button onClick={() => handleEditCard(card)} style={{ marginRight: 10 }}>
                            Edit
                          </button>
                          <button onClick={() => setShowDeleteCardDialog(card.id)}>
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Data Management */}
      <section style={styles.section}>
        <h2>Data Management</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={handleExport}>
            Export Settings
          </button>
          <button onClick={() => fileInputRef.current?.click()}>
            Import Settings
          </button>
          <button onClick={() => setShowClearDialog(true)} style={{ backgroundColor: '#dc3545', color: 'white' }}>
            Clear All Data
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          style={{ display: 'none' }}
        />
        <p style={{ marginTop: 10, fontSize: '0.9em', color: '#666' }}>
          Export saves your cards and rules (but not your PAT). Import merges with existing data.
        </p>
      </section>

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