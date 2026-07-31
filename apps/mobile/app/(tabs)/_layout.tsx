import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { semanticColors } from '@/theme';

export default function TabsLayout() {
  const supportsTabMinimisation = Platform.OS === 'ios' && Number(Platform.Version) >= 26;

  return (
    <NativeTabs
      tintColor={semanticColors.action}
      minimizeBehavior={supportsTabMinimisation ? 'onScrollDown' : undefined}
    >
      <NativeTabs.Trigger name="overview">
        <Icon sf={{ default: 'rectangle.grid.1x2', selected: 'rectangle.grid.1x2.fill' }} />
        <Label>Overview</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cards">
        <Icon sf={{ default: 'creditcard', selected: 'creditcard.fill' }} />
        <Label>Cards</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="activity">
        <Icon sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }} />
        <Label>Activity</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="preferences">
        <Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <Label>Settings</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
