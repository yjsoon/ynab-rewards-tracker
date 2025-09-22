'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useCallback } from 'react';

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

  return (
    <StorageContext.Provider value={{ refreshTrigger, triggerRefresh }}>
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