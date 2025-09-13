export const YNAB_FLAG_COLORS = [
  { value: 'red', label: 'Red', color: '#ef4444' },
  { value: 'orange', label: 'Orange', color: '#f97316' },
  { value: 'yellow', label: 'Yellow', color: '#eab308' },
  { value: 'green', label: 'Green', color: '#22c55e' },
  { value: 'blue', label: 'Blue', color: '#3b82f6' },
  { value: 'purple', label: 'Purple', color: '#a855f7' },
] as const;

export const COMMON_REWARD_CATEGORIES = [
  'Dining',
  'Groceries',
  'Gas',
  'Travel',
  'Online Shopping',
  'Streaming Services',
  'Entertainment',
  'Transit',
  'Hotels',
  'Flights',
  'Rideshare',
  'Drug Stores',
  'Home Improvement',
  'Utilities',
  'Insurance',
  'Mobile Wallet',
  'PayPal',
  'Wholesale Clubs',
  'Department Stores',
  'Sporting Goods',
  'Everything Else',
] as const;

export type YnabFlagColor = typeof YNAB_FLAG_COLORS[number]['value'];
export type RewardCategory = typeof COMMON_REWARD_CATEGORIES[number] | string;