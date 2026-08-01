import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type {
  DashboardTransactionsCacheEntry,
  DashboardTransactionsCachePayload,
} from '@ynab-counter/app-core/storage';
import { getEarliestPeriodStart } from '@ynab-counter/app-core/rewards-engine/utils/periods';

import { SparkIcon } from '@/components/brand';
import {
  Body,
  Card,
  Caption1,
  Footnote,
  Headline,
  LargeTitle,
  ListItem,
  Title1,
} from '@/components/ios';
import { EmptyState, StatusPill } from '@/components/native';
import { useStorage } from '@/contexts/StorageContext';
import { FlagPicker } from '@/features/activity/FlagPicker';
import { planFlagUpdateRefresh } from '@/features/activity/flag-update';
import { createLocalFlagUpdatePublication } from '@/features/activity/flag-update-publication';
import {
  createActivityFormatting,
  formatActivityDate,
  formatClearedState,
  formatRewardLong,
  formatRewardRate,
  formatRewardValueDetail,
  formatTransactionAmount,
  getRewardExplanation,
  getRewardStatusCopy,
  rewardStatusTone,
  useActivityModel,
} from '@/features/activity';
import { useHaptics } from '@/hooks/useHaptics';
import { updateTransactionFlag } from '@/lib/ynab-api';
import {
  isYnabApiError,
  type YnabTransactionFlagColor,
} from '@/lib/ynab-client';
import { semanticColors } from '@/theme';
import { nativeMetrics, spacing } from '@/theme/tokens';
import { storage } from '@/storage/service';

const DEMO_MODE = __DEV__ && process.env.EXPO_PUBLIC_MOBILE_DEMO === '1';

const VALID_FLAG_COLOURS = new Set<YnabTransactionFlagColor>([
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  null,
]);

function normaliseFlagColour(value: string | null | undefined): YnabTransactionFlagColor {
  return VALID_FLAG_COLOURS.has(value as YnabTransactionFlagColor)
    ? value as YnabTransactionFlagColor
    : null;
}

function cacheWithFlag(
  cacheEntry: DashboardTransactionsCacheEntry,
  transactionId: string,
  flagColor: YnabTransactionFlagColor,
  flagName: string | null | undefined,
): DashboardTransactionsCachePayload {
  return {
    budgetId: cacheEntry.budgetId,
    sinceDate: cacheEntry.sinceDate,
    fetchedAt: cacheEntry.fetchedAt,
    trackedAccountIds: cacheEntry.trackedAccountIds,
    isComplete: cacheEntry.isComplete,
    requiresFullRefresh: cacheEntry.requiresFullRefresh,
    accounts: cacheEntry.accounts,
    transactions: cacheEntry.transactions.map((transaction) => (
      transaction.id === transactionId
        ? {
            ...transaction,
            flag_color: flagColor,
            flag_name: flagName,
          }
        : transaction
    )),
  };
}

function flagUpdateErrorMessage(error: unknown): string {
  if (isYnabApiError(error)) {
    switch (error.code) {
      case 'invalid_token':
        return 'Your YNAB connection has expired. Reconnect in Settings and try again.';
      case 'rate_limited':
        return 'YNAB is receiving too many requests. Wait a moment and try again.';
      case 'network_error':
      case 'timeout':
        return 'YNAB could not be reached. Refresh Activity to confirm the flag colour.';
      case 'unknown_error':
        break;
    }
  }
  return 'The flag colour could not be updated. Your previous choice has been restored.';
}

function DetailRow({
  label,
  value,
  isFirst = false,
  valueColor,
}: {
  label: string;
  value: string;
  isFirst?: boolean;
  valueColor?: 'primary' | 'secondary' | 'positive' | 'attention';
}) {
  return (
    <ListItem
      isFirst={isFirst}
      accessibilityLabel={`${label}, ${value}`}
      style={styles.detailRow}
    >
      <View style={styles.detailRowContent} accessibilityElementsHidden>
        <Body color="secondary" style={styles.detailLabel}>{label}</Body>
        <Body color={valueColor ?? 'primary'} style={styles.detailValue}>{value}</Body>
      </View>
    </ListItem>
  );
}

export default function TransactionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { state, actions } = useStorage();
  const { notification } = useHaptics();
  const model = useActivityModel();
  const cacheEntryRef = useRef(model.cacheEntry);
  const flagMutationInFlightRef = useRef(false);
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const projection = model.transactions.find((item) => item.transaction.id === id);
  const formatting = useMemo(() => createActivityFormatting(state.settings), [state.settings]);
  const projectedFlagColour = normaliseFlagColour(projection?.transaction.flag_color);
  const [selectedFlagColour, setSelectedFlagColour] = useState<YnabTransactionFlagColor>(
    projectedFlagColour,
  );
  const [isSavingFlag, setIsSavingFlag] = useState(false);
  const [flagError, setFlagError] = useState<string>();

  useEffect(() => {
    if (!isSavingFlag) {
      setSelectedFlagColour(projectedFlagColour);
    }
  }, [isSavingFlag, projectedFlagColour]);

  useEffect(() => {
    cacheEntryRef.current = model.cacheEntry;
  }, [model.cacheEntry]);

  if (!projection) {
    return (
      <View style={styles.missing}>
        <EmptyState
          title="Transaction unavailable"
          message="It may no longer be in the saved activity window. Refresh Activity to load the latest data."
          action={{ label: 'Back to Activity', onPress: () => router.back() }}
        />
      </View>
    );
  }

  const transaction = projection.transaction;
  const payee = transaction.payee_name?.trim()
    || projection.account.name
    || 'Unknown merchant';
  const reward = formatRewardLong(projection, formatting);
  const rewardDetail = formatRewardValueDetail(projection, formatting);
  const isEarning = projection.status === 'earning';
  const block = projection.blockInfo;
  const statusCopy = getRewardStatusCopy(projection);

  const handleFlagChange = async (nextFlagColour: YnabTransactionFlagColor) => {
    if (
      flagMutationInFlightRef.current
      || isSavingFlag
      || nextFlagColour === selectedFlagColour
      || !model.cacheEntry
      || !id
    ) {
      return;
    }

    const connection = !DEMO_MODE && state.pat && state.selectedBudget.id
      ? { pat: state.pat, budgetId: state.selectedBudget.id }
      : undefined;
    if (!DEMO_MODE && !connection) {
      setFlagError('Connect YNAB in Settings before changing a flag colour.');
      notification('error');
      return;
    }

    const previousFlagColour = normaliseFlagColour(transaction.flag_color);
    const previousFlagName = transaction.flag_name;
    const cacheEntry = model.cacheEntry;
    const storageGeneration = storage.captureGeneration();
    const isCurrentMutation = () => storage.isGenerationCurrent(storageGeneration);
    const persistCachedFlag = async (
      flagColor: YnabTransactionFlagColor,
      flagName: string | null | undefined,
    ): Promise<boolean> => {
      if (!isCurrentMutation()) return false;
      // A refresh may complete while the PATCH is in flight. Always apply the
      // single-field change to the latest entry instead of replaying an old blob.
      const latestEntry = cacheEntryRef.current ?? cacheEntry;
      const payload = cacheWithFlag(latestEntry, id, flagColor, flagName);
      cacheEntryRef.current = {
        ...latestEntry,
        transactions: payload.transactions,
      };
      await actions.setDashboardCachedData(payload, storageGeneration);
      return isCurrentMutation();
    };

    flagMutationInFlightRef.current = true;
    setSelectedFlagColour(nextFlagColour);
    setFlagError(undefined);
    setIsSavingFlag(true);
    let remoteUpdateSucceeded = false;

    try {
      if (!(await persistCachedFlag(nextFlagColour, null))) return;

      let confirmedFlagColour = nextFlagColour;
      let confirmedFlagName: string | null | undefined = null;

      if (connection) {
        const savedTransaction = await updateTransactionFlag(
          connection.pat,
          connection.budgetId,
          id,
          nextFlagColour,
        );
        if (!isCurrentMutation()) return;
        remoteUpdateSucceeded = true;

        if (savedTransaction) {
          confirmedFlagColour = normaliseFlagColour(
            savedTransaction.flag_color ?? nextFlagColour,
          );
          confirmedFlagName = savedTransaction.flag_name ?? null;
        }
      }

      // The successful PATCH is authoritative. Cancel any refresh that started
      // before it, then reapply the confirmed flag to the latest cached entry.
      actions.invalidateSyncRequests();
      if (!(await persistCachedFlag(confirmedFlagColour, confirmedFlagName))) return;

      // Reward calculations are persisted derived data. Even a complete
      // transaction cache cannot update those totals by changing one cached
      // row alone, so every confirmed flag change must run the calculation
      // publication path. Incomplete caches additionally force a full fetch.
      try {
        const latestEntry = cacheEntryRef.current ?? cacheEntry;
        const refreshPlan = planFlagUpdateRefresh(latestEntry);
        if (refreshPlan.markCacheForFullRefresh) {
          const stalePayload: DashboardTransactionsCachePayload = {
            budgetId: latestEntry.budgetId,
            sinceDate: latestEntry.sinceDate,
            fetchedAt: latestEntry.fetchedAt,
            trackedAccountIds: latestEntry.trackedAccountIds,
            isComplete: latestEntry.isComplete,
            requiresFullRefresh: true,
            transactions: latestEntry.transactions,
            accounts: latestEntry.accounts,
          };
          cacheEntryRef.current = {
            ...latestEntry,
            requiresFullRefresh: true,
          };
          await actions.setDashboardCachedData(stalePayload, storageGeneration);
          if (!isCurrentMutation()) return;
        }

        if (refreshPlan.syncRewards) {
          if (DEMO_MODE) {
            const publication = createLocalFlagUpdatePublication({
              cacheEntry: cacheEntryRef.current ?? latestEntry,
              cards: state.cards,
              settings: state.settings,
              calculations: state.calculations,
            });
            await actions.setCalculations(publication.calculations);
          } else {
            await actions.syncBudgetsAndAccounts({
              sinceDate: getEarliestPeriodStart(state.cards),
            }, storageGeneration);
          }
        }
        if (!isCurrentMutation()) return;
      } catch {
        if (!isCurrentMutation()) return;
        setFlagError('Flag saved, but rewards couldn’t be refreshed. Refresh Activity to update totals.');
        notification('error');
        return;
      }

      notification('success');
    } catch (error) {
      if (!isCurrentMutation()) return;
      if (remoteUpdateSucceeded) {
        setFlagError('Flag saved in YNAB, but local rewards couldn’t be updated. Refresh Activity to try again.');
        notification('error');
        return;
      }
      const outcomeUnknown = isYnabApiError(error)
        && (error.code === 'timeout' || error.code === 'network_error');
      if (outcomeUnknown) {
        setFlagError(flagUpdateErrorMessage(error));
        notification('error');
        return;
      }
      try {
        const rollbackPersisted = await persistCachedFlag(
          previousFlagColour,
          previousFlagName,
        );
        if (!rollbackPersisted) return;
      } catch {
        // The original cache remains the source of truth if persistence is unavailable.
      }
      setSelectedFlagColour(previousFlagColour);
      setFlagError(flagUpdateErrorMessage(error));
      notification('error');
    } finally {
      flagMutationInFlightRef.current = false;
      setIsSavingFlag(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Transaction' }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustsScrollIndicatorInsets
      >
        <View style={styles.hero}>
          <Caption1 color="secondary" style={styles.eyebrow}>TRANSACTION</Caption1>
          <Title1 accessibilityRole="header">{payee}</Title1>
          <LargeTitle
            style={projection.status === 'incoming' ? styles.incoming : undefined}
            accessibilityLabel={projection.status === 'incoming'
              ? `Incoming ${formatTransactionAmount(projection, formatting)}`
              : `Spent ${formatTransactionAmount(projection, formatting)}`}
          >
            {formatTransactionAmount(projection, formatting)}
          </LargeTitle>
          <Footnote color="secondary">
            {formatActivityDate(transaction.date)} · {projection.account.name ?? 'Unknown account'}
          </Footnote>
        </View>

        <View
          style={styles.rewardHero}
          accessible
          accessibilityRole="summary"
          accessibilityLabel={[statusCopy, reward, rewardDetail, getRewardExplanation(projection, formatting)].filter(Boolean).join(', ')}
        >
          <View style={styles.spark} accessibilityElementsHidden>
            <SparkIcon width={42} height={42} />
          </View>
          <View style={styles.rewardCopy} accessibilityElementsHidden>
            <StatusPill
              label={statusCopy}
              tone={rewardStatusTone(projection.status)}
              size="small"
              accessible={false}
            />
            <Headline color={isEarning ? 'positive' : 'secondary'} style={styles.rewardValue}>
              {reward}
            </Headline>
            {rewardDetail ? <Footnote color="secondary">{rewardDetail}</Footnote> : null}
            <Body color="secondary">{getRewardExplanation(projection, formatting)}</Body>
          </View>
        </View>

        <View style={styles.section}>
          <Headline accessibilityRole="header" style={styles.sectionTitle}>Reward calculation</Headline>
          <Card>
            <DetailRow
              isFirst
              label="Card"
              value={projection.card?.name ?? 'No tracked card'}
            />
            <DetailRow label="Earning rate" value={formatRewardRate(projection, formatting)} />
            {block ? (
              <>
                <DetailRow label="Block size" value={formatting.currency(block.size)} />
                <DetailRow label="Blocks counted" value={formatting.number(block.count)} />
                <DetailRow label="Eligible amount" value={formatting.currency(block.eligibleAmount)} />
                <DetailRow label="Below block" value={formatting.currency(block.remainder)} />
              </>
            ) : null}
            {projection.reward.type === 'miles' ? (
              <DetailRow label="Estimated value" value={formatting.currency(projection.reward.dollars)} />
            ) : null}
          </Card>
        </View>

        <View style={styles.section}>
          <Headline accessibilityRole="header" style={styles.sectionTitle}>YNAB flag</Headline>
          <Card>
            <FlagPicker
              value={selectedFlagColour}
              onChange={handleFlagChange}
              isSaving={isSavingFlag}
              error={flagError}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <Headline accessibilityRole="header" style={styles.sectionTitle}>Transaction details</Headline>
          <Card>
            <DetailRow isFirst label="Date" value={formatActivityDate(transaction.date)} />
            <DetailRow label="Account" value={projection.account.name ?? 'Unknown account'} />
            <DetailRow label="Category" value={transaction.category_name?.trim() || 'Uncategorised'} />
            <DetailRow label="Cleared" value={formatClearedState(transaction.cleared)} />
            <DetailRow label="Approved" value={transaction.approved ? 'Yes' : 'No'} />
          </Card>
        </View>

        <Footnote color="secondary" style={styles.disclaimer}>
          Rewards are estimates from your card settings. Your issuer’s posted reward may differ.
        </Footnote>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  content: {
    paddingHorizontal: nativeMetrics.screenGutter,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.xxl,
  },
  missing: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  hero: {
    gap: spacing.sm,
  },
  eyebrow: {
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  incoming: {
    color: semanticColors.positive,
  },
  rewardHero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    paddingVertical: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.separator,
  },
  spark: {
    width: 52,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rewardCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  rewardValue: {
    fontSize: 24,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    paddingHorizontal: spacing.xs,
  },
  detailRow: {
    minHeight: nativeMetrics.minimumTouchTarget,
  },
  detailRowContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.xl,
  },
  detailLabel: {
    flexShrink: 0,
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
  },
  disclaimer: {
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
