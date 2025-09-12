import { Providers } from './providers';
import { Navigation } from '@/components/Navigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

export const metadata = {
  title: 'YNAB Counter',
  description: 'Track credit card rewards using your YNAB data.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            <Providers>
              <Navigation />
              <main className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
                <ErrorBoundary>
                  {children}
                </ErrorBoundary>
              </main>
            </Providers>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
