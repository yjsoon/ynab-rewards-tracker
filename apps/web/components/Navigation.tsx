'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Home, Settings, CreditCard, SlidersHorizontal, Sparkles, ReceiptText, Menu, X, ScanText } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

// Navigation height constant - used for nav bar and mobile menu positioning
const NAV_HEIGHT_CLASS = 'h-14'; // 56px

export function Navigation() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: '/', label: 'Dashboard', icon: Home },
    { href: '/recommendations', label: 'Recommendations', icon: Sparkles },
    { href: '/rules', label: 'Rules', icon: SlidersHorizontal },
    { href: '/transactions', label: 'Transactions', icon: ReceiptText },
    { href: '/formatter', label: 'Formatter', icon: ScanText },
  ];

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
              <span>YJAB</span>
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
              <div className="flex flex-col p-4 gap-2">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = pathname === link.href;
                  return (
                    <Button
                      key={link.href}
                      variant={isActive ? "secondary" : "outline"}
                      size="lg"
                      asChild
                      className={cn(
                        "justify-start gap-3 w-full",
                        isActive && "bg-secondary"
                      )}
                      onClick={closeMobileMenu}
                    >
                      <Link href={link.href}>
                        <Icon className="h-5 w-5" />
                        <span className="text-base">{link.label}</span>
                      </Link>
                    </Button>
                  );
                })}

                <div className="border-t my-2" />

                <Button
                  variant={isSettings ? 'secondary' : 'outline'}
                  size="lg"
                  asChild
                  className={cn(
                    "justify-start gap-3 w-full",
                    isSettings && 'bg-secondary'
                  )}
                  onClick={closeMobileMenu}
                >
                  <Link href="/settings">
                    <Settings className="h-5 w-5" />
                    <span className="text-base">Settings</span>
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
