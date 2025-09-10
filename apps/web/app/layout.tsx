import { Providers } from './providers';

export const metadata = {
  title: 'YNAB Counter',
  description: 'Track credit card rewards using your YNAB data.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 24 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

