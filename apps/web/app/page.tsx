import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 800, margin: '50px auto', padding: 20 }}>
      <h1>YNAB Rewards Tracker</h1>
      <p>Track credit card rewards and maximize cashback using your YNAB data.</p>
      
      <div style={{ marginTop: 40 }}>
        <h2>Features</h2>
        <ul>
          <li>🔒 100% Private - All data stays in your browser</li>
          <li>💳 Track multiple credit cards and reward rules</li>
          <li>📊 Calculate rewards and track spending caps</li>
          <li>🔄 Sync directly with YNAB using your Personal Access Token</li>
          <li>💾 Export/import your settings for backup</li>
        </ul>
      </div>

      <div style={{ marginTop: 40 }}>
        <h2>Get Started</h2>
        <ol>
          <li>Get your YNAB Personal Access Token from your <a href="https://app.ynab.com/settings/developer" target="_blank" rel="noopener noreferrer">YNAB Account Settings</a></li>
          <li>Go to <Link href="/settings" style={{ color: 'blue' }}>Settings</Link> and paste your token</li>
          <li>Define your credit cards and reward rules</li>
          <li>Sync your data and view your rewards dashboard</li>
        </ol>
      </div>

      <div style={{ marginTop: 40, display: 'flex', gap: 20 }}>
        <Link href="/settings" style={{ 
          padding: '12px 24px', 
          backgroundColor: '#007bff', 
          color: 'white', 
          textDecoration: 'none',
          borderRadius: 4,
          display: 'inline-block'
        }}>
          Open Settings
        </Link>
        <Link href="/dashboard" style={{ 
          padding: '12px 24px', 
          backgroundColor: '#28a745', 
          color: 'white', 
          textDecoration: 'none',
          borderRadius: 4,
          display: 'inline-block'
        }}>
          View Dashboard
        </Link>
      </div>
    </main>
  );
}