/**
 * Input validation utilities for secure form handling
 */

/**
 * Sanitizes user input to prevent XSS attacks
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';
  
  // Remove any script tags and dangerous HTML
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

/**
 * Validates a YNAB Personal Access Token format
 */
export function validateYnabToken(token: string): { valid: boolean; error?: string } {
  if (!token) {
    return { valid: false, error: 'Token is required' };
  }

  // YNAB tokens are typically 64 characters long and contain only alphanumeric chars and hyphens
  if (token.length < 20) {
    return { valid: false, error: 'Token appears to be too short' };
  }

  if (!/^[a-zA-Z0-9-]+$/.test(token)) {
    return { valid: false, error: 'Token contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validates issuer input
 */
export function validateIssuer(issuer: string): { valid: boolean; error?: string } {
  const sanitized = sanitizeInput(issuer);
  if (!sanitized) {
    return { valid: false, error: 'Issuer is required' };
  }
  if (sanitized.length < 2) {
    return { valid: false, error: 'Issuer must be at least 2 characters' };
  }
  if (sanitized.length > 100) {
    return { valid: false, error: 'Issuer must be 100 characters or less' };
  }
  return { valid: true };
}
