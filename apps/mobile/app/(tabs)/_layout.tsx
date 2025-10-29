import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Home, Lightbulb, Activity } from '@tamagui/lucide-icons';

export default function TabsLayout() {
  const handleTabPress = () => {
    Haptics.selectionAsync().catch(() => {
      // Silently fail if haptics not available
    });
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      screenListeners={{
        tabPress: handleTabPress,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'YJAB',
          tabBarIcon: ({ color }) => <Home size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="recommendations"
        options={{
          title: 'Ideas',
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
    </Tabs>
  );
}
