export default function HomePage() {
  return (
    <main>
      <h1>YNAB Counter</h1>
      <p>Track credit card rewards using your YNAB data.</p>
      <ol>
        <li>Connect your YNAB account (OAuth, read-only).</li>
        <li>Define cards and reward rules.</li>
        <li>Run sync and view dashboards.</li>
      </ol>
      <p>
        <a href="/settings">Go to Settings</a> to paste a Personal Access Token.
      </p>
    </main>
  );
}
