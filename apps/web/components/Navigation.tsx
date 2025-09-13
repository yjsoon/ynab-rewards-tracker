'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Home, Settings, CreditCard } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

export function Navigation() {
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Dashboard', icon: Home },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="border-b bg-gradient-to-r from-primary/5 via-background to-primary/3 backdrop-blur-md sticky top-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex h-14 items-center justify-between">
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

          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>

          {/* Mobile navigation */}
          <div className="flex md:hidden items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Button
                  key={link.href}
                  variant={isActive ? "secondary" : "ghost"}
                  size="icon"
                  asChild
                  className={cn(
                    isActive && "bg-secondary"
                  )}
                >
                  <Link href={link.href}>
                    <Icon className="h-4 w-4" />
                    <span className="sr-only">{link.label}</span>
                  </Link>
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
