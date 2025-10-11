import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Home, Lightbulb, Activity, Settings } from '@tamagui/lucide-icons';

export default function TabsLayout() {
  const handleTabPress = () => {
    Haptics.selectionAsync().catch(() => {
      // Silently fail if haptics not available
    });
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTransparent: false,
      }}
      screenListeners={{
        tabPress: handleTabPress,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Home size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="recommendations"
        options={{
          title: 'Recommendations',
          tabBarLabel: 'Ideas',
          tabBarIcon: ({ color }) => <Lightbulb size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color }) => <Activity size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Settings size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}