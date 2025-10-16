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

type FlagColorClasses = {
  bg: string;
  border: string;
  text: string;
  dot: string;
};

const FLAG_COLOR_CLASSES: Record<YnabFlagColor, FlagColorClasses> = {
  red: {
    bg: 'bg-transparent',
    border: 'border-border',
    text: 'text-red-700 dark:text-red-300',
    dot: 'bg-red-500'
  },
  orange: {
    bg: 'bg-transparent',
    border: 'border-border',
    text: 'text-orange-700 dark:text-orange-300',
    dot: 'bg-orange-500'
  },
  yellow: {
    bg: 'bg-transparent',
    border: 'border-border',
    text: 'text-yellow-700 dark:text-amber-200',
    dot: 'bg-yellow-500'
  },
  green: {
    bg: 'bg-transparent',
    border: 'border-border',
    text: 'text-green-700 dark:text-emerald-200',
    dot: 'bg-green-500'
  },
  blue: {
    bg: 'bg-transparent',
    border: 'border-border',
    text: 'text-blue-700 dark:text-blue-200',
    dot: 'bg-blue-500'
  },
  purple: {
    bg: 'bg-transparent',
    border: 'border-border',
    text: 'text-purple-700 dark:text-purple-200',
    dot: 'bg-purple-500'
  },
  unflagged: {
    bg: 'bg-transparent',
    border: 'border-border',
    text: 'text-gray-700 dark:text-slate-300',
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

function hexToRgb(hex: string) {
  const normalised = hex.replace('#', '');

  const bigint = parseInt(normalised, 16);
  if (normalised.length === 3) {
    const r = (bigint >> 8) & 0xf;
    const g = (bigint >> 4) & 0xf;
    const b = bigint & 0xf;
    return {
      r: (r << 4) | r,
      g: (g << 4) | g,
      b: (b << 4) | b,
    };
  }

  const r = (bigint >> 16) & 0xff;
  const g = (bigint >> 8) & 0xff;
  const b = bigint & 0xff;
  return { r, g, b };
}

export function getFlagClasses(flagColor?: string | null) {
  if (!flagColor) {
    return FLAG_COLOR_CLASSES[UNFLAGGED_FLAG.value];
  }

  const normalised = flagColor.toLowerCase() as YnabFlagColor;
  return FLAG_COLOR_CLASSES[normalised] ?? FLAG_COLOR_CLASSES[UNFLAGGED_FLAG.value];
}

export function getFlagBorderColor(flagColor?: string | null, alpha = 0.45) {
  const hex = getFlagHex(flagColor);
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

