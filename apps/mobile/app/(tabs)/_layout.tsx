import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { semanticColors } from '@/theme';
import { featureFlags } from '@ynab-counter/app-core/config/featureFlags';

export default function TabsLayout() {
  const supportsTabMinimisation = Platform.OS === 'ios' && Number(Platform.Version) >= 26;
  const triggers = [
    <NativeTabs.Trigger key="overview" name="overview">
      <Icon
        sf={{ default: 'rectangle.grid.1x2', selected: 'rectangle.grid.1x2.fill' }}
        androidSrc={require('../../assets/tabs/overview.png')}
      />
      <Label>Overview</Label>
    </NativeTabs.Trigger>,
    <NativeTabs.Trigger key="cards" name="cards">
      <Icon
        sf={{ default: 'creditcard', selected: 'creditcard.fill' }}
        androidSrc={require('../../assets/tabs/cards.png')}
      />
      <Label>Cards</Label>
    </NativeTabs.Trigger>,
    <NativeTabs.Trigger key="activity" name="activity">
      <Icon
        sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }}
        androidSrc={require('../../assets/tabs/activity.png')}
      />
      <Label>Activity</Label>
    </NativeTabs.Trigger>,
    ...(featureFlags.recommendations ? [
      <NativeTabs.Trigger key="recommendations" name="recommendations">
        <Icon
          sf={{ default: 'lightbulb', selected: 'lightbulb.fill' }}
          androidSrc={require('../../assets/tabs/tips.png')}
        />
        <Label>Tips</Label>
      </NativeTabs.Trigger>,
    ] : []),
    <NativeTabs.Trigger key="preferences" name="preferences">
      <Icon
        sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
        androidSrc={require('../../assets/tabs/settings.png')}
      />
      <Label>Settings</Label>
    </NativeTabs.Trigger>,
  ];

  return (
    <NativeTabs
      tintColor={semanticColors.action}
      minimizeBehavior={supportsTabMinimisation ? 'onScrollDown' : undefined}
    >
      {triggers}
    </NativeTabs>
  );
}
