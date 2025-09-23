import { UNFLAGGED_FLAG, type YnabFlagColor } from './ynab-constants';

const FLAG_COLOR_HEX: Record<YnabFlagColor, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  unflagged: '#6b7280',
};

export function getFlagHex(flagColor?: string | null): string {
  if (!flagColor) {
    return FLAG_COLOR_HEX[UNFLAGGED_FLAG.value];
  }

  const normalised = flagColor.toLowerCase() as YnabFlagColor;
  return FLAG_COLOR_HEX[normalised] ?? FLAG_COLOR_HEX[UNFLAGGED_FLAG.value];
}

