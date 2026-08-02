import { useCallback, useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Card, SectionHeader } from '@/components/ios';
import {
  LargeNavigationTitle,
  SyncBadge,
} from '@/components/native';
import { useStorage } from '@/contexts/StorageContext';
import { SettingsFooter, SettingsRow } from '@/features/preferences/SettingsRow';
import { semanticColors, spacing } from '@/theme';
import { getEarliestPeriodStart } from '@ynab-counter/app-core/rewards-engine/utils/periods';
import { createDefaultStorage } from '@ynab-counter/app-core/storage';

const DEFAULT_CURRENCY = createDefaultStorage().settings.currency ?? '';

function relativeTime(value?: string): string {
  if (!value) return 'Never';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Unknown';
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function appearanceLabel(theme?: 'light' | 'dark' | 'auto'): string {
  if (theme === 'light') return 'Light';
  if (theme === 'dark') return 'Dark';
  return 'Automatic';
}

export default function PreferencesScreen() {
  const router = useRouter();
  const { state, status, actions } = useStorage();
  const connected = state.connectionStatus === 'connected';
  const cloudConfigured = Boolean(state.settings.cloudSyncKeyId);
  const lastYnabSync = state.metadata.lastSuccessfulSync;

  const ynabSyncState = useMemo(() => {
    if (state.isSyncing || status.isRefreshing) return 'syncing' as const;
    if (state.connectionError || status.refreshError) return 'attention' as const;
    return connected ? 'synced' as const : 'offline' as const;
  }, [connected, state.connectionError, state.isSyncing, status.isRefreshing, status.refreshError]);

  const refreshYnab = useCallback(async () => {
    if (!connected || state.isSyncing || status.isRefreshing) {
      return;
    }

    try {
      await actions.syncBudgetsAndAccounts({
        sinceDate: getEarliestPeriodStart(state.cards),
      });
    } catch {
      // StorageContext exposes the recoverable failure through the sync badge.
    }
  }, [
    actions,
    connected,
    state.cards,
    state.isSyncing,
    status.isRefreshing,
  ]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustsScrollIndicatorInsets
    >
      <LargeNavigationTitle>Settings</LargeNavigationTitle>

      <View>
        <SectionHeader>YNAB</SectionHeader>
        <Card>
          <SettingsRow
            isFirst
            title={connected ? state.selectedBudget.name ?? 'YNAB' : 'Connection needed'}
            subtitle={connected
              ? `${state.trackedAccountIds.length} card account${state.trackedAccountIds.length === 1 ? '' : 's'}`
              : 'Connect a Personal Access Token and choose card accounts.'}
            symbol={connected ? undefined : 'exclamationmark.triangle.fill'}
            symbolColor={semanticColors.attention}
          />
          {ynabSyncState !== 'synced' ? (
            <SettingsRow
              title="Last YNAB refresh"
              subtitle={`Updated ${relativeTime(lastYnabSync).toLowerCase()}`}
              symbol="arrow.triangle.2.circlepath"
              trailingIsInteractive
              trailing={(
                <SyncBadge
                  state={ynabSyncState}
                  onPress={connected
                    ? () => void refreshYnab()
                    : () => router.push('/settings')}
                  accessibilityHint={connected
                    ? 'Refreshes cards and transactions from YNAB'
                    : 'Opens YNAB connection settings'}
                />
              )}
            />
          ) : null}
          <SettingsRow
            title="Manage connection"
            subtitle="Budget, token and tracked accounts"
            symbol="link"
            onPress={() => router.push('/settings')}
          />
        </Card>
        <SettingsFooter>Your YNAB token stays in the iOS Keychain and is never included in backups.</SettingsFooter>
      </View>

      <View>
        <SectionHeader>SYNC</SectionHeader>
        <Card>
          <SettingsRow
            isFirst
            title="Cloud Sync"
            subtitle={cloudConfigured
              ? `Encrypted backup · ${relativeTime(state.settings.cloudSyncLastSyncedAt)}`
              : 'Use the same 12-word code as the web app'}
            value={cloudConfigured ? 'On' : 'Off'}
            symbol="icloud.fill"
            onPress={() => router.push('/(tabs)/preferences/cloud-sync')}
          />
        </Card>
      </View>

      <View>
        <SectionHeader>PREFERENCES</SectionHeader>
        <Card>
          <SettingsRow
            isFirst
            title="Display & value"
            subtitle={`${state.settings.currency ?? DEFAULT_CURRENCY} · ${appearanceLabel(state.settings.theme)}`}
            symbol="slider.horizontal.3"
            onPress={() => router.push('/(tabs)/preferences/general')}
          />
          <SettingsRow
            title="Data & privacy"
            subtitle="Export, import and reset"
            symbol="lock.doc.fill"
            onPress={() => router.push('/(tabs)/preferences/data')}
          />
        </Card>
      </View>

      <View>
        <SectionHeader>ABOUT</SectionHeader>
        <Card>
          <SettingsRow
            isFirst
            title="Rewards Tracker on the web"
            value="rewards.soon.sg"
            symbol="safari.fill"
            onPress={() => void Linking.openURL('https://rewards.soon.sg')}
          />
          <SettingsRow
            title="Version"
            value="0.1.0"
            symbol="info.circle.fill"
          />
        </Card>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 48,
    gap: spacing.xxl,
  },
});
