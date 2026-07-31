import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

import { Card, SectionHeader } from '@/components/ios';
import { StatusPill } from '@/components/native';
import { useStorage } from '@/contexts/StorageContext';
import { SettingsFooter, SettingsRow } from '@/features/preferences/SettingsRow';
import { forgetCloudSyncCode } from '@/lib/cloud-sync';
import { storage } from '@/storage/service';
import { semanticColors, spacing } from '@/theme';
import { createCloudSyncPayload, parseCloudSyncPayload } from '@ynab-counter/app-core/cloud-sync';
import type { StorageData } from '@ynab-counter/app-core/storage';

export default function DataPreferencesScreen() {
  const router = useRouter();
  const { actions } = useStorage();
  const [message, setMessage] = useState<string>();

  const exportData = async () => {
    try {
      const raw = JSON.parse(await storage.exportSettings()) as StorageData;
      const payload = createCloudSyncPayload(raw);
      await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
      setMessage('Settings copied to the clipboard');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Couldn’t export settings');
    }
  };

  const importData = async () => {
    try {
      const clipboard = await Clipboard.getStringAsync();
      const payload = parseCloudSyncPayload(JSON.parse(clipboard));
      Alert.alert(
        'Replace local settings?',
        `This will replace card configuration with ${payload.cards.length} card${payload.cards.length === 1 ? '' : 's'}. Your YNAB token will stay on this iPhone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: () => {
              void (async () => {
                await storage.importSettings(JSON.stringify(payload));
                await actions.refresh();
                setMessage('Settings imported');
              })().catch((error: unknown) => {
                setMessage(error instanceof Error ? error.message : 'Couldn’t import settings');
              });
            },
          },
        ],
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The clipboard does not contain valid settings');
    }
  };

  const clearAll = () => {
    Alert.alert(
      'Erase Rewards Tracker data?',
      'Cards, cached transactions, preferences, the YNAB token and the remembered Cloud Sync code will be removed from this iPhone. Cloud backups are not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase This iPhone',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await Promise.all([storage.clearAll(), forgetCloudSyncCode()]);
              await actions.refresh();
              router.replace('/');
            })().catch((error: unknown) => {
              setMessage(error instanceof Error ? error.message : 'Couldn’t erase local data');
            });
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View>
        <SectionHeader>PORTABLE SETTINGS</SectionHeader>
        <Card>
          <SettingsRow
            isFirst
            title="Copy settings export"
            subtitle="Cards, rules, mappings and preferences"
            symbol="doc.on.doc.fill"
            onPress={() => void exportData()}
          />
          <SettingsRow
            title="Import from clipboard"
            subtitle="Accepts exports from web or iOS"
            symbol="square.and.arrow.down.fill"
            onPress={() => void importData()}
          />
        </Card>
        <SettingsFooter>Exports never contain your YNAB token, transaction history, cached calculations, recovery phrase or formatter API keys.</SettingsFooter>
      </View>

      <View>
        <SectionHeader>ON THIS IPHONE</SectionHeader>
        <Card>
          <SettingsRow
            isFirst
            title="Erase all local data"
            subtitle="Return the app to first-run setup"
            symbol="trash.fill"
            symbolColor={semanticColors.destructive}
            destructive
            onPress={clearAll}
          />
        </Card>
      </View>

      {message ? (
        <StatusPill
          label={message}
          tone={message.includes('Couldn’t') || message.includes('Invalid') ? 'attention' : 'positive'}
          style={styles.message}
        />
      ) : null}
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
  message: {
    alignSelf: 'center',
  },
});
