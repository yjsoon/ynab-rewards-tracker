import { useEffect, useMemo } from 'react';
import { Stack } from 'expo-router';
import { TamaguiProvider, Theme } from 'tamagui';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StorageProvider, useStorage } from '@/contexts/StorageContext';
import { semanticColors } from '@/theme/semanticColors';
import config from '../tamagui.config';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Reloading the app might trigger an exception, so swallow silently.
});

function AppShell() {
  const { status, state } = useStorage();

  const isSetupComplete = useMemo(() =>
    !!state.pat &&
    !!state.selectedBudget.id &&
    state.trackedAccountIds.length > 0,
    [state.pat, state.selectedBudget.id, state.trackedAccountIds.length]
  );

  useEffect(() => {
    if (status.isHydrated) {
      SplashScreen.hideAsync().catch(() => {
        // Ignore hide errors
      });
    }
  }, [status.isHydrated]);

  if (status.error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{status.error.message}</Text>
      </View>
    );
  }

  if (!status.isHydrated) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!isSetupComplete) {
    return (
      <Theme name="dark">
        <Stack screenOptions={{ headerShown: true }}>
          <Stack.Screen
            name="settings"
            options={{
              presentation: 'modal',
              headerTitle: 'Settings',
              headerLargeTitle: false,
              headerBackVisible: false,
              gestureEnabled: false,
              headerStyle: { backgroundColor: semanticColors.systemBackground as string },
              headerTintColor: semanticColors.label as string,
              headerTitleStyle: { color: semanticColors.label as string },
            }}
          />
        </Stack>
        <StatusBar style="light" />
      </Theme>
    );
  }

  return (
    <Theme name="dark">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: true,
            headerLargeTitle: false,
            headerTitle: 'YJAB',
            title: 'YJAB',
            headerStyle: { backgroundColor: semanticColors.systemBackground as string },
            headerTintColor: semanticColors.label as string,
            headerTitleStyle: { color: semanticColors.label as string },
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: "Settings",
          }}
        />
      </Stack>
      <StatusBar style="light" />
    </Theme>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {
        // Ignore hide errors
      });
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <TamaguiProvider config={config}>
          <StorageProvider>
            <AppShell />
          </StorageProvider>
        </TamaguiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
