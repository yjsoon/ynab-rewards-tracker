import { useEffect, useRef, useState } from 'react';
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
import {
  acquireCloudSyncLease,
  type CloudSyncLease,
} from '@/lib/cloud-sync-coordinator';
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
  const mountedRef = useRef(true);
  const operationRef = useRef<Operation>(undefined);
  const activeLeaseRef = useRef<CloudSyncLease | undefined>(undefined);
  const parkedRestoreLeaseRef = useRef<CloudSyncLease | undefined>(undefined);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Active requests retain the lease until their own finally block. A
      // restore waiting at the native confirmation alert can release now.
      const parkedLease = parkedRestoreLeaseRef.current;
      parkedLease?.release();
      if (activeLeaseRef.current === parkedLease) activeLeaseRef.current = undefined;
      parkedRestoreLeaseRef.current = undefined;
      operationRef.current = undefined;
    };
  }, []);

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

  const acquireManualLease = async (
    nextOperation: Exclude<Operation, undefined>,
    expectedGeneration: number,
  ): Promise<CloudSyncLease | null> => {
    // State updates are asynchronous, so the ref closes the same-frame double-tap window.
    if (operationRef.current) return null;
    operationRef.current = nextOperation;
    setOperation(nextOperation);

    const lease = await acquireCloudSyncLease();
    if (
      !mountedRef.current
      || operationRef.current !== nextOperation
      || !storage.isGenerationCurrent(expectedGeneration)
    ) {
      lease.release();
      if (mountedRef.current && operationRef.current === nextOperation) {
        operationRef.current = undefined;
        setOperation(undefined);
      }
      return null;
    }

    activeLeaseRef.current = lease;
    return lease;
  };

  const finishManualOperation = (
    completedOperation: Exclude<Operation, undefined>,
    lease: CloudSyncLease,
  ) => {
    lease.release();
    if (activeLeaseRef.current === lease) activeLeaseRef.current = undefined;
    if (parkedRestoreLeaseRef.current === lease) parkedRestoreLeaseRef.current = undefined;
    if (operationRef.current === completedOperation) {
      operationRef.current = undefined;
      if (mountedRef.current) setOperation(undefined);
    }
  };

  const persistPhrasePreference = async (nextRemember: boolean, code = phrase) => {
    if (!nextRemember) {
      actions.invalidatePendingOperations();
    }
    const storageGeneration = storage.captureGeneration();
    const previousRemember = remember;
    try {
      setRemember(nextRemember);
      if (nextRemember && isValidMnemonic(normaliseMnemonic(code))) {
        await rememberCloudSyncCode(code);
      } else if (!nextRemember) {
        await forgetCloudSyncCode();
      }
      if (!storage.isGenerationCurrent(storageGeneration)) return;
      await storage.updateSettings({
        rememberCloudSyncCode: nextRemember,
        autoSyncEnabled: nextRemember ? state.settings.autoSyncEnabled : false,
      }, storageGeneration);
      if (!storage.isGenerationCurrent(storageGeneration)) return;
      await actions.refresh(storageGeneration);
      if (!storage.isGenerationCurrent(storageGeneration)) return;
    } catch (error) {
      if (!mountedRef.current || !storage.isGenerationCurrent(storageGeneration)) return;
      setRemember(previousRemember);
      setMessage({
        text: error instanceof Error ? error.message : 'Couldn’t update the remembered code',
        tone: 'attention',
      });
    }
  };

  const saveNow = async () => {
    const storageGeneration = storage.captureGeneration();
    const lease = await acquireManualLease('save', storageGeneration);
    if (!lease) return;
    setMessage(undefined);
    try {
      const raw = JSON.parse(await storage.exportSettings()) as StorageData;
      if (!mountedRef.current || !storage.isGenerationCurrent(storageGeneration)) return;
      const payload = createCloudSyncPayload(raw);
      const result = await saveSettingsToCloud(phrase, payload);
      if (!storage.isGenerationCurrent(storageGeneration)) return;
      const completedSettings = await storage.completeCloudSyncSnapshot(
        raw.settings.cloudSyncLocalChangedAt,
        {
          cloudSyncKeyId: result.keyId,
          cloudSyncLastSyncedAt: result.updatedAt,
        },
        storageGeneration,
      );
      if (!storage.isGenerationCurrent(storageGeneration)) return;
      const shouldRemember = completedSettings.rememberCloudSyncCode ?? remember;
      if (shouldRemember) {
        await rememberCloudSyncCode(result.phrase);
      } else {
        await forgetCloudSyncCode();
      }
      if (!storage.isGenerationCurrent(storageGeneration)) return;
      if (mountedRef.current) setRemember(shouldRemember);
      await actions.refresh(storageGeneration);
      if (!storage.isGenerationCurrent(storageGeneration) || !mountedRef.current) return;
      setPhrase(result.phrase);
      setMessage({ text: 'Encrypted settings are up to date', tone: 'positive' });
    } catch (error) {
      if (!mountedRef.current || !storage.isGenerationCurrent(storageGeneration)) return;
      setMessage({
        text: error instanceof Error ? error.message : 'Couldn’t save to Cloud Sync',
        tone: 'attention',
      });
    } finally {
      finishManualOperation('save', lease);
    }
  };

  const applyRestore = async (
    payload: StorageData,
    metadata: { keyId: string; phrase: string; updatedAt: string },
    storageGeneration: number,
  ) => {
    if (!mountedRef.current || !storage.isGenerationCurrent(storageGeneration)) return;
    await storage.importSettings(JSON.stringify(payload), { expectedGeneration: storageGeneration });
    if (!storage.isGenerationCurrent(storageGeneration)) return;
    await storage.updateSettings({
      cloudSyncKeyId: metadata.keyId,
      cloudSyncLastSyncedAt: metadata.updatedAt,
      cloudSyncLocalChangedAt: undefined,
      rememberCloudSyncCode: remember,
      autoSyncEnabled: state.settings.autoSyncEnabled ?? false,
    }, storageGeneration);
    if (!storage.isGenerationCurrent(storageGeneration)) return;
    if (remember) await rememberCloudSyncCode(metadata.phrase);
    if (!storage.isGenerationCurrent(storageGeneration)) return;
    await actions.refresh(storageGeneration);
    if (!storage.isGenerationCurrent(storageGeneration) || !mountedRef.current) return;
    setPhrase(metadata.phrase);
    setMessage({
      text: `Restored ${payload.cards.length} card${payload.cards.length === 1 ? '' : 's'} from Cloud Sync`,
      tone: 'positive',
    });
  };

  const restoreNow = async () => {
    const storageGeneration = storage.captureGeneration();
    const lease = await acquireManualLease('restore', storageGeneration);
    if (!lease) return;
    setMessage(undefined);
    try {
      const restored = await restoreSettingsFromCloud<unknown>(phrase);
      if (!mountedRef.current || !storage.isGenerationCurrent(storageGeneration)) {
        finishManualOperation('restore', lease);
        return;
      }
      const payload = parseCloudSyncPayload(restored.data);
      let restoreAccepted = false;
      parkedRestoreLeaseRef.current = lease;
      Alert.alert(
        'Restore encrypted settings?',
        `The backup from ${new Date(restored.updatedAt).toLocaleString()} contains ${payload.cards.length} card${payload.cards.length === 1 ? '' : 's'}. It will replace local card configuration; your YNAB token stays on this iPhone.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => finishManualOperation('restore', lease),
          },
          {
            text: 'Restore',
            onPress: () => {
              restoreAccepted = true;
              parkedRestoreLeaseRef.current = undefined;
              if (!mountedRef.current || !storage.isGenerationCurrent(storageGeneration)) {
                finishManualOperation('restore', lease);
                return;
              }

              const restoreGeneration = actions.invalidatePendingOperations();
              void applyRestore(payload, restored, restoreGeneration)
                .catch((error: unknown) => {
                  if (!mountedRef.current || !storage.isGenerationCurrent(restoreGeneration)) return;
                  setMessage({
                    text: error instanceof Error ? error.message : 'Couldn’t restore settings',
                    tone: 'attention',
                  });
                })
                .finally(() => finishManualOperation('restore', lease));
            },
          },
        ],
        {
          cancelable: true,
          onDismiss: () => {
            if (!restoreAccepted) finishManualOperation('restore', lease);
          },
        },
      );
    } catch (error) {
      finishManualOperation('restore', lease);
      if (!mountedRef.current || !storage.isGenerationCurrent(storageGeneration)) return;
      setMessage({
        text: error instanceof Error ? error.message : 'Couldn’t restore from Cloud Sync',
        tone: 'attention',
      });
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
            const storageGeneration = storage.captureGeneration();
            void (async () => {
              const lease = await acquireManualLease('delete', storageGeneration);
              if (!lease) return;
              try {
                const enteredKeyId = await computeKeyId(normaliseMnemonic(phrase));
                if (!mountedRef.current || !storage.isGenerationCurrent(storageGeneration)) return;
                if (enteredKeyId !== configuredKeyId) {
                  throw new Error('Enter the recovery code for the configured backup.');
                }
                await deleteSettingsFromCloud(phrase);
                if (!storage.isGenerationCurrent(storageGeneration)) return;
                await storage.updateSettings({
                  cloudSyncKeyId: undefined,
                  cloudSyncLastSyncedAt: undefined,
                  autoSyncEnabled: false,
                }, storageGeneration);
                if (!storage.isGenerationCurrent(storageGeneration)) return;
                await actions.refresh(storageGeneration);
                if (!storage.isGenerationCurrent(storageGeneration) || !mountedRef.current) return;
                setMessage({ text: 'Cloud backup deleted', tone: 'positive' });
              } finally {
                finishManualOperation('delete', lease);
              }
            })()
              .catch((error: unknown) => {
                if (!mountedRef.current || !storage.isGenerationCurrent(storageGeneration)) return;
                setMessage({
                  text: error instanceof Error ? error.message : 'Couldn’t delete cloud backup',
                  tone: 'attention',
                });
              });
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
    if (!enabled) {
      actions.invalidatePendingOperations();
    }
    const storageGeneration = storage.captureGeneration();
    const previousRemember = remember;
    try {
      if (enabled) {
        const enteredKeyId = await computeKeyId(normaliseMnemonic(phrase));
        if (!mountedRef.current || !storage.isGenerationCurrent(storageGeneration)) return;
        if (enteredKeyId !== state.settings.cloudSyncKeyId) {
          throw new Error('Save or restore this recovery code before turning on automatic sync.');
        }
        setRemember(true);
        await rememberCloudSyncCode(phrase);
        if (!storage.isGenerationCurrent(storageGeneration)) return;
        await storage.updateSettings(
          { rememberCloudSyncCode: true, autoSyncEnabled: true },
          storageGeneration,
        );
        if (!storage.isGenerationCurrent(storageGeneration)) return;
        await actions.refresh(storageGeneration);
        if (!storage.isGenerationCurrent(storageGeneration) || !mountedRef.current) return;
        setMessage({ text: 'Automatic sync turned on', tone: 'positive' });
      } else {
        await storage.updateSettings({ autoSyncEnabled: false }, storageGeneration);
        if (!storage.isGenerationCurrent(storageGeneration)) return;
        await actions.refresh(storageGeneration);
        if (!storage.isGenerationCurrent(storageGeneration) || !mountedRef.current) return;
        setMessage({ text: 'Automatic sync turned off', tone: 'positive' });
      }
    } catch (error) {
      if (!mountedRef.current || !storage.isGenerationCurrent(storageGeneration)) return;
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
      if (!mountedRef.current) return;
      setMessage({ text: 'Code copied', tone: 'positive' });
    } catch (error) {
      if (!mountedRef.current) return;
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
                disabled={isBusy}
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
