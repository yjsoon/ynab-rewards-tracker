import { Tabs } from 'expo-router';
import { Home, Lightbulb, Activity, Settings } from '@tamagui/lucide-icons';
import { useTheme } from 'tamagui';

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.background.val,
          borderTopColor: theme.backgroundHover.val,
        },
        tabBarActiveTintColor: theme.accent.val,
        tabBarInactiveTintColor: theme.colorHover.val,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="recommendations"
        options={{
          title: 'Recommendations',
          tabBarIcon: ({ color, size }) => <Lightbulb size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, size }) => <Activity size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}