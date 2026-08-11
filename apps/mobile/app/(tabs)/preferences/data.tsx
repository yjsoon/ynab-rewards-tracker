import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

import { Card, SectionHeader } from '@/components/ios';
import { StatusPill } from '@/components/native';
import { useStorage } from '@/contexts/StorageContext';
import { SettingsFooter, SettingsRow } from '@/features/preferences/SettingsRow';
import { storage } from '@/storage/service';
import { semanticColors, spacing } from '@/theme';
import { createCloudSyncPayload, parseCloudSyncPayload } from '@ynab-counter/app-core/cloud-sync';
import type { StorageData } from '@ynab-counter/app-core/storage';

type Message = { text: string; tone: 'positive' | 'attention' };

export default function DataPreferencesScreen() {
  const router = useRouter();
  const { state, actions } = useStorage();
  const [message, setMessage] = useState<Message>();

  const trackedIds = useMemo(
    () => new Set(state.trackedAccountIds),
    [state.trackedAccountIds],
  );
  const orphanedCards = useMemo(
    () => (state.trackedAccountIds.length > 0
      ? state.cards.filter((card) => !trackedIds.has(card.ynabAccountId))
      : []),
    [state.cards, state.trackedAccountIds.length, trackedIds],
  );

  const clearOrphans = () => {
    Alert.alert(
      'Remove orphaned cards?',
      `${orphanedCards.length} card${orphanedCards.length === 1 ? '' : 's'} reference${orphanedCards.length === 1 ? 's' : ''} YNAB ${orphanedCards.length === 1 ? 'account' : 'accounts'} that ${orphanedCards.length === 1 ? 'is' : 'are'} no longer tracked. Their reward settings will be removed, and tracking the account again creates a fresh card.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const kept = state.cards.filter((card) => trackedIds.has(card.ynabAccountId));
              await actions.setCards(kept);
              setMessage({
                text: `${orphanedCards.length} orphaned card${orphanedCards.length === 1 ? '' : 's'} removed`,
                tone: 'positive',
              });
            })().catch((error: unknown) => {
              setMessage({
                text: error instanceof Error ? error.message : 'Couldn’t remove orphaned cards',
                tone: 'attention',
              });
            });
          },
        },
      ],
    );
  };

  const exportData = async () => {
    try {
      const raw = JSON.parse(await storage.exportSettings()) as StorageData;
      const payload = createCloudSyncPayload(raw);
      await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
      setMessage({ text: 'Settings copied to the clipboard', tone: 'positive' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Couldn’t export settings',
        tone: 'attention',
      });
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
                const storageGeneration = actions.invalidatePendingOperations();
                await storage.updateSettings({
                  cloudSyncLocalChangedAt: new Date().toISOString(),
                }, storageGeneration);
                await storage.importSettings(JSON.stringify(payload), {
                  expectedGeneration: storageGeneration,
                });
                await actions.refresh(storageGeneration);
                setMessage({ text: 'Settings imported', tone: 'positive' });
              })().catch((error: unknown) => {
                setMessage({
                  text: error instanceof Error ? error.message : 'Couldn’t import settings',
                  tone: 'attention',
                });
              });
            },
          },
        ],
      );
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'The clipboard does not contain valid settings',
        tone: 'attention',
      });
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
              actions.invalidatePendingOperations();
              await storage.clearAll();
              await actions.refresh();
              router.replace('/');
            })().catch((error: unknown) => {
              setMessage({
                text: error instanceof Error ? error.message : 'Couldn’t erase local data',
                tone: 'attention',
              });
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
          {orphanedCards.length > 0 ? (
            <SettingsRow
              isFirst={orphanedCards.length > 0}
              title="Remove orphaned cards"
              subtitle={`${orphanedCards.length} card${orphanedCards.length === 1 ? '' : 's'} from ${orphanedCards.length === 1 ? 'an account' : 'accounts'} no longer tracked`}
              symbol="wand.and.stars"
              symbolColor={semanticColors.attention}
              destructive
              onPress={clearOrphans}
            />
          ) : null}
          <SettingsRow
            isFirst={orphanedCards.length === 0}
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
          label={message.text}
          tone={message.tone}
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
