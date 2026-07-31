import { Redirect } from 'expo-router';

import { useStorage } from '@/contexts/StorageContext';

export default function Index() {
  const { state } = useStorage();
  const isSetupComplete = Boolean(
    state.pat && state.selectedBudget.id && state.trackedAccountIds.length > 0,
  );

  return <Redirect href={isSetupComplete ? '/(tabs)/overview' : '/settings'} />;
}
