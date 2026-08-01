import type { ConfigContext, ExpoConfig } from '@expo/config';

const createExpoConfig = ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Rewards Tracker',
  slug: 'rewards-tracker-ynab',
  scheme: 'rewardstracker',
  version: '0.1.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  platforms: ['ios', 'android'],
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F2F2F7',
        dark: { backgroundColor: '#000000' },
      },
    ],
  ],
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
    userInterfaceStyle: 'light',
  },
  experiments: {
    ...config.experiments,
    typedRoutes: true,
  },
});

export default createExpoConfig;
