import { Stack } from 'expo-router';
import { Platform, useColorScheme } from 'react-native';

import {
  nativeStackScreenOptions,
  usesIOS26LargeTitleFallback,
} from '@/theme';

export default function OverviewLayout() {
  const systemScheme = useColorScheme();
  const isDark = Platform.OS !== 'android' && systemScheme === 'dark';

  return (
    <Stack screenOptions={nativeStackScreenOptions(isDark)}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Overview',
          headerLargeTitle: !usesIOS26LargeTitleFallback,
          headerShown: !usesIOS26LargeTitleFallback,
        }}
      />
      <Stack.Screen
        name="categories"
        options={{
          title: usesIOS26LargeTitleFallback ? '' : 'Reward categories',
          headerLargeTitle: !usesIOS26LargeTitleFallback,
        }}
      />
      <Stack.Screen
        name="period"
        options={{
          title: 'Dashboard period',
          presentation: 'formSheet',
        }}
      />
    </Stack>
  );
}
