import React from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { interaction, nativeMetrics } from '../../theme/tokens';
import { StatusPill, type StatusTone } from './StatusPill';

export type SyncState = 'synced' | 'syncing' | 'attention' | 'offline';

export interface SyncBadgeProps {
  state: SyncState;
  label?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

const statePresentation: Record<SyncState, { label: string; tone: StatusTone }> = {
  synced: { label: 'Up to date', tone: 'positive' },
  syncing: { label: 'Syncing…', tone: 'accent' },
  attention: { label: 'Sync needs attention', tone: 'attention' },
  offline: { label: 'Offline', tone: 'neutral' },
};

/** Sync status can be display-only or a full 44pt retry/refresh target. */
export function SyncBadge({
  state,
  label,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
}: SyncBadgeProps) {
  const presentation = statePresentation[state];
  const resolvedLabel = label ?? presentation.label;
  const badge = (
    <StatusPill
      label={resolvedLabel}
      tone={presentation.tone}
      size="small"
      accessible={!onPress}
      accessibilityLabel={accessibilityLabel}
      style={!onPress ? style : undefined}
    />
  );

  if (!onPress) {
    return badge;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? resolvedLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: state === 'syncing' }}
      style={({ pressed }) => [
        styles.pressable,
        pressed && styles.pressed,
        style,
      ]}
    >
      {badge}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: nativeMetrics.minimumTouchTarget,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
