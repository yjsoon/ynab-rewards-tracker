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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useHaptics } from '@/hooks/useHaptics';
import { useToast } from '@/contexts/ToastContext';
import { Card, ListItem, Button, Footnote, SectionHeader, Separator, Headline, Caption1 } from '@/components/ios';
import { semanticColors, semanticHex, withAlpha } from '@/theme/semanticColors';
import { useStorage } from '@/contexts/StorageContext';
import type { YnabAccountSummary, YnabBudgetSummary } from '@/lib/ynab-client';

const connectionStatusCopy: Record<
  'disconnected' | 'authenticating' | 'awaiting_budget' | 'connected' | 'error',
  { label: string; tone: 'primary' | 'secondary' | 'danger' }
> = {
  disconnected: { label: 'Disconnected', tone: 'secondary' },
  authenticating: { label: 'Connecting…', tone: 'primary' },
  awaiting_budget: { label: 'Awaiting budget selection', tone: 'primary' },
  connected: { label: 'Connected', tone: 'primary' },
  error: { label: 'Connection error', tone: 'danger' },
};

export default function SettingsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { impact, notification } = useHaptics();
  const { show: showToast } = useToast();
  const { state, actions } = useStorage();

  const canDismiss = navigation.canGoBack();

  const isAuthenticating = state.connectionStatus === 'authenticating';
  const isSyncing = state.isSyncing;
  const isAwaitingBudget = state.connectionStatus === 'awaiting_budget';
  const isConnected = state.connectionStatus === 'connected';
  const isDisconnected = state.connectionStatus === 'disconnected';
  const isError = state.connectionStatus === 'error';

  const isSetupMode = useMemo(
    () => !state.pat || !state.selectedBudget.id || state.trackedAccountIds.length === 0 || state.connectionStatus !== 'connected',
    [state.pat, state.selectedBudget.id, state.trackedAccountIds.length, state.connectionStatus]
  );

  const [tokenInput, setTokenInput] = useState(state.pat ?? '');
  const [tokenVisible, setTokenVisible] = useState(false);
  const [validationError, setValidationError] = useState<string | undefined>();
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | undefined>(state.selectedBudget.id);
  const [trackedAccounts, setTrackedAccounts] = useState<string[]>(state.trackedAccountIds);
  const [isConfirmingBudget, setIsConfirmingBudget] = useState(false);
  const [isApplyingChanges, setIsApplyingChanges] = useState(false);
  const [hasLocalAccountToggles, setHasLocalAccountToggles] = useState(false);
  const [activeBudgetSyncId, setActiveBudgetSyncId] = useState<string | undefined>();

  const isApplyingRef = useRef(false);

  const connectedBudgets = useMemo(() => state.budgets ?? [], [state.budgets]);
  const connectedAccounts = useMemo(() => state.accounts ?? [], [state.accounts]);

  const hasPendingBudget = Boolean(state.pending?.budget);
  const hasPendingTracked = Boolean(state.pending?.trackedAccountIds);

  const isBudgetsLoading = isAuthenticating ||
    (state.budgets.length === 0 && state.connectionStatus === 'awaiting_budget' && !state.connectionError);

  const hasLocalTrackedChanges = useMemo(() => {
    const a = [...trackedAccounts].sort().join(',');
    const b = [...state.trackedAccountIds].sort().join(',');
    return a !== b;
  }, [trackedAccounts, state.trackedAccountIds]);

  const shouldShowConfirmBudget = useMemo(() => {
    if (!selectedBudgetId || connectedBudgets.length === 0) return false;
    if (isSyncing) return false;
    return isAwaitingBudget || hasPendingBudget || selectedBudgetId !== state.selectedBudget.id;
  }, [isAwaitingBudget, hasPendingBudget, isSyncing, selectedBudgetId, state.selectedBudget.id, connectedBudgets.length]);

  const showFinishSetupCta = isSetupMode || hasPendingTracked || hasLocalTrackedChanges;

  const finishSetupDisabled = isSyncing || isConfirmingBudget || isApplyingChanges || !selectedBudgetId || (isSetupMode && trackedAccounts.length === 0);

  const confirmBudgetButtonLabel = (() => {
    if (isConfirmingBudget || isSyncing) {
      return isSetupMode ? 'Finishing setup…' : 'Applying…';
    }
    return 'Continue with this budget';
  })();

  const finishSetupButtonLabel = (() => {
    if (isApplyingChanges) {
      return isSetupMode ? 'Finishing setup…' : 'Applying…';
    }
    return isSetupMode ? 'Finish setup' : 'Apply tracking changes';
  })();

  useFocusEffect(
    useCallback(() => {
      // Reset flags that block toggling
      setHasLocalAccountToggles(false);
      setIsApplyingChanges(false);

      // Sync local state with context only when no pending staged values
      if (!state.pending?.trackedAccountIds) {
        setTrackedAccounts(state.trackedAccountIds);
      }
      if (!state.pending?.budget) {
        setSelectedBudgetId(state.selectedBudget.id);
      }
    }, [state.trackedAccountIds, state.selectedBudget.id, state.pending])
  );

  const getSortedAccounts = useCallback((accounts: YnabAccountSummary[], trackedIds: string[]) => {
    const trackedSet = new Set(trackedIds);
    const tracked = accounts.filter(acc => trackedSet.has(acc.id)).sort((a, b) => a.name.localeCompare(b.name));
    const untracked = accounts.filter(acc => !trackedSet.has(acc.id)).sort((a, b) => a.name.localeCompare(b.name));
    return [...tracked, ...untracked];
  }, []);

  const displayAccounts = useMemo(() => {
    if (hasLocalAccountToggles) {
      return connectedAccounts;
    }
    return getSortedAccounts(connectedAccounts, trackedAccounts);
  }, [connectedAccounts, trackedAccounts, hasLocalAccountToggles, getSortedAccounts]);

  useEffect(() => {
    setTokenInput(state.pat ?? '');
  }, [state.pat]);

  useEffect(() => {
    if (!state.pending?.budget) {
      setSelectedBudgetId(state.selectedBudget.id);
    }
  }, [state.selectedBudget.id, state.pending?.budget]);

  useEffect(() => {
    if (!state.pending?.trackedAccountIds) {
      setTrackedAccounts(state.trackedAccountIds);
      setHasLocalAccountToggles(false);
      setActiveBudgetSyncId(undefined);
    }
  }, [state.trackedAccountIds, state.pending?.trackedAccountIds]);

  useEffect(() => {
    if (!activeBudgetSyncId) return;
    const isCurrent = (state.selectedBudget.id === activeBudgetSyncId) ||
                      (state.pending?.budget?.id === activeBudgetSyncId);
    const accountsAreFresh = state.metadata?.accountsBudgetId === activeBudgetSyncId;
    if ((!isSyncing && isCurrent && accountsAreFresh) || state.connectionError) {
      setActiveBudgetSyncId(undefined);
    }
  }, [activeBudgetSyncId, isSyncing, state.selectedBudget.id, state.pending?.budget?.id, state.metadata?.accountsBudgetId, state.connectionError]);

  const handleDone = useCallback(async () => {
    if (isApplyingRef.current) {
      return;
    }
    
    const hasPendingToSave = state.hasPendingChanges || hasLocalTrackedChanges;

    if (hasPendingToSave) {
      isApplyingRef.current = true;

      // Close immediately
      impact('light');
      router.back();

      // Apply changes in background (fire and forget)
      (async () => {
        try {
          if (hasLocalTrackedChanges) {
            actions.stageTrackedAccountIds(trackedAccounts);
          }
          await actions.applyPendingChanges();
          notification('success');
        } catch (error) {
          notification('error');
        } finally {
          isApplyingRef.current = false;
        }
      })();
    } else {
      // No changes, just close
      impact('light');
      router.back();
    }
  }, [state.hasPendingChanges, hasLocalTrackedChanges, actions, trackedAccounts, notification, impact, router]);

  const handleFinishSetup = useCallback(async () => {
    setValidationError(undefined);
    setIsApplyingChanges(true);
    const wasInSetupMode = isSetupMode;
    const hadNoBackStack = !canDismiss;
    
    // Navigate immediately if in setup mode to avoid label change
    if (wasInSetupMode) {
      if (hadNoBackStack) {
        router.replace('/(tabs)');
      } else {
        router.back();
      }
    }
    
    try {
      actions.stageTrackedAccountIds(trackedAccounts);
      await actions.applyPendingChanges();
      notification('success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : undefined;
      const toastMessage = errorMessage || 'Couldn\'t finish setup. Failed to sync with YNAB';
      
      setValidationError(errorMessage || 'Failed to finish setup');
      
      // Show toast error that persists after navigation
      // This ensures users see feedback even if they've navigated away from Settings
      // The toast appears within 300ms (animation duration) and survives navigation
      // Note: showToast already triggers haptic feedback, so we don't call notification('error') here
      showToast({
        variant: 'error',
        message: toastMessage,
      });
      
      // If navigation already happened, we can't go back, so just return
      if (!wasInSetupMode) {
        return;
      }
    } finally {
      setIsApplyingChanges(false);
    }
  }, [actions, trackedAccounts, isSetupMode, notification, router, canDismiss, showToast]);

  const doneButtonLabel = useMemo(() => {
    if (isSetupMode) {
      return finishSetupButtonLabel;
    }
    return 'Done';
  }, [isSetupMode, finishSetupButtonLabel]);

  const handleNavBarDone = useCallback(() => {
    if (isSetupMode) {
      handleFinishSetup();
    } else {
      handleDone();
    }
  }, [isSetupMode, handleFinishSetup, handleDone]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Settings',
      headerLargeTitle: false,
      headerBackVisible: !isSetupMode,
      gestureEnabled: !isSetupMode,
      headerRight: (isSetupMode || canDismiss)
        ? () => (
            <Button
              variant="plain"
              size="small"
              onPress={handleNavBarDone}
              accessibilityLabel={doneButtonLabel}
              accessibilityHint={isSetupMode ? "Complete setup" : "Close settings"}
              style={styles.doneButton}
              disabled={isSetupMode ? finishSetupDisabled : isApplyingChanges}
            >
              {isApplyingChanges || isConfirmingBudget ? (isSetupMode ? 'Finishing setup…' : 'Applying…') : doneButtonLabel}
            </Button>
          )
        : undefined,
    });
  }, [navigation, isSetupMode, canDismiss, handleNavBarDone, doneButtonLabel, finishSetupDisabled, isApplyingChanges, isConfirmingBudget]);

  const statusMeta = connectionStatusCopy[state.connectionStatus];

  const handleConnect = useCallback(async () => {
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      setValidationError('Token is required');
      return;
    }

    impact('light');
    setValidationError(undefined);
    try {
      await actions.setPAT(trimmed);
      notification('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect to YNAB';
      setValidationError(message);
      notification('error');
      console.error('[SettingsScreen] handleConnect: error', error);
    }
  }, [tokenInput, actions, notification, impact]);

  const handleDisconnect = useCallback(async () => {
    impact('medium');
    await actions.clearPAT();
    setSelectedBudgetId(undefined);
    setTrackedAccounts([]);
    notification('warning');
  }, [actions, impact, notification]);

  const handleSelectBudget = useCallback((budget: YnabBudgetSummary) => {
    impact('light');
    setSelectedBudgetId(budget.id);
    actions.stageBudgetSelection(budget.id, budget.name);
    setValidationError(undefined);
  }, [impact, actions]);

  const handleConfirmBudget = useCallback(async () => {
    if (!selectedBudgetId) {
      return;
    }

    const budget = connectedBudgets.find((entry) => entry.id === selectedBudgetId);
    if (!budget) {
      return;
    }

    setActiveBudgetSyncId(budget.id);
    setIsConfirmingBudget(true);
    setValidationError(undefined);
    try {
      actions.stageBudgetSelection(budget.id, budget.name);
      await actions.applyPendingChanges();
      notification('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync budget';
      setValidationError(message);
      notification('error');
      console.error('Failed to sync selected budget', error);
      setActiveBudgetSyncId(undefined);
    } finally {
      setIsConfirmingBudget(false);
    }
  }, [actions, connectedBudgets, notification, selectedBudgetId]);

  const toggleTrackedAccount = useCallback((accountId: string) => {
    if (state.isSyncing || isApplyingChanges) {
      return;
    }
    impact('light');

    const nextIds = trackedAccounts.includes(accountId)
      ? trackedAccounts.filter(id => id !== accountId)
      : [...trackedAccounts, accountId];
    setTrackedAccounts(nextIds);
    setHasLocalAccountToggles(true);
    actions.stageTrackedAccountIds(nextIds);
  }, [trackedAccounts, actions, impact, state.isSyncing, isApplyingChanges]);

  const shouldShowConnectButton = isDisconnected || isError || isAuthenticating;
  const connectButtonLabel = isAuthenticating ? 'Connecting…' : (isError ? 'Retry connection' : 'Connect to YNAB');
  const connectButtonDisabled = isAuthenticating || isSyncing || isApplyingChanges || !tokenInput.trim();

  const statusMessage = (() => {
    if (isAwaitingBudget) {
      return 'Token verified. Select a budget and at least one account, then tap Finish setup.';
    }
    if (isConnected) {
      return isSetupMode ? 'Connected. Choose a budget below to continue.' : 'Connected.';
    }
    return null;
  })();

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
            {isSetupMode ? (
              <Card style={styles.setupBanner}>
                <ListItem>
                  <View style={styles.setupBannerContent}>
                    <Caption1 color="secondary">
                      Complete setup by connecting your YNAB account, selecting a budget, and choosing accounts to track.
                    </Caption1>
                  </View>
                </ListItem>
              </Card>
            ) : null}

            <SectionHeader>YNAB Connection</SectionHeader>
            <Card>
              <ListItem>
                <View style={styles.fieldGroup}>
                  <Footnote color="secondary">Status</Footnote>
                  <View style={styles.statusRow}>
                    <View style={[styles.statusDot, styles[`statusDot_${statusMeta.tone}`]]} />
                    <Headline>{statusMeta.label}</Headline>
                    {(isAuthenticating || isSyncing) ? (
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

              {shouldShowConnectButton ? (
                <ListItem>
                  <Button
                    variant="filled"
                    size="medium"
                    onPress={handleConnect}
                    style={styles.connectButton}
                    accessibilityLabel="Connect to YNAB"
                    accessibilityHint="Saves your personal access token and fetches budgets"
                    disabled={connectButtonDisabled}
                  >
                    {connectButtonLabel}
                  </Button>
                </ListItem>
              ) : statusMessage ? (
                <ListItem>
                  <Footnote color="tertiary">
                    {statusMessage}
                  </Footnote>
                </ListItem>
              ) : null}

              <Separator inset={16} />

              {state.pat && (
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
              )}
            </Card>

            {state.pat ? (
              <>
                <SectionHeader>Budgets</SectionHeader>
                <Card>
                  {isBudgetsLoading ? (
                    <ListItem>
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color={semanticHex.systemBlue} />
                        <Caption1 color="secondary">Loading budgets…</Caption1>
                      </View>
                    </ListItem>
                  ) : connectedBudgets.length === 0 ? (
                    <ListItem>
                      <Caption1 color="secondary">No budgets available. Check your connection.</Caption1>
                    </ListItem>
                  ) : (
                    connectedBudgets.map((budget, index) => {
                      const isBudgetSelected = selectedBudgetId === budget.id;

                      return (
                        <React.Fragment key={budget.id}>
                          {index > 0 ? <Separator inset={16} /> : null}
                          <ListItem
                            onPress={() => handleSelectBudget(budget)}
                            showDisclosure={false}
                            accessibilityLabel={`Select budget ${budget.name}`}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: isBudgetSelected }}
                          >
                            <View style={styles.budgetRow}>
                              <View style={styles.budgetInfo}>
                                <Headline>{budget.name}</Headline>
                                <Caption1 color="secondary">Last modified {new Date(budget.last_modified_on).toLocaleDateString()}</Caption1>
                              </View>
                              {isBudgetSelected ? (
                                <View style={styles.tickContainer}>
                                  <Headline style={styles.tickIcon}>✓</Headline>
                                </View>
                              ) : null}
                            </View>
                          </ListItem>
                        </React.Fragment>
                      );
                    })
                  )}
                </Card>

                {shouldShowConfirmBudget ? (
                  <Card style={styles.confirmCard}>
                    <ListItem>
                      <View style={styles.confirmButtonRow}>
                        <Button
                          variant="filled"
                          size="medium"
                          onPress={handleConfirmBudget}
                          disabled={!selectedBudgetId || isSyncing || isConfirmingBudget || isApplyingChanges}
                          style={{ flex: 1 }}
                        >
                          {confirmBudgetButtonLabel}
                        </Button>
                        {isConfirmingBudget ? (
                          <ActivityIndicator size="small" color={semanticHex.systemBlue} />
                        ) : null}
                      </View>
                    </ListItem>
                  </Card>
                ) : null}

                <SectionHeader>Tracked accounts</SectionHeader>
                <Card>
                  {connectedAccounts.length === 0 ? (
                    <ListItem>
                      {activeBudgetSyncId ? (
                        <View style={styles.loadingContainer}>
                          <ActivityIndicator size="small" color={semanticHex.systemBlue} />
                          <Caption1 color="secondary">Loading accounts…</Caption1>
                        </View>
                      ) : (
                        <Caption1 color="secondary">Select a budget to see its accounts.</Caption1>
                      )}
                    </ListItem>
                  ) : (
                    displayAccounts.map((account, index) => (
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

                {showFinishSetupCta ? (
                  <Card style={styles.confirmCard}>
                    <ListItem>
                      <View style={styles.confirmButtonRow}>
                        <Button
                          variant="filled"
                          size="medium"
                          onPress={handleFinishSetup}
                          disabled={finishSetupDisabled}
                          style={{ flex: 1 }}
                        >
                          {finishSetupButtonLabel}
                        </Button>
                        {isApplyingChanges ? (
                          <ActivityIndicator size="small" color={semanticHex.systemBlue} />
                        ) : null}
                      </View>
                    </ListItem>
                  </Card>
                ) : null}
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
  setupBanner: {
    backgroundColor: withAlpha(semanticHex.systemBlue, '15'),
    borderWidth: 1,
    borderColor: withAlpha(semanticHex.systemBlue, '30'),
  },
  setupBannerContent: {
    paddingVertical: 4,
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
  accessoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    marginLeft: 4,
  },
  tickContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  tickIcon: {
    color: semanticHex.systemBlue,
    fontSize: 20,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  confirmCard: {
    marginTop: 12,
  },
  confirmButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
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
  doneButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
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
