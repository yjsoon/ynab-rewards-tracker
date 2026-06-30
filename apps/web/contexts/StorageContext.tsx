'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface StorageContextType {
  refreshTrigger: number;
  triggerRefresh: () => void;
}

const StorageContext = createContext<StorageContextType | undefined>(undefined);

export function StorageProvider({ children }: { children: ReactNode }) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Keep the context value identity stable across provider re-renders so
  // consumers only re-render when refreshTrigger actually changes. triggerRefresh
  // is already stable (useCallback []); it stays in the deps to satisfy
  // exhaustive-deps and guard against future additions to the value.
  const value = useMemo(
    () => ({ refreshTrigger, triggerRefresh }),
    [refreshTrigger, triggerRefresh]
  );

  return (
    <StorageContext.Provider value={value}>
      {children}
    </StorageContext.Provider>
  );
}

export function useStorageContext() {
  const context = useContext(StorageContext);
  if (!context) {
    // Return a default that works without provider
    return { refreshTrigger: 0, triggerRefresh: () => {} };
  }
  return context;
}