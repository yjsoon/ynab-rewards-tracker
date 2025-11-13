import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

export default function TabsLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf="house.fill" />
        <Label>YJAB</Label>
      </NativeTabs.Trigger>
      {/* Recommendations tab temporarily hidden - not ready for production */}
      {/* <NativeTabs.Trigger name="recommendations">
        <Icon sf="lightbulb.fill" />
        <Label>Tips</Label>
      </NativeTabs.Trigger> */}
      <NativeTabs.Trigger name="transactions">
        <Icon sf="chart.line.uptrend.xyaxis" />
        <Label>Activity</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
