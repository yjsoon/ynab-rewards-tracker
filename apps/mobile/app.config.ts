import type { ConfigContext, ExpoConfig } from '@expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Rewards Tracker',
  slug: 'rewards-tracker-ynab',
  scheme: 'rewardstracker',
  version: '0.1.0',
  orientation: 'portrait',
  platforms: ['ios', 'android'],
  plugins: ['expo-router'],
  extra: {
    ...config.extra,
    expoRouter: {
      origin: 'http://localhost',
    },
  },
  updates: {
    ...config.updates,
    fallbackToCacheTimeout: 0,
  },
  ios: {
    ...config.ios,
    supportsTablet: true,
  },
  android: {
    ...config.android,
  },
  experiments: {
    ...config.experiments,
    typedRoutes: true,
  },
});
