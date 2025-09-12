import { Providers } from './providers';
import { Navigation } from '@/components/Navigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './globals.css';

export const metadata = {
  title: 'YNAB Counter',
  description: 'Track credit card rewards using your YNAB data.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <Providers>
            <Navigation />
            <main>
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </main>
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
