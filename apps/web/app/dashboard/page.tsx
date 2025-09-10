'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useYnabPAT, useCreditCards } from '@/hooks/useLocalStorage';
import { YnabClient } from '@/lib/ynab-client';

export default function DashboardPage() {
  const { pat } = useYnabPAT();
  const { cards } = useCreditCards();
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (pat) {
      loadBudgets();
    }
  }, [pat]);

  async function loadBudgets() {
    setLoading(true);
    setError('');
    try {
      const client = new YnabClient(pat!);
      const data = await client.getBudgets();
      setBudgets(data);
    } catch (err) {
      setError(`Failed to load budgets: ${err}`);
    } finally {
      setLoading(false);
    }
  }

  if (!pat) {
    return (
      <div style={{ maxWidth: 800, margin: '50px auto', padding: 20 }}>
        <h1>Dashboard</h1>
        <p>Please configure your YNAB Personal Access Token first.</p>
        <Link href="/settings" style={{ 
          padding: '12px 24px', 
          backgroundColor: '#007bff', 
          color: 'white', 
          textDecoration: 'none',
          borderRadius: 4,
          display: 'inline-block',
          marginTop: 20
        }}>
          Go to Settings
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '20px auto', padding: 20 }}>
      <h1>Dashboard</h1>

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
          <h3>Connected</h3>
          <p style={{ fontSize: '2em', margin: 0 }}>✅</p>
          <p>YNAB API Active</p>
        </div>
        
        <div style={{ 
          padding: 20, 
          border: '1px solid #ddd', 
          borderRadius: 8,
          backgroundColor: '#f8f9fa'
        }}>
          <h3>Credit Cards</h3>
          <p style={{ fontSize: '2em', margin: 0 }}>{cards.length}</p>
          <Link href="/settings">Manage Cards</Link>
        </div>

        <div style={{ 
          padding: 20, 
          border: '1px solid #ddd', 
          borderRadius: 8,
          backgroundColor: '#f8f9fa'
        }}>
          <h3>Budgets</h3>
          <p style={{ fontSize: '2em', margin: 0 }}>{budgets.length}</p>
          <p>Available in YNAB</p>
        </div>
      </div>

      {/* Budgets List */}
      <section style={{ marginBottom: 40 }}>
        <h2>Your YNAB Budgets</h2>
        {loading && <p>Loading budgets...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {!loading && !error && budgets.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {budgets.map((budget) => (
              <li key={budget.id} style={{ 
                padding: 15, 
                marginBottom: 10, 
                border: '1px solid #ddd',
                borderRadius: 4 
              }}>
                <strong>{budget.name}</strong>
                <span style={{ marginLeft: 20, color: '#666' }}>
                  Last modified: {new Date(budget.last_modified_on).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cards Overview */}
      <section style={{ marginBottom: 40 }}>
        <h2>Your Credit Cards</h2>
        {cards.length === 0 ? (
          <div>
            <p>No credit cards configured yet.</p>
            <Link href="/settings" style={{ color: 'blue' }}>
              Add your first card
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
                backgroundColor: '#fff'
              }}>
                <h3>{card.name}</h3>
                <p>{card.issuer}</p>
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
      <section style={{ 
        padding: 30, 
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        textAlign: 'center'
      }}>
        <h2>🚧 Rewards Calculation Coming Soon</h2>
        <p>We're working on calculating your rewards based on your YNAB transactions and card rules.</p>
        <p>Configure your cards and rules in Settings to get ready!</p>
      </section>
    </div>
  );
}