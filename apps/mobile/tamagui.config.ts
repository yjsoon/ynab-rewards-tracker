import { config } from '@tamagui/config/v3';
import { createTamagui } from 'tamagui';
import { colors } from './src/theme/colors';

const appConfig = createTamagui({
  ...config,
  themes: {
    ...config.themes,
    light: {
      ...config.themes.light,
      background: colors.light.background,
      backgroundHover: colors.light.backgroundHover,
      backgroundPress: colors.light.backgroundPress,
      backgroundFocus: colors.light.backgroundHover,
      color: colors.light.text,
      colorHover: colors.light.textSecondary,
      colorPress: colors.light.textSecondary,
      colorFocus: colors.light.textSecondary,
      accent: colors.light.accent,
      success: colors.light.success,
      warning: colors.light.warning,
      error: colors.light.error,
    },
    dark: {
      ...config.themes.dark,
      background: colors.dark.background,
      backgroundHover: colors.dark.backgroundHover,
      backgroundPress: colors.dark.backgroundPress,
      backgroundFocus: colors.dark.backgroundHover,
      color: colors.dark.text,
      colorHover: colors.dark.textSecondary,
      colorPress: colors.dark.textSecondary,
      colorFocus: colors.dark.textSecondary,
      accent: colors.dark.accent,
      success: colors.dark.success,
      warning: colors.dark.warning,
      error: colors.dark.error,
    },
  },
});

type AppTamaguiConfig = typeof appConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}

export default appConfig;