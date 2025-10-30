import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, Animated, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHaptics } from '@/hooks/useHaptics';
import { semanticColors } from '@/theme/semanticColors';
import { Body } from '@/components/ios';

type ToastVariant = 'success' | 'warning' | 'error';

type ToastMessage = {
  id: string;
  variant: ToastVariant;
  message: string;
};

type ToastContextValue = {
  show: (options: { variant: ToastVariant; message: string }) => void;
};

const ToastContext = createContext<ToastContextValue>({
  show: () => {},
});

const AUTO_DISMISS_DELAY = 4000; // 4 seconds
const ANIMATION_DURATION = 300; // 300ms

/**
 * Toast Provider
 * 
 * Provides a toast notification system that persists across navigation.
 * Toast messages appear at the top of the screen and auto-dismiss after 4 seconds,
 * with support for manual tap-to-dismiss.
 * 
 * Queue behavior: Latest-wins - if a new toast appears while one is visible,
 * it replaces the current toast immediately.
 * 
 * Usage:
 * ```tsx
 * const { show } = useToast();
 * 
 * // Show error toast
 * show({ variant: 'error', message: 'Failed to sync with YNAB' });
 * 
 * // Show success toast
 * show({ variant: 'success', message: 'Settings saved' });
 * 
 * // Show warning toast
 * show({ variant: 'warning', message: 'Connection is slow' });
 * ```
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [currentToast, setCurrentToast] = useState<ToastMessage | null>(null);
  const { notification } = useHaptics();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(-100)).current;
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: -100,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentToast(null);
    });

    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
  }, [fadeAnim, translateYAnim]);

  const showToast = useCallback(
    ({ variant, message }: { variant: ToastVariant; message: string }) => {
      // Cancel any pending dismiss
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
        dismissTimeoutRef.current = null;
      }

      // If replacing a visible toast, reset animation values to ensure slide animation runs
      const hasVisibleToast = currentToast !== null;
      if (hasVisibleToast) {
        fadeAnim.setValue(0);
        translateYAnim.setValue(-100);
      }

      // Trigger haptic feedback
      notification(variant);

      // Create new toast
      const toast: ToastMessage = {
        id: Date.now().toString(),
        variant,
        message,
      };

      setCurrentToast(toast);

      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnim, {
          toValue: 0,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss after delay
      dismissTimeoutRef.current = setTimeout(() => {
        dismissToast();
      }, AUTO_DISMISS_DELAY);
    },
    [fadeAnim, translateYAnim, dismissToast, notification, currentToast]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, []);

  const getVariantStyles = (variant: ToastVariant) => {
    switch (variant) {
      case 'error':
        return {
          backgroundColor: semanticColors.systemRed,
        };
      case 'warning':
        return {
          backgroundColor: semanticColors.systemOrange,
        };
      case 'success':
        return {
          backgroundColor: semanticColors.systemGreen,
        };
    }
  };

  return (
    <ToastContext.Provider value={{ show: showToast }}>
      {children}
      {currentToast && (
        <SafeAreaView style={styles.safeArea} edges={['top']} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.container,
              {
                opacity: fadeAnim,
                transform: [{ translateY: translateYAnim }],
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={dismissToast}
              style={[
                styles.toast,
                { backgroundColor: getVariantStyles(currentToast.variant).backgroundColor },
              ]}
            >
              <View style={styles.content}>
                <Body style={styles.message}>{currentToast.message}</Body>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </SafeAreaView>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    pointerEvents: 'box-none',
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    pointerEvents: 'box-none',
  },
  toast: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  message: {
    color: semanticColors.primaryButtonForeground,
    fontWeight: '500',
    flex: 1,
    textAlign: 'center',
  },
});

