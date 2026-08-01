'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  CLOUD_SYNC_CONFLICT_EVENT,
  CLOUD_SYNC_CONFLICT_STORAGE_KEY,
  hasCloudSyncConflict,
} from '@/lib/cloud-sync/conflict-state';

export function CloudSyncConflictBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const refresh = () => setVisible(hasCloudSyncConflict());
    const onStorage = (event: StorageEvent) => {
      if (event.key === CLOUD_SYNC_CONFLICT_STORAGE_KEY) refresh();
    };
    refresh();
    window.addEventListener(CLOUD_SYNC_CONFLICT_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CLOUD_SYNC_CONFLICT_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50"
      role="status"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">Cloud Sync paused — choose which copy to keep.</span>
        <Link className="shrink-0 font-medium underline underline-offset-4" href="/settings#cloud-sync-heading">
          Save or Restore
        </Link>
      </div>
    </div>
  );
}
