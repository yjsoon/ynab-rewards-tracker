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

  if (!/^[a-zA-Z0-9-_]+$/.test(token)) {
    return { valid: false, error: 'Token contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validates card name input
 */
export function validateCardName(name: string): { valid: boolean; error?: string } {
  const sanitized = sanitizeInput(name);
  
  if (!sanitized) {
    return { valid: false, error: 'Card name is required' };
  }

  if (sanitized.length < 2) {
    return { valid: false, error: 'Card name must be at least 2 characters' };
  }

  if (sanitized.length > 100) {
    return { valid: false, error: 'Card name must be less than 100 characters' };
  }

  return { valid: true };
}

/**
 * Validates issuer name input
 */
export function validateIssuer(issuer: string): { valid: boolean; error?: string } {
  const sanitized = sanitizeInput(issuer);
  
  if (!sanitized) {
    return { valid: false, error: 'Issuer is required' };
  }

  if (sanitized.length < 2) {
    return { valid: false, error: 'Issuer must be at least 2 characters' };
  }

  if (sanitized.length > 50) {
    return { valid: false, error: 'Issuer must be less than 50 characters' };
  }

  return { valid: true };
}

/**
 * Validates URL for safe external linking
 */
export function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Sanitizes file name for safe storage
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255);
}