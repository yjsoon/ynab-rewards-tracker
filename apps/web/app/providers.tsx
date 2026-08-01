'use client';

import { StorageProvider } from '@/contexts/StorageContext';
import { CloudSyncConflictBanner } from '@/components/CloudSyncConflictBanner';
import { useAutoSync } from '@/hooks/useAutoSync';

function AutoSyncBootstrap() {
  useAutoSync();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StorageProvider>
      <AutoSyncBootstrap />
      <CloudSyncConflictBanner />
      {children}
    </StorageProvider>
  );
}
