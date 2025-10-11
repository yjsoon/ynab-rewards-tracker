import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';

/**
 * iOS haptic feedback hook
 * Provides typed wrappers for Expo's haptic feedback API
 */
export function useHaptics() {
  const selection = useCallback(() => {
    Haptics.selectionAsync().catch(() => {
      // Silently fail if haptics not available
    });
  }, []);

  const impact = useCallback((style: 'light' | 'medium' | 'heavy' = 'medium') => {
    const styleMap = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    };

    Haptics.impactAsync(styleMap[style]).catch(() => {
      // Silently fail if haptics not available
    });
  }, []);

  const notification = useCallback((type: 'success' | 'warning' | 'error') => {
    const typeMap = {
      success: Haptics.NotificationFeedbackType.Success,
      warning: Haptics.NotificationFeedbackType.Warning,
      error: Haptics.NotificationFeedbackType.Error,
    };

    Haptics.notificationAsync(typeMap[type]).catch(() => {
      // Silently fail if haptics not available
    });
  }, []);

  return {
    selection,
    impact,
    notification,
  };
}