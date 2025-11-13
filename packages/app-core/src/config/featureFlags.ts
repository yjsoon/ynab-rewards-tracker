/**
 * Feature Flags
 *
 * Centralized feature flag configuration for both web and mobile apps.
 * All flags are static - changing them requires a rebuild.
 *
 * Usage:
 *   import { featureFlags } from '@ynab-counter/app-core/config/featureFlags';
 *
 *   // In React components:
 *   {featureFlags.recommendations && <RecommendationsTab />}
 *
 *   // In arrays (using spread):
 *   const items = [
 *     { name: 'Home' },
 *     ...(featureFlags.recommendations ? [{ name: 'Recommendations' }] : []),
 *   ];
 */

export const featureFlags = {
  /**
   * Recommendations feature - Smart card suggestions based on spending patterns
   * Currently disabled as the feature needs further testing and refinement
   */
  recommendations: false,
} as const;

// Type helper for autocomplete and type safety
export type FeatureFlags = typeof featureFlags;
export type FeatureFlagKey = keyof FeatureFlags;
