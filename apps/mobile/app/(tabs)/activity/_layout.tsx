import { Stack } from 'expo-router';
import { Platform, useColorScheme } from 'react-native';

import { nativeStackScreenOptions } from '@/theme';

export default function ActivityLayout() {
  const systemScheme = useColorScheme();
  const isDark = Platform.OS !== 'android' && systemScheme === 'dark';

  return (
    <Stack screenOptions={nativeStackScreenOptions(isDark)}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Activity',
          headerShown: false,
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
