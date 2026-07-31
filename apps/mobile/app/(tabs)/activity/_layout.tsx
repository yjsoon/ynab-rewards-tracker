import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import {
  nativeStackScreenOptions,
  usesIOS26LargeTitleFallback,
} from '@/theme';

export default function ActivityLayout() {
  const isDark = useColorScheme() === 'dark';

  return (
    <Stack screenOptions={nativeStackScreenOptions(isDark)}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Activity',
          headerLargeTitle: !usesIOS26LargeTitleFallback,
          headerShown: !usesIOS26LargeTitleFallback,
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: 'Transaction',
          headerLargeTitle: false,
        }}
      />
    </Stack>
  );
}
