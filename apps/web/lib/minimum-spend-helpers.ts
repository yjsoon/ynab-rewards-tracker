/**
 * Helper functions for minimum spend requirement checks
 */

/**
 * Check if a minimum spend value is configured (not null or undefined)
 */
export function isMinimumSpendConfigured(minimumSpend: number | null | undefined): boolean {
  return minimumSpend !== null && minimumSpend !== undefined;
}

/**
 * Check if a card has a minimum spend requirement (configured and greater than 0)
 */
export function hasMinimumSpendRequirement(minimumSpend: number | null | undefined): boolean {
  return isMinimumSpendConfigured(minimumSpend) && minimumSpend! > 0;
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
  return totalSpend >= minimumSpend!;
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
  return Math.min(100, (totalSpend / minimumSpend!) * 100);
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
  return `$${minimumSpend!.toLocaleString()} required`;
}