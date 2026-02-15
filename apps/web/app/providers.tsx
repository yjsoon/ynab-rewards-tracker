'use client';

import { StorageProvider } from '@/contexts/StorageContext';
import { useAutoSync } from '@/hooks/useAutoSync';

function AutoSyncBootstrap() {
  useAutoSync();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StorageProvider>
      <AutoSyncBootstrap />
      {children}
    </StorageProvider>
  );
}
