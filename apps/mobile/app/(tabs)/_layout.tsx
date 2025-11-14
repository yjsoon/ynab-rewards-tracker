import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { featureFlags } from '@ynab-counter/app-core/config/featureFlags';

export default function TabsLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf="house.fill" />
        <Label>YJAB</Label>
      </NativeTabs.Trigger>
      {featureFlags.recommendations && (
        <NativeTabs.Trigger name="recommendations">
          <Icon sf="lightbulb.fill" />
          <Label>Tips</Label>
        </NativeTabs.Trigger>
      )}
      <NativeTabs.Trigger name="transactions">
        <Icon sf="chart.line.uptrend.xyaxis" />
        <Label>Activity</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
