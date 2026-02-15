'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Home, Settings, CreditCard, Sparkles, ReceiptText, Menu, X, ScanText } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';
import { featureFlags } from '@ynab-counter/app-core/config/featureFlags';

// Navigation height constant - used for nav bar and mobile menu positioning
const NAV_HEIGHT_CLASS = 'h-14'; // 56px

export function Navigation() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: '/', label: 'Dashboard', icon: Home },
    ...(featureFlags.recommendations ? [{ href: '/recommendations', label: 'Recommendations', icon: Sparkles }] : []),
    { href: '/formatter', label: 'Formatter', icon: ScanText },
    { href: '/transactions', label: 'Transactions', icon: ReceiptText },
    { href: '/agent-api', label: 'Agent API', icon: Sparkles },
  ];
  const mobileLinks = [...navLinks, { href: '/settings', label: 'Settings', icon: Settings }];

  const isSettings = pathname.startsWith('/settings');

  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Close mobile menu on Escape key press for keyboard accessibility
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && mobileMenuOpen) {
        closeMobileMenu();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [mobileMenuOpen]);

  return (
    <nav className="border-b bg-gradient-to-r from-primary/5 via-background to-primary/3 backdrop-blur-md sticky top-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-6">
        <div className={cn("flex items-center justify-between", NAV_HEIGHT_CLASS)}>
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center space-x-2 font-bold text-lg">
              <CreditCard className="h-6 w-6" />
              <span>Rewards Tracker</span>
            </Link>
            
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Button
                    key={link.href}
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    asChild
                    className={cn(
                      "gap-2",
                      isActive && "bg-secondary"
                    )}
                  >
                    <Link href={link.href}>
                      <Icon className="h-4 w-4" />
                      {link.label}
                    </Link>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant={isSettings ? 'secondary' : 'ghost'}
              size="icon"
              asChild
              className={cn(isSettings && 'bg-secondary')}
            >
              <Link
                href="/settings"
                aria-label="Open settings"
                aria-current={isSettings ? 'page' : undefined}
              >
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile slide-out menu */}
        {mobileMenuOpen && (
          <div
            className="md:hidden fixed inset-0 top-14 bg-black/20 backdrop-blur-sm z-40" // top-14 matches NAV_HEIGHT_CLASS (56px)
            onClick={closeMobileMenu}
          >
            <div
              className="absolute right-0 top-0 h-full w-64 bg-background border-l shadow-xl animate-in slide-in-from-right duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4">
                <div className="overflow-hidden rounded-xl border bg-card/95">
                  {mobileLinks.map((link, index) => {
                    const Icon = link.icon;
                    const isActive = pathname === link.href;
                    const isLast = index === mobileLinks.length - 1;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                          "flex w-full items-center gap-3 px-5 py-4 text-base transition-colors",
                          !isLast && "border-b",
                          isActive ? "bg-secondary text-secondary-foreground" : "hover:bg-muted/50"
                        )}
                        onClick={closeMobileMenu}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{link.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
