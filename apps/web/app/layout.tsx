import { Providers } from './providers';
import { Navigation } from '@/components/Navigation';

export const metadata = {
  title: 'YNAB Counter',
  description: 'Track credit card rewards using your YNAB data.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0 }}>
        <Providers>
          <Navigation />
          <div style={{ padding: 24 }}>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
