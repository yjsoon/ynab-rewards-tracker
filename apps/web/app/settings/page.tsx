"use client";

import { useEffect, useState } from 'react';

type Status = {
  connected: boolean;
  scope?: string;
  expiresAt?: string;
  updatedAt?: string;
};

export default function SettingsPage() {
  const [status, setStatus] = useState<Status>({ connected: false });
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadStatus() {
    setMessage(null);
    const res = await fetch('/api/auth/ynab/pat', { cache: 'no-store' });
    const json = await res.json();
    setStatus(json);
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function saveToken(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/ynab/pat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, verify: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json?.error ? `Error: ${json.error}` : 'Failed to save token');
      } else {
        setMessage('Token saved.');
        setToken('');
        await loadStatus();
      }
    } finally {
      setLoading(false);
    }
  }

  async function testSync() {
    setMessage(null);
    const res = await fetch('/api/sync/run', { method: 'POST' });
    const json = await res.json();
    if (json?.ok) setMessage(`Sync ok (${json.mode}). Budgets: ${json.budgets?.length ?? 0}`);
    else setMessage(`Sync failed: ${json?.error ?? 'unknown'}`);
  }

  return (
    <main style={{ maxWidth: 600 }}>
      <h1>Settings</h1>
      <section>
        <h2>YNAB Personal Access Token</h2>
        <p>Paste your YNAB Personal Access Token to connect without OAuth.</p>
        <form onSubmit={saveToken}>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="YNAB access token"
            style={{ width: '100%', padding: 8 }}
            aria-label="YNAB access token"
          />
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button type="submit" disabled={loading || token.trim().length < 20}>
              {loading ? 'Saving…' : 'Save Token'}
            </button>
            <button type="button" onClick={testSync}>Test Sync</button>
          </div>
        </form>
        {message && <p style={{ marginTop: 8 }}>{message}</p>}
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Connection Status</h3>
        <ul>
          <li>Connected: {String(status.connected)}</li>
          {status.scope && <li>Scope: {status.scope}</li>}
          {status.updatedAt && <li>Updated: {new Date(status.updatedAt).toLocaleString()}</li>}
        </ul>
      </section>
    </main>
  );
}

