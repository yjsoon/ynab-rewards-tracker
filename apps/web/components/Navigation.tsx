'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navigation() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  const getLinkStyle = (path: string) => ({
    textDecoration: 'none',
    color: isActive(path) ? '#007bff' : '#666',
    fontWeight: isActive(path) ? 600 : 400,
    padding: '8px 12px',
    borderRadius: 4,
    backgroundColor: isActive(path) ? '#e7f3ff' : 'transparent',
    transition: 'all 0.2s ease',
  });

  const navLinks = [
    { href: '/', label: 'Dashboard' },
    { href: '/settings', label: 'Settings' },
  ];

  return (
    <nav style={{
      borderBottom: '1px solid #e0e0e0',
      backgroundColor: '#f8f9fa',
      padding: '0 20px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 60,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          <Link href="/" style={{
            fontSize: '1.2rem',
            fontWeight: 'bold',
            textDecoration: 'none',
            color: '#333',
          }}>
            YNAB Rewards
          </Link>
          
          <div style={{ display: 'flex', gap: 20 }}>
            {navLinks.map((link) => (
              <Link 
                key={link.href}
                href={link.href} 
                style={getLinkStyle(link.href)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}