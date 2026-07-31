import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import {
  nativeStackScreenOptions,
  usesIOS26LargeTitleFallback,
} from '@/theme';

export default function CardsLayout() {
  const isDark = useColorScheme() === 'dark';

  return (
    <Stack screenOptions={nativeStackScreenOptions(isDark)}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Cards',
          headerLargeTitle: !usesIOS26LargeTitleFallback,
          headerShown: !usesIOS26LargeTitleFallback,
        }}
      />
    </Stack>
  );
}
