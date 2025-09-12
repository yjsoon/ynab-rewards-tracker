'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useYnabPAT, useCreditCards } from '@/hooks/useLocalStorage';
import { YnabClient } from '@/lib/ynab-client';
import { storage } from '@/lib/storage';
import { SetupPrompt } from '@/components/SetupPrompt';
import type { Transaction } from '@/types/transaction';

export default function DashboardPage() {
  const { pat } = useYnabPAT();
  const { cards } = useCreditCards();

  const [selectedBudget, setSelectedBudget] = useState<{ id?: string; name?: string }>({});
  const [trackedAccounts, setTrackedAccounts] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSetupPrompt, setShowSetupPrompt] = useState(false);

  const loadRecentTransactions = useCallback(async (budgetId: string) => {
    if (!pat) return;
    
    setLoading(true);
    setError('');
    try {
      const client = new YnabClient(pat);
      // Get transactions from the last 30 days
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - 30);
      const txns = await client.getTransactions(budgetId, {
        since_date: sinceDate.toISOString().split('T')[0],
      });
      // Show only the 10 most recent transactions
      setTransactions(txns.slice(0, 10));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to load transactions: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [pat]);

  useEffect(() => {
    // Check if we should show setup prompt (only on client side)
    if (typeof window !== 'undefined') {
      const hasSeenSetup = localStorage.getItem('hasSeenSetupPrompt');
      if (!pat && !hasSeenSetup) {
        setShowSetupPrompt(true);
      }
    }

    // Load saved settings
    const budget = storage.getSelectedBudget();
    setSelectedBudget(budget);
    setTrackedAccounts(storage.getTrackedAccountIds());

    // Load transactions if we have everything configured
    if (pat && budget.id) {
      loadRecentTransactions(budget.id);
    }
  }, [pat, loadRecentTransactions]);

  const handleDismissSetup = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hasSeenSetupPrompt', 'true');
    }
    setShowSetupPrompt(false);
  };

  // Calculate some basic stats
  const isFullyConfigured = pat && selectedBudget.id && trackedAccounts.length > 0;
  const setupProgress = [
    pat ? 1 : 0,
    selectedBudget.id ? 1 : 0,
    trackedAccounts.length > 0 ? 1 : 0,
    cards.length > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
  const setupPercentage = (setupProgress / 4) * 100;

  // Empty state when nothing is configured
  if (!pat) {
    return (
      <div style={{ maxWidth: 1200, margin: '20px auto', padding: 20 }}>
        {showSetupPrompt && <SetupPrompt onDismiss={handleDismissSetup} />}
        
        <h1>Dashboard</h1>
        
        <div style={{
          textAlign: 'center',
          padding: 60,
          backgroundColor: '#f8f9fa',
          borderRadius: 8,
          marginTop: 40,
        }}>
          <h2 style={{ marginBottom: 20 }}>No YNAB Connection</h2>
          <p style={{ fontSize: '1.1rem', marginBottom: 30, color: '#666' }}>
            Connect your YNAB account to start tracking rewards across all your cards
          </p>
          
          <Link href="/settings" style={{ 
            padding: '14px 32px', 
            backgroundColor: '#007bff', 
            color: 'white', 
            textDecoration: 'none',
            borderRadius: 4,
            display: 'inline-block',
            fontSize: '1.1rem',
            fontWeight: 'bold',
          }}>
            Connect YNAB Account
          </Link>
          
          <div style={{ marginTop: 40, maxWidth: 600, margin: '40px auto 0' }}>
            <h3>Why Connect YNAB?</h3>
            <ul style={{ textAlign: 'left', lineHeight: 1.8 }}>
              <li>Automatically calculate rewards based on your actual spending</li>
              <li>Track progress toward quarterly and annual spending caps</li>
              <li>Get recommendations for which card to use for each purchase</li>
              <li>All data stays in your browser - 100% private</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '20px auto', padding: 20 }}>
      <h1>Dashboard</h1>

      {/* Setup Progress */}
      {!isFullyConfigured && (
        <div style={{
          backgroundColor: '#e7f3ff',
          border: '1px solid #007bff',
          borderRadius: 8,
          padding: 20,
          marginBottom: 30,
        }}>
          <h3 style={{ marginTop: 0 }}>Setup Progress: {setupProgress}/4 steps completed</h3>
          <div style={{
            backgroundColor: '#ddd',
            height: 20,
            borderRadius: 10,
            overflow: 'hidden',
            marginBottom: 15,
          }}>
            <div style={{
              backgroundColor: '#007bff',
              height: '100%',
              width: `${setupPercentage}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span style={{ color: pat ? 'green' : '#666' }}>
              {pat ? '✓' : '○'} YNAB Token
            </span>
            <span style={{ color: selectedBudget.id ? 'green' : '#666' }}>
              {selectedBudget.id ? '✓' : '○'} Budget Selected
            </span>
            <span style={{ color: trackedAccounts.length > 0 ? 'green' : '#666' }}>
              {trackedAccounts.length > 0 ? '✓' : '○'} Accounts Tracked
            </span>
            <span style={{ color: cards.length > 0 ? 'green' : '#666' }}>
              {cards.length > 0 ? '✓' : '○'} Cards Configured
            </span>
          </div>
          {!isFullyConfigured && (
            <Link href="/settings" style={{
              display: 'inline-block',
              marginTop: 15,
              color: '#007bff',
              textDecoration: 'underline',
            }}>
              Complete Setup →
            </Link>
          )}
        </div>
      )}

      {/* Quick Stats */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
        gap: 20,
        marginBottom: 40 
      }}>
        <div style={{ 
          padding: 20, 
          border: '1px solid #ddd', 
          borderRadius: 8,
          backgroundColor: '#f8f9fa'
        }}>
          <h3>YNAB Status</h3>
          <p style={{ fontSize: '2em', margin: 0 }}>
            {pat ? '✅' : '❌'}
          </p>
          <p>{pat ? 'Connected' : 'Not Connected'}</p>
        </div>
        
        <div style={{ 
          padding: 20, 
          border: '1px solid #ddd', 
          borderRadius: 8,
          backgroundColor: '#f8f9fa'
        }}>
          <h3>Active Budget</h3>
          <p style={{ fontSize: '1.2em', margin: 0, fontWeight: 'bold' }}>
            {selectedBudget.name || 'None Selected'}
          </p>
          {selectedBudget.id && (
            <Link href="/settings" style={{ fontSize: '0.9em' }}>Change</Link>
          )}
        </div>

        <div style={{ 
          padding: 20, 
          border: '1px solid #ddd', 
          borderRadius: 8,
          backgroundColor: '#f8f9fa'
        }}>
          <h3>Tracked Accounts</h3>
          <p style={{ fontSize: '2em', margin: 0 }}>{trackedAccounts.length}</p>
          <Link href="/settings">Manage</Link>
        </div>

        <div style={{ 
          padding: 20, 
          border: '1px solid #ddd', 
          borderRadius: 8,
          backgroundColor: '#f8f9fa'
        }}>
          <h3>Reward Cards</h3>
          <p style={{ fontSize: '2em', margin: 0 }}>{cards.length}</p>
          <Link href="/settings">Configure</Link>
        </div>
      </div>

      {/* Recent Transactions Preview */}
      {isFullyConfigured && (
        <section style={{ marginBottom: 40 }}>
          <h2>Recent Transactions (Last 30 Days)</h2>
          {loading && <p>Loading transactions...</p>}
          {error && <p style={{ color: 'red' }}>{error}</p>}
          {!loading && !error && transactions.length > 0 && (
            <div style={{ 
              border: '1px solid #ddd',
              borderRadius: 8,
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: 10, textAlign: 'left' }}>Date</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Payee</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Category</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => (
                    <tr key={txn.id} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: 10 }}>
                        {new Date(txn.date).toLocaleDateString()}
                      </td>
                      <td style={{ padding: 10 }}>{txn.payee_name}</td>
                      <td style={{ padding: 10 }}>{txn.category_name || 'Uncategorized'}</td>
                      <td style={{ padding: 10, textAlign: 'right' }}>
                        ${Math.abs(txn.amount / 1000).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !error && transactions.length === 0 && (
            <p>No recent transactions found.</p>
          )}
        </section>
      )}

      {/* Cards Overview */}
      <section style={{ marginBottom: 40 }}>
        <h2>Your Reward Cards</h2>
        {cards.length === 0 ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            backgroundColor: '#f8f9fa',
            borderRadius: 8,
          }}>
            <p style={{ fontSize: '1.1rem', marginBottom: 20 }}>
              No cards configured yet
            </p>
            <Link href="/settings" style={{
              padding: '10px 20px',
              backgroundColor: '#28a745',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 4,
              display: 'inline-block',
            }}>
              Add Your First Card
            </Link>
          </div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
            gap: 20 
          }}>
            {cards.map((card) => (
              <div key={card.id} style={{ 
                padding: 20, 
                border: '1px solid #ddd',
                borderRadius: 8,
                backgroundColor: card.ynabAccountId ? '#f0f8ff' : '#fff',
                position: 'relative',
              }}>
                {card.ynabAccountId && (
                  <span style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    fontSize: '0.8em',
                    padding: '2px 6px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    borderRadius: 3,
                  }}>
                    YNAB Linked
                  </span>
                )}
                <h3 style={{ marginTop: 0 }}>{card.name}</h3>
                <p style={{ color: '#666' }}>{card.issuer}</p>
                <p style={{ 
                  display: 'inline-block',
                  padding: '4px 8px',
                  backgroundColor: '#e9ecef',
                  borderRadius: 4,
                  fontSize: '0.9em'
                }}>
                  {card.type}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Coming Soon */}
      {isFullyConfigured && (
        <section style={{ 
          padding: 30, 
          backgroundColor: '#f8f9fa',
          borderRadius: 8,
          textAlign: 'center'
        }}>
          <h2>🚧 Rewards Calculation Coming Soon</h2>
          <p>We're working on calculating your rewards based on your YNAB transactions and card rules.</p>
          <p>You're all set up and ready - rewards tracking will be available in the next update!</p>
        </section>
      )}
    </div>
  );
}