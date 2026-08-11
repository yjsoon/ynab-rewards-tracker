import { useSyncExternalStore } from 'react';
import { formatDateValue, resolveDashboardPeriod } from '@/lib/dashboard-period';

/**
 * Session-scoped dashboard period. The web app keeps this in the URL; on
 * mobile a tiny external store keeps the overview and its period sheet in
 * sync without polluting storage or cloud-sync payloads.
 */
let currentDateValue: string | undefined;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getDashboardPeriodValue(): string | undefined {
  return currentDateValue;
}

export function setDashboardPeriodValue(dateValue: string | undefined) {
  const next = dateValue ?? undefined;
  if (next === currentDateValue) {
    return;
  }
  currentDateValue = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDashboardPeriod(now = new Date()) {
  const dateValue = useSyncExternalStore(subscribe, getDashboardPeriodValue, getDashboardPeriodValue);
  return resolveDashboardPeriod(dateValue, now);
}

export function todayDateValue(now = new Date()): string {
  return formatDateValue(now);
}
