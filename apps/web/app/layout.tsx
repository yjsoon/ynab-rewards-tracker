import { Work_Sans, IBM_Plex_Mono } from "next/font/google";

import { Providers } from "./providers";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const workSans = Work_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans"
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-mono"
});

export const metadata = {
  title: "YJAB: YNAB Journal of Awards & Bonuses",
  description: "Track credit card rewards using your YNAB data."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${workSans.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange>
          <ErrorBoundary>
            <Providers>
              <div className="flex min-h-screen flex-col">
                <Navigation />
                <main className="flex-1 bg-muted dark:bg-background transition-colors">
                  <ErrorBoundary>{children}</ErrorBoundary>
                </main>
                <Footer />
              </div>
            </Providers>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
