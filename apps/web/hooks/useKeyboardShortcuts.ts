import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Shortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  handler: () => void;
  description?: string;
}

/**
 * Hook for managing keyboard shortcuts in the application
 * @param shortcuts Array of keyboard shortcuts to register
 * @param enabled Whether shortcuts are enabled (default: true)
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      for (const shortcut of shortcuts) {
        const matchesKey = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const matchesCtrl = shortcut.ctrlKey ? event.ctrlKey : true;
        const matchesMeta = shortcut.metaKey ? event.metaKey : true;
        const matchesShift = shortcut.shiftKey ? event.shiftKey : true;
        const matchesAlt = shortcut.altKey ? event.altKey : true;

        if (matchesKey && matchesCtrl && matchesMeta && matchesShift && matchesAlt) {
          event.preventDefault();
          shortcut.handler();
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, enabled]);
}

/**
 * Common keyboard shortcuts for the application
 */
export function useGlobalKeyboardShortcuts() {
  const router = useRouter();

  const shortcuts: Shortcut[] = [
    {
      key: 'h',
      ctrlKey: true,
      handler: () => router.push('/'),
      description: 'Go to Dashboard',
    },
    {
      key: 's',
      ctrlKey: true,
      handler: () => router.push('/settings'),
      description: 'Go to Settings',
    },
    {
      key: '/',
      handler: () => {
        // Focus search if we implement it
        const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement;
        searchInput?.focus();
      },
      description: 'Focus search',
    },
    {
      key: 'Escape',
      handler: () => {
        // Close any open dialogs
        const closeButton = document.querySelector('[data-dialog-close]') as HTMLButtonElement;
        closeButton?.click();
      },
      description: 'Close dialog',
    },
  ];

  useKeyboardShortcuts(shortcuts);

  return shortcuts;
}