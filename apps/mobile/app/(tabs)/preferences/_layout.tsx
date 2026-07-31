import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import {
  nativeStackScreenOptions,
  usesIOS26LargeTitleFallback,
} from '@/theme';

export default function PreferencesLayout() {
  const isDark = useColorScheme() === 'dark';

  return (
    <Stack screenOptions={nativeStackScreenOptions(isDark)}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Settings',
          headerLargeTitle: !usesIOS26LargeTitleFallback,
          headerShown: !usesIOS26LargeTitleFallback,
        }}
      />
      <Stack.Screen
        name="general"
        options={{ title: 'Display & value', headerLargeTitle: false }}
      />
      <Stack.Screen
        name="cloud-sync"
        options={{ title: 'Cloud Sync', headerLargeTitle: false }}
      />
      <Stack.Screen
        name="data"
        options={{ title: 'Data & privacy', headerLargeTitle: false }}
      />
    </Stack>
  );
}
