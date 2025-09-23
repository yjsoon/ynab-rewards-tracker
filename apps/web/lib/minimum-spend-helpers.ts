/**
 * Helper functions for minimum spend requirement checks
 */

/**
 * Check if a minimum spend value is configured (not null or undefined)
 */
export function isMinimumSpendConfigured(minimumSpend: number | null | undefined): minimumSpend is number {
  return typeof minimumSpend === 'number';
}

/**
 * Check if a card has a minimum spend requirement (configured and greater than 0)
 */
export function hasMinimumSpendRequirement(minimumSpend: number | null | undefined): minimumSpend is number {
  return isMinimumSpendConfigured(minimumSpend) && minimumSpend > 0;
}

/**
 * Check if minimum spend requirement is met
 */
export function isMinimumSpendMet(
  totalSpend: number, 
  minimumSpend: number | null | undefined
): boolean {
  if (!hasMinimumSpendRequirement(minimumSpend)) {
    return true; // No requirement or explicitly 0 = always met
  }
  return totalSpend >= minimumSpend;
}

/**
 * Calculate minimum spend progress as a percentage
 */
export function calculateMinimumSpendProgress(
  totalSpend: number,
  minimumSpend: number | null | undefined
): number | undefined {
  if (!hasMinimumSpendRequirement(minimumSpend)) {
    return undefined;
  }
  return Math.min(100, (totalSpend / minimumSpend) * 100);
}

/**
 * Get the minimum spend status for display
 */
export function getMinimumSpendStatus(minimumSpend: number | null | undefined): 
  'not-configured' | 'no-minimum' | 'has-minimum' {
  if (!isMinimumSpendConfigured(minimumSpend)) {
    return 'not-configured';
  }
  return minimumSpend === 0 ? 'no-minimum' : 'has-minimum';
}

/**
 * Format minimum spend display text
 */
export function formatMinimumSpendText(minimumSpend: number | null | undefined): string {
  if (!isMinimumSpendConfigured(minimumSpend)) {
    return 'Not configured';
  }
  if (minimumSpend === 0) {
    return 'No minimum required';
  }
  return `$${minimumSpend.toLocaleString()} required`;
}

/**
 * Check if a maximum spend value is configured (not null or undefined)
 */
export function isMaximumSpendConfigured(maximumSpend: number | null | undefined): maximumSpend is number {
  return typeof maximumSpend === 'number';
}

/**
 * Check if a card has a maximum spend limit (configured and greater than 0)
 */
export function hasMaximumSpendLimit(maximumSpend: number | null | undefined): maximumSpend is number {
  return isMaximumSpendConfigured(maximumSpend) && maximumSpend > 0;
}

/**
 * Check if maximum spend limit has been exceeded
 */
export function isMaximumSpendExceeded(
  totalSpend: number,
  maximumSpend: number | null | undefined
): boolean {
  if (!hasMaximumSpendLimit(maximumSpend)) {
    return false; // No limit = never exceeded
  }
  return totalSpend >= maximumSpend;
}

/**
 * Calculate maximum spend progress as a percentage
 */
export function calculateMaximumSpendProgress(
  totalSpend: number,
  maximumSpend: number | null | undefined
): number | undefined {
  if (!hasMaximumSpendLimit(maximumSpend)) {
    return undefined;
  }
  return Math.min(100, (totalSpend / maximumSpend) * 100);
}

/**
 * Get the maximum spend status for display
 */
export function getMaximumSpendStatus(maximumSpend: number | null | undefined):
  'not-configured' | 'no-limit' | 'has-limit' {
  if (!isMaximumSpendConfigured(maximumSpend)) {
    return 'not-configured';
  }
  return maximumSpend === 0 ? 'no-limit' : 'has-limit';
}

/**
 * Format maximum spend display text
 */
export function formatMaximumSpendText(maximumSpend: number | null | undefined): string {
  if (!isMaximumSpendConfigured(maximumSpend)) {
    return 'Not configured';
  }
  if (maximumSpend === 0) {
    return 'No limit';
  }
  return `$${maximumSpend.toLocaleString()} limit`;
}

/**
 * Calculate eligible spend considering maximum limit
 */
export function calculateEligibleSpend(
  totalSpend: number,
  maximumSpend: number | null | undefined
): number {
  if (!hasMaximumSpendLimit(maximumSpend)) {
    return totalSpend; // No limit = all spend eligible
  }
  return Math.min(totalSpend, maximumSpend);
}
