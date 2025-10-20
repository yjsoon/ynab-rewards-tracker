import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useHaptics } from '@/hooks/useHaptics';
import { Card, ListItem, Button, Footnote, SectionHeader, Separator, Headline, Caption1 } from '@/components/ios';
import { semanticColors, semanticHex, withAlpha } from '@/theme/semanticColors';
import { useStorage } from '@/contexts/StorageContext';
import type { YnabAccountSummary, YnabBudgetSummary } from '@/lib/ynab-client';

const connectionStatusCopy: Record<
  'disconnected' | 'connecting' | 'connected' | 'error',
  { label: string; tone: 'primary' | 'secondary' | 'danger' }
> = {
  disconnected: { label: 'Disconnected', tone: 'secondary' },
  connecting: { label: 'Connecting…', tone: 'primary' },
  connected: { label: 'Connected', tone: 'primary' },
  error: { label: 'Connection error', tone: 'danger' },
};

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { impact, notification } = useHaptics();
  const { state, actions } = useStorage();
  const [tokenInput, setTokenInput] = useState(state.pat ?? '');
  const [tokenVisible, setTokenVisible] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [validationError, setValidationError] = useState<string | undefined>();
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | undefined>(state.selectedBudget.id);
  const [trackedAccounts, setTrackedAccounts] = useState<string[]>(state.trackedAccountIds);
  const [isConfirmingBudget, setIsConfirmingBudget] = useState(false);
  const connectedBudgets = useMemo(() => state.budgets ?? [], [state.budgets]);
  const connectedAccounts = useMemo(() => state.accounts ?? [], [state.accounts]);

  const previousBudgetIdRef = useRef<string | undefined>(state.selectedBudget.id);
  const previousTrackedAccountsRef = useRef<string[]>(state.trackedAccountIds);

  useEffect(() => {
    setTokenInput(state.pat ?? '');
  }, [state.pat]);

  useEffect(() => {
    previousBudgetIdRef.current = state.selectedBudget.id;
  }, [state.selectedBudget.id]);

  useEffect(() => {
    const previousAccounts = previousTrackedAccountsRef.current;
    previousTrackedAccountsRef.current = state.trackedAccountIds;

    if (!state.pat) {
      return;
    }

    const prevSet = new Set(previousAccounts);
    const currentSet = new Set(state.trackedAccountIds);
    const hasChanged =
      prevSet.size !== currentSet.size ||
      [...prevSet].some((id) => !currentSet.has(id)) ||
      [...currentSet].some((id) => !prevSet.has(id));

    if (hasChanged) {
      actions.syncBudgetsAndAccounts().catch((error) => {
        console.error('Failed to sync budgets/accounts after tracked accounts change', error);
      });
    }
  }, [state.trackedAccountIds, state.pat, actions]);

  useEffect(() => {
    if (state.selectedBudget.id) {
      setSelectedBudgetId(state.selectedBudget.id);
    }
  }, [state.selectedBudget.id]);

  useEffect(() => {
    setTrackedAccounts(state.trackedAccountIds);
  }, [state.trackedAccountIds]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerLargeTitle: true,
      title: 'Settings',
    });
  }, [navigation]);

  const statusMeta = connectionStatusCopy[state.connectionStatus];

  const handleConnect = useCallback(async () => {
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      setValidationError('Token is required');
      return;
    }

    impact('light');
    console.log('[SettingsScreen] handleConnect: start');
    setIsConnecting(true);
    setValidationError(undefined);
    try {
      await actions.setPAT(trimmed);
      notification('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect to YNAB';
      setValidationError(message);
      notification('error');
      console.error('[SettingsScreen] handleConnect: error', error);
    } finally {
      setIsConnecting(false);
      console.log('[SettingsScreen] handleConnect: finished');
    }
  }, [tokenInput, actions, notification, impact]);

  const handleDisconnect = useCallback(async () => {
    impact('medium');
    await actions.disconnect();
    setSelectedBudgetId(undefined);
    setTrackedAccounts([]);
    notification('warning');
  }, [actions, impact, notification]);

  const handleSelectBudget = useCallback((budget: YnabBudgetSummary) => {
    impact('light');
    setSelectedBudgetId(budget.id);
    setValidationError(undefined);
  }, [impact]);

  const handleConfirmBudget = useCallback(async () => {
    if (!selectedBudgetId) {
      return;
    }

    const budget = connectedBudgets.find((entry) => entry.id === selectedBudgetId);
    if (!budget) {
      return;
    }

    setIsConfirmingBudget(true);
    setValidationError(undefined);
    try {
      await actions.setSelectedBudget(budget.id, budget.name);
      await actions.syncBudgetsAndAccounts();
      notification('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync budget';
      setValidationError(message);
      notification('error');
      console.error('Failed to sync selected budget', error);
    } finally {
      setIsConfirmingBudget(false);
    }
  }, [actions, connectedBudgets, notification, selectedBudgetId]);

  const toggleTrackedAccount = useCallback(async (accountId: string) => {
    impact('light');
    const nextIds = trackedAccounts.includes(accountId)
      ? trackedAccounts.filter(id => id !== accountId)
      : [...trackedAccounts, accountId];
    setTrackedAccounts(nextIds);
    await actions.setTrackedAccountIds(nextIds);
  }, [trackedAccounts, actions, impact]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <SectionHeader>YNAB Connection</SectionHeader>
            <Card>
              <ListItem>
                <View style={styles.fieldGroup}>
                  <Footnote color="secondary">Status</Footnote>
                  <View style={styles.statusRow}>
                    <View style={[styles.statusDot, styles[`statusDot_${statusMeta.tone}`]]} />
                    <Headline>{statusMeta.label}</Headline>
                    {state.connectionStatus === 'connecting' ? (
                      <ActivityIndicator size="small" color={semanticHex.systemBlue} />
                    ) : null}
                  </View>
                  {state.connectionError ? (
                    <Caption1 style={styles.statusError}>{state.connectionError}</Caption1>
                  ) : null}
                </View>
              </ListItem>

              <Separator inset={16} />

              <ListItem>
                <View style={styles.fieldGroup}>
                  <Footnote color="secondary">Personal Access Token</Footnote>
                  <TextInput
                    placeholder="Enter your YNAB PAT"
                    secureTextEntry={!tokenVisible}
                    value={tokenInput}
                    onChangeText={setTokenInput}
                    style={styles.textInput}
                    placeholderTextColor={semanticColors.tertiaryLabel}
                    onFocus={() => impact('light')}
                  />
                  <TouchableOpacity
                    onPress={() => setTokenVisible(prev => !prev)}
                    style={styles.revealButton}
                  >
                    <Caption1 color="primary">{tokenVisible ? 'Hide token' : 'Show token'}</Caption1>
                  </TouchableOpacity>
                  {validationError ? (
                    <Caption1 style={styles.errorText}>{validationError}</Caption1>
                  ) : null}
                </View>
              </ListItem>

              <Separator inset={16} />

              {state.connectionStatus !== 'connected' || connectedBudgets.length === 0 ? (
                <ListItem>
                  <Button
                    variant="filled"
                    size="medium"
                    onPress={handleConnect}
                    style={styles.connectButton}
                    accessibilityLabel="Connect to YNAB"
                    accessibilityHint="Saves your personal access token and fetches budgets"
                    disabled={isConnecting || !tokenInput.trim()}
                  >
                    {isConnecting ? 'Connecting…' : 'Connect to YNAB'}
                  </Button>
                </ListItem>
              ) : (
                <ListItem>
                  <Footnote color="tertiary">Connected. Choose a budget below to continue.</Footnote>
                </ListItem>
              )}

              <Separator inset={16} />

              <ListItem>
                <Button
                  variant="plain"
                  size="medium"
                  onPress={handleDisconnect}
                  style={styles.connectButton}
                  accessibilityLabel="Disconnect YNAB"
                  accessibilityHint="Disconnects your YNAB account from YJAB"
                  disabled={!state.pat}
                >
                  Disconnect
                </Button>
              </ListItem>
            </Card>

            {state.pat ? (
              <>
                <SectionHeader>Budgets</SectionHeader>
                <Card>
                  {connectedBudgets.length === 0 ? (
                    <ListItem>
                      <Caption1 color="secondary">No budgets available. Refresh after connecting.</Caption1>
                    </ListItem>
                  ) : (
                    connectedBudgets.map((budget, index) => (
                      <React.Fragment key={budget.id}>
                        {index > 0 ? <Separator inset={16} /> : null}
                        <ListItem
                          onPress={() => handleSelectBudget(budget)}
                          showDisclosure={false}
                          accessibilityLabel={`Select budget ${budget.name}`}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: selectedBudgetId === budget.id }}
                        >
                          <View style={styles.budgetRow}>
                            <View style={styles.budgetInfo}>
                              <Headline>{budget.name}</Headline>
                              <Caption1 color="secondary">Last modified {new Date(budget.last_modified_on).toLocaleDateString()}</Caption1>
                            </View>
                            {selectedBudgetId === budget.id ? (
                              <Caption1 color="primary">Selected</Caption1>
                            ) : null}
                          </View>
                        </ListItem>
                      </React.Fragment>
                    ))
                  )}
                </Card>

                {connectedBudgets.length > 0 ? (
                  <Card style={styles.confirmCard}>
                    <ListItem>
                      <Button
                        variant="filled"
                        size="medium"
                        onPress={handleConfirmBudget}
                        disabled={!selectedBudgetId || isConfirmingBudget}
                      >
                        {isConfirmingBudget ? 'Starting sync…' : 'Continue with this budget'}
                      </Button>
                    </ListItem>
                  </Card>
                ) : null}

                <SectionHeader>Tracked accounts</SectionHeader>
                <Card>
                  {connectedAccounts.length === 0 ? (
                    <ListItem>
                      <Caption1 color="secondary">Select a budget to see its accounts.</Caption1>
                    </ListItem>
                  ) : (
                    connectedAccounts.map((account, index) => (
                      <React.Fragment key={account.id}>
                        {index > 0 ? <Separator inset={16} /> : null}
                        <ListItem
                          onPress={() => toggleTrackedAccount(account.id)}
                          accessibilityLabel={`Toggle tracking for ${account.name}`}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: trackedAccounts.includes(account.id) }}
                        >
                          <View style={styles.accountRow}>
                            <View style={styles.accountInfo}>
                              <Headline>{account.name}</Headline>
                              <Caption1 color="secondary">{formatAccountType(account.type)}</Caption1>
                            </View>
                            <View style={[styles.trackBadge, trackedAccounts.includes(account.id) && styles.trackBadgeActive]}>
                              <Caption1 color={trackedAccounts.includes(account.id) ? 'primary' : 'secondary'}>
                                {trackedAccounts.includes(account.id) ? 'Tracking' : 'Track'}
                              </Caption1>
                            </View>
                          </View>
                        </ListItem>
                      </React.Fragment>
                    ))
                  )}
                </Card>
              </>
            ) : null}

            <SectionHeader>About</SectionHeader>
            <Card>
              <ListItem>
                <View style={styles.aboutInfo}>
                  <Footnote color="secondary">Version 0.1.0 (Demo Mode)</Footnote>
                  <Footnote color="secondary">Built with Expo + React Native</Footnote>
                </View>
              </ListItem>
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  content: {
    gap: 8,
  },
  fieldGroup: {
    gap: 8,
    width: '100%',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: semanticColors.separator,
  },
  statusDot_primary: {
    backgroundColor: semanticColors.systemBlue,
  },
  statusDot_secondary: {
    backgroundColor: semanticColors.systemGray2,
  },
  statusDot_danger: {
    backgroundColor: semanticColors.systemRed,
  },
  statusError: {
    color: semanticColors.systemRed,
  },
  textInput: {
    borderWidth: 1,
    borderColor: semanticColors.separator,
    backgroundColor: semanticColors.tertiarySystemBackground,
    padding: 12,
    borderRadius: 8,
    fontSize: 17,
    color: semanticColors.label,
  },
  revealButton: {
    alignSelf: 'flex-start',
  },
  errorText: {
    color: semanticColors.systemRed,
  },
  connectButton: {
    width: '100%',
  },
  confirmCard: {
    marginTop: 12,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  budgetInfo: {
    flex: 1,
    gap: 4,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  accountInfo: {
    flex: 1,
    gap: 4,
  },
  trackBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: semanticColors.secondarySystemFill,
  },
  trackBadgeActive: {
    backgroundColor: withAlpha(semanticHex.systemBlue, '22'),
  },
  aboutInfo: {
    gap: 8,
  },
});

function formatAccountType(type: string) {
  switch (type) {
    case 'creditCard':
      return 'Credit card';
    case 'checking':
      return 'Checking';
    case 'savings':
      return 'Savings';
    case 'cash':
      return 'Cash';
    case 'lineOfCredit':
      return 'Line of credit';
    default:
      return type;
  }
}
