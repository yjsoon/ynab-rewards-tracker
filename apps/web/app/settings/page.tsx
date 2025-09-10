'use client';

import { useState, useRef } from 'react';
import { useYnabPAT, useCreditCards, useSettings } from '@/hooks/useLocalStorage';
import { YnabClient } from '@/lib/ynab-client';
import { CreditCard } from '@/lib/storage';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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

  // Card form state
  const [showCardForm, setShowCardForm] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  const [cardForm, setCardForm] = useState<{
    name: string;
    issuer: string;
    type: 'cashback' | 'points' | 'miles';
  }>({
    name: '',
    issuer: '',
    type: 'cashback',
  });

  async function handleSaveToken(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setPAT(tokenInput);
    setConnectionMessage('Token saved!');
    setTokenInput('');
    setTimeout(() => setConnectionMessage(''), 3000);
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
      setConnectionMessage(`❌ Connection failed: ${error}`);
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
        alert('Failed to import settings: ' + error);
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
    };
    saveCard(card);
    setShowCardForm(false);
    setCardForm({ name: '', issuer: '', type: 'cashback' });
  }

  if (patLoading || cardsLoading) {
    return <div style={{ padding: 20 }}>Loading settings...</div>;
  }

  return (
    <div style={{ maxWidth: 800, margin: '20px auto', padding: 20 }}>
      <h1>Settings</h1>

      {/* YNAB Connection */}
      <section style={{ marginBottom: 40 }}>
        <h2>YNAB Connection</h2>
        {pat ? (
          <div>
            <p style={{ color: 'green' }}>✅ Token configured</p>
            <button onClick={testConnection} disabled={testingConnection}>
              {testingConnection ? 'Testing...' : 'Test Connection'}
            </button>
            <button onClick={() => setPAT('')} style={{ marginLeft: 10 }}>
              Clear Token
            </button>
          </div>
        ) : (
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
        )}
        {connectionMessage && <p style={{ marginTop: 10 }}>{connectionMessage}</p>}
      </section>

      {/* Credit Cards */}
      <section style={{ marginBottom: 40 }}>
        <h2>Credit Cards</h2>
        <button onClick={handleAddCard} style={{ marginBottom: 20 }}>
          + Add Card
        </button>

        {showCardForm && (
          <form onSubmit={handleSaveCard} style={{ 
            border: '1px solid #ccc', 
            padding: 20, 
            marginBottom: 20,
            borderRadius: 8 
          }}>
            <h3>{editingCard ? 'Edit Card' : 'Add Card'}</h3>
            <div style={{ marginBottom: 10 }}>
              <label>
                Card Name:
                <input
                  type="text"
                  value={cardForm.name}
                  onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })}
                  required
                  style={{ width: '100%', padding: 8, marginTop: 5 }}
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
                  style={{ width: '100%', padding: 8, marginTop: 5 }}
                />
              </label>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>
                Type:
                <select
                  value={cardForm.type}
                  onChange={(e) => setCardForm({ ...cardForm, type: e.target.value as any })}
                  style={{ width: '100%', padding: 8, marginTop: 5 }}
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
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {cards.map((card) => (
                <li key={card.id} style={{ 
                  padding: 10, 
                  marginBottom: 10, 
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
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
          )}
        </div>
      </section>

      {/* Data Management */}
      <section style={{ marginBottom: 40 }}>
        <h2>Data Management</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={handleExport}>
            📥 Export Settings
          </button>
          <button onClick={() => fileInputRef.current?.click()}>
            📤 Import Settings
          </button>
          <button onClick={() => setShowClearDialog(true)} style={{ backgroundColor: '#dc3545', color: 'white' }}>
            🗑️ Clear All Data
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
        onConfirm={() => {
          clearAll();
          setShowClearDialog(false);
          setPAT(''); // Also clear the PAT from state
        }}
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
            setShowDeleteCardDialog(null);
          }
        }}
        onCancel={() => setShowDeleteCardDialog(null)}
      />
    </div>
  );
}