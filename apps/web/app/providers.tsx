'use client';

import { StorageProvider } from '@/contexts/StorageContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return <StorageProvider>{children}</StorageProvider>;
}