import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import {
  ActivityIndicator,
  Appearance,
  Platform,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { TamaguiProvider, Theme } from 'tamagui';

import { StorageProvider, useStorage } from '@/contexts/StorageContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { useCloudAutoSync } from '@/hooks/useCloudAutoSync';
import { nativeStackScreenOptions, semanticColors } from '@/theme';
import config from '../tamagui.config';

SplashScreen.preventAutoHideAsync().catch(() => {
  // A fast refresh can race with an already-hidden splash screen.
});

function AppShell() {
  const { status, state } = useStorage();
  useCloudAutoSync();
  const systemScheme = useColorScheme();
  const preference = state.settings.theme ?? 'auto';
  const activeScheme = Platform.OS === 'android'
    ? 'light'
    : preference === 'auto' ? systemScheme ?? 'light' : preference;

  useEffect(() => {
    Appearance.setColorScheme(
      Platform.OS === 'android' ? 'light' : preference === 'auto' ? null : preference,
    );
  }, [preference]);

  useEffect(() => {
    if (status.isHydrated || status.error) {
      SplashScreen.hideAsync().catch(() => {
        // Nothing to do if the native splash has already been hidden.
      });
    }
  }, [status.error, status.isHydrated]);

  if (status.error) {
    return (
      <View style={styles.centered} accessibilityRole="alert">
        <Text style={styles.errorTitle}>Rewards Tracker couldn’t start</Text>
        <Text style={styles.errorMessage}>{status.error.message}</Text>
      </View>
    );
  }

  if (!status.isHydrated) {
    return (
      <View style={styles.centered} accessibilityLabel="Loading Rewards Tracker">
        <ActivityIndicator size="large" color={semanticColors.action} />
      </View>
    );
  }

  return (
    <Theme name={activeScheme}>
      <ThemeProvider value={activeScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack
          initialRouteName="index"
          screenOptions={{
            ...nativeStackScreenOptions(activeScheme === 'dark'),
            contentStyle: { backgroundColor: semanticColors.systemGroupedBackground },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="settings"
            options={{
              presentation: 'modal',
              headerShown: true,
              title: 'YNAB connection',
            }}
          />
          <Stack.Screen name="card/[id]/index" options={{ headerShown: true, title: 'Card' }} />
          <Stack.Screen
            name="card/[id]/edit"
            options={{ headerShown: true, title: 'Edit card', presentation: 'formSheet' }}
          />
        </Stack>
      </ThemeProvider>
      <StatusBar style={activeScheme === 'dark' ? 'light' : 'dark'} />
    </Theme>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <TamaguiProvider config={config}>
          <StorageProvider>
            <ToastProvider>
              <AppShell />
            </ToastProvider>
          </StorageProvider>
        </TamaguiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28,
    backgroundColor: semanticColors.systemBackground,
  },
  errorTitle: {
    color: semanticColors.label,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorMessage: {
    color: semanticColors.secondaryLabel,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
});
