import { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { Button, Card, Footnote, Headline, SectionHeader } from '@/components/ios';
import { StatusPill } from '@/components/native';
import { useStorage } from '@/contexts/StorageContext';
import { SettingsFooter, SettingsRow } from '@/features/preferences/SettingsRow';
import {
  deleteSettingsFromCloud,
  forgetCloudSyncCode,
  generateCloudSyncCode,
  loadRememberedCloudSyncCode,
  rememberCloudSyncCode,
  restoreSettingsFromCloud,
  saveSettingsToCloud,
} from '@/lib/cloud-sync';
import { storage } from '@/storage/service';
import { semanticColors, spacing } from '@/theme';
import {
  computeKeyId,
  createCloudSyncPayload,
  isValidMnemonic,
  normaliseMnemonic,
  parseCloudSyncPayload,
} from '@ynab-counter/app-core/cloud-sync';
import type { StorageData } from '@ynab-counter/app-core/storage';

type Operation = 'save' | 'restore' | 'delete' | undefined;
type Message = { text: string; tone: 'positive' | 'attention' };

export default function CloudSyncScreen() {
  const { state, actions } = useStorage();
  const [phrase, setPhrase] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [remember, setRemember] = useState(state.settings.rememberCloudSyncCode ?? true);
  const [operation, setOperation] = useState<Operation>();
  const [message, setMessage] = useState<Message>();

  useEffect(() => {
    let active = true;
    void loadRememberedCloudSyncCode()
      .then((saved) => {
        if (active && saved) setPhrase(saved);
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage({
            text: error instanceof Error ? error.message : 'Couldn’t load the remembered code',
            tone: 'attention',
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const validPhrase = isValidMnemonic(normaliseMnemonic(phrase));

  const persistPhrasePreference = async (nextRemember: boolean, code = phrase) => {
    const previousRemember = remember;
    try {
      setRemember(nextRemember);
      if (nextRemember && isValidMnemonic(normaliseMnemonic(code))) {
        await rememberCloudSyncCode(code);
      } else if (!nextRemember) {
        await forgetCloudSyncCode();
      }
      await actions.setSettings({
        rememberCloudSyncCode: nextRemember,
        autoSyncEnabled: nextRemember ? state.settings.autoSyncEnabled : false,
      });
    } catch (error) {
      setRemember(previousRemember);
      setMessage({
        text: error instanceof Error ? error.message : 'Couldn’t update the remembered code',
        tone: 'attention',
      });
    }
  };

  const saveNow = async () => {
    setOperation('save');
    setMessage(undefined);
    try {
      const raw = JSON.parse(await storage.exportSettings()) as StorageData;
      const payload = createCloudSyncPayload(raw);
      const result = await saveSettingsToCloud(phrase, payload);
      await actions.setSettings({
        cloudSyncKeyId: result.keyId,
        cloudSyncLastSyncedAt: result.updatedAt,
        rememberCloudSyncCode: remember,
      });
      if (remember) await rememberCloudSyncCode(result.phrase);
      setPhrase(result.phrase);
      setMessage({ text: 'Encrypted settings are up to date', tone: 'positive' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Couldn’t save to Cloud Sync',
        tone: 'attention',
      });
    } finally {
      setOperation(undefined);
    }
  };

  const applyRestore = async (
    payload: StorageData,
    metadata: { keyId: string; phrase: string; updatedAt: string },
  ) => {
    await storage.importSettings(JSON.stringify(payload));
    await storage.updateSettings({
      cloudSyncKeyId: metadata.keyId,
      cloudSyncLastSyncedAt: metadata.updatedAt,
      rememberCloudSyncCode: remember,
      autoSyncEnabled: state.settings.autoSyncEnabled ?? false,
    });
    if (remember) await rememberCloudSyncCode(metadata.phrase);
    await actions.refresh();
    setPhrase(metadata.phrase);
    setMessage({
      text: `Restored ${payload.cards.length} card${payload.cards.length === 1 ? '' : 's'} from Cloud Sync`,
      tone: 'positive',
    });
  };

  const restoreNow = async () => {
    setOperation('restore');
    setMessage(undefined);
    try {
      const restored = await restoreSettingsFromCloud<unknown>(phrase);
      const payload = parseCloudSyncPayload(restored.data);
      Alert.alert(
        'Restore encrypted settings?',
        `The backup from ${new Date(restored.updatedAt).toLocaleString()} contains ${payload.cards.length} card${payload.cards.length === 1 ? '' : 's'}. It will replace local card configuration; your YNAB token stays on this iPhone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            onPress: () => {
              void applyRestore(payload, restored).catch((error: unknown) => {
                setMessage({
                  text: error instanceof Error ? error.message : 'Couldn’t restore settings',
                  tone: 'attention',
                });
              });
            },
          },
        ],
      );
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Couldn’t restore from Cloud Sync',
        tone: 'attention',
      });
    } finally {
      setOperation(undefined);
    }
  };

  const makeCode = () => {
    const next = generateCloudSyncCode();
    setPhrase(next);
    setRevealed(true);
    setMessage({ text: 'New 12-word code created. Save it somewhere safe.', tone: 'positive' });
  };

  const removeBackup = () => {
    const configuredKeyId = state.settings.cloudSyncKeyId;
    if (!configuredKeyId) return;
    Alert.alert(
      'Delete cloud backup?',
      'The encrypted cloud copy will be removed. Local settings stay on this iPhone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Backup',
          style: 'destructive',
          onPress: () => {
            setOperation('delete');
            void (async () => {
              const enteredKeyId = await computeKeyId(normaliseMnemonic(phrase));
              if (enteredKeyId !== configuredKeyId) {
                throw new Error('Enter the recovery code for the configured backup.');
              }
              await deleteSettingsFromCloud(phrase);
              await actions.setSettings({
                cloudSyncKeyId: undefined,
                cloudSyncLastSyncedAt: undefined,
                autoSyncEnabled: false,
              });
              setMessage({ text: 'Cloud backup deleted', tone: 'positive' });
            })()
              .catch((error: unknown) => {
                setMessage({
                  text: error instanceof Error ? error.message : 'Couldn’t delete cloud backup',
                  tone: 'attention',
                });
              })
              .finally(() => setOperation(undefined));
          },
        },
      ],
    );
  };

  const toggleAutoSync = async (enabled: boolean) => {
    if (enabled && !validPhrase) {
      setMessage({ text: 'Enter or generate a valid 12-word code first.', tone: 'attention' });
      return;
    }
    if (enabled && !state.settings.cloudSyncKeyId) {
      setMessage({ text: 'Save or restore once before turning on automatic sync.', tone: 'attention' });
      return;
    }
    const previousRemember = remember;
    try {
      if (enabled) {
        const enteredKeyId = await computeKeyId(normaliseMnemonic(phrase));
        if (enteredKeyId !== state.settings.cloudSyncKeyId) {
          throw new Error('Save or restore this recovery code before turning on automatic sync.');
        }
        setRemember(true);
        await rememberCloudSyncCode(phrase);
        await actions.setSettings({ rememberCloudSyncCode: true, autoSyncEnabled: true });
        setMessage({ text: 'Automatic sync turned on', tone: 'positive' });
      } else {
        await actions.setSettings({ autoSyncEnabled: false });
        setMessage({ text: 'Automatic sync turned off', tone: 'positive' });
      }
    } catch (error) {
      setRemember(previousRemember);
      setMessage({
        text: error instanceof Error ? error.message : 'Couldn’t update automatic sync',
        tone: 'attention',
      });
    }
  };

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(normaliseMnemonic(phrase));
      setMessage({ text: 'Code copied', tone: 'positive' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Couldn’t copy the code',
        tone: 'attention',
      });
    }
  };

  const isBusy = Boolean(operation);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.intro}>
        <Headline>One code, web and iPhone</Headline>
        <Footnote color="secondary">
          Card configuration is encrypted on this device before it reaches the Cloud Sync service.
        </Footnote>
      </View>

      <View>
        <SectionHeader>RECOVERY CODE</SectionHeader>
        <Card style={styles.codeCard}>
          <TextInput
            value={phrase}
            onChangeText={setPhrase}
            placeholder="12-word recovery code"
            placeholderTextColor={semanticColors.tertiaryLabel}
            secureTextEntry={!revealed}
            multiline={revealed}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType="password"
            style={styles.codeField}
            accessibilityLabel="Twelve-word Cloud Sync code"
          />
          <View style={styles.codeActions}>
            <Button variant="plain" size="small" onPress={() => setRevealed((value) => !value)}>
              {revealed ? 'Hide' : 'Reveal'}
            </Button>
            <Button
              variant="plain"
              size="small"
              disabled={!phrase.trim()}
              onPress={() => void copyCode()}
            >
              Copy
            </Button>
            <Button variant="plain" size="small" onPress={makeCode}>Generate</Button>
          </View>
        </Card>
        <SettingsFooter>This code is the only way to decrypt the backup. Rewards Tracker cannot recover it for you.</SettingsFooter>
      </View>

      <View>
        <SectionHeader>THIS IPHONE</SectionHeader>
        <Card>
          <SettingsRow
            isFirst
            title="Remember code"
            subtitle="Store it in the iOS Keychain"
            symbol="key.fill"
            trailingIsInteractive
            trailing={(
              <Switch
                value={remember}
                onValueChange={(value) => void persistPhrasePreference(value)}
                trackColor={{ true: semanticColors.action }}
                accessibilityLabel="Remember Cloud Sync code"
              />
            )}
          />
          <SettingsRow
            title="Automatic sync"
            symbol="arrow.triangle.2.circlepath.icloud.fill"
            trailingIsInteractive
            trailing={(
              <Switch
                value={Boolean(state.settings.autoSyncEnabled)}
                onValueChange={(value) => void toggleAutoSync(value)}
                disabled={isBusy}
                trackColor={{ true: semanticColors.action }}
                accessibilityLabel="Automatic Cloud Sync"
              />
            )}
          />
        </Card>
      </View>

      <View style={styles.primaryActions}>
        <Button
          size="large"
          disabled={!validPhrase || isBusy}
          onPress={() => void saveNow()}
        >
          {operation === 'save' ? 'Saving…' : 'Save to Cloud Sync'}
        </Button>
        <Button
          variant="tinted"
          size="large"
          disabled={!validPhrase || isBusy}
          onPress={() => void restoreNow()}
        >
          {operation === 'restore' ? 'Checking…' : 'Restore from Cloud Sync'}
        </Button>
      </View>

      {state.settings.cloudSyncLastSyncedAt ? (
        <StatusPill
          label={`Last synced ${new Date(state.settings.cloudSyncLastSyncedAt).toLocaleString()}`}
          tone="positive"
          style={styles.message}
        />
      ) : null}
      {message ? (
        <StatusPill
          label={message.text}
          tone={message.tone}
          style={styles.message}
        />
      ) : null}

      {state.settings.cloudSyncKeyId ? (
        <Button
          variant="plain"
          disabled={!validPhrase || isBusy}
          onPress={removeBackup}
          textStyle={styles.destructiveText}
        >
          {operation === 'delete' ? 'Deleting…' : 'Delete cloud backup'}
        </Button>
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
  intro: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  codeCard: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  codeField: {
    minHeight: 88,
    color: semanticColors.label,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  codeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  primaryActions: {
    gap: spacing.md,
  },
  message: {
    alignSelf: 'center',
  },
  destructiveText: {
    color: semanticColors.destructive,
  },
});
