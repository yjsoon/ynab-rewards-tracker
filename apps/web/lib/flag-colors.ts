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

const FLAG_COLOR_CLASSES: Record<YnabFlagColor, { bg: string; border: string; text: string; dot: string }> = {
  red: {
    bg: 'bg-red-50 dark:bg-red-950/20',
    border: 'border-red-200 dark:border-red-900',
    text: 'text-red-700 dark:text-red-300',
    dot: 'bg-red-500'
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-950/20',
    border: 'border-orange-200 dark:border-orange-900',
    text: 'text-orange-700 dark:text-orange-300',
    dot: 'bg-orange-500'
  },
  yellow: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/20',
    border: 'border-yellow-200 dark:border-yellow-900',
    text: 'text-yellow-700 dark:text-yellow-300',
    dot: 'bg-yellow-500'
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-950/20',
    border: 'border-green-200 dark:border-green-900',
    text: 'text-green-700 dark:text-green-300',
    dot: 'bg-green-500'
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    border: 'border-blue-200 dark:border-blue-900',
    text: 'text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500'
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/20',
    border: 'border-purple-200 dark:border-purple-900',
    text: 'text-purple-700 dark:text-purple-300',
    dot: 'bg-purple-500'
  },
  unflagged: {
    bg: 'bg-gray-50 dark:bg-gray-950/20',
    border: 'border-gray-200 dark:border-gray-900',
    text: 'text-gray-700 dark:text-gray-300',
    dot: 'bg-gray-500'
  },
};

export function getFlagHex(flagColor?: string | null): string {
  if (!flagColor) {
    return FLAG_COLOR_HEX[UNFLAGGED_FLAG.value];
  }

  const normalised = flagColor.toLowerCase() as YnabFlagColor;
  return FLAG_COLOR_HEX[normalised] ?? FLAG_COLOR_HEX[UNFLAGGED_FLAG.value];
}

export function getFlagClasses(flagColor?: string | null) {
  if (!flagColor) {
    return FLAG_COLOR_CLASSES[UNFLAGGED_FLAG.value];
  }

  const normalised = flagColor.toLowerCase() as YnabFlagColor;
  return FLAG_COLOR_CLASSES[normalised] ?? FLAG_COLOR_CLASSES[UNFLAGGED_FLAG.value];
}

