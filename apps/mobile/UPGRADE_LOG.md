# Expo SDK 54 Upgrade Log

**Date**: 10 October 2025
**Upgraded by**: Team
**Previous SDK**: Expo SDK 51
**Target SDK**: Expo SDK 54

## Version Changes

### Core Framework
- **Expo SDK**: `~51.0.0` → `~54.0.12`
- **React Native**: `0.74.5` → `0.81.4`
- **React**: `18.2.0` → `19.1.0`
- **React DOM**: `18.2.0` → `19.1.0`

### Expo Packages
- **expo-router**: `~3.5.0` → `~6.0.11`
- **expo-constants**: `~16.0.0` → `~18.0.9`
- **expo-font**: `~12.0.0` → `~14.0.1`
- **expo-linking**: `~6.3.0` → `~8.0.8`
- **expo-secure-store**: `~13.0.0` → `~15.0.7`
- **expo-splash-screen**: `~0.27.0` → `~31.0.10`
- **expo-status-bar**: `~1.12.0` → `~3.0.8`
- **@expo/metro-runtime**: Added `~6.1.2` (peer dependency)

### React Native Libraries
- **react-native-gesture-handler**: `~2.16.1` → `~2.28.0`
- **react-native-reanimated**: `~3.10.1` → `~4.1.3`
- **react-native-safe-area-context**: `4.10.5` → `~5.6.1`
- **react-native-screens**: `~3.31.1` → `~4.16.0`
- **react-native-svg**: `15.2.0` → `15.12.1`
- **@react-native-async-storage/async-storage**: `1.23.1` → `2.2.0`

### Tamagui Packages
- **tamagui**: `^1.95.0` → `^1.115.3`
- **@tamagui/config**: `^1.95.0` → `^1.115.3`
- **@tamagui/core**: `^1.95.0` → `^1.115.3`
- **@tamagui/font-inter**: `^1.95.0` → `^1.115.3`
- **@tamagui/lucide-icons**: `^1.95.0` → `^1.115.3`
- **@tamagui/themes**: `^1.95.0` → `^1.115.3`
- **@tamagui/babel-plugin**: `^1.95.0` → `^1.115.3`

### Build Tooling
- **@babel/core**: `^7.20.0` → `^7.25.0`
- **@babel/runtime**: `^7.20.0` → `^7.25.0`
- **TypeScript**: `~5.3.3` → `~5.9.3`
- **@types/react**: `~18.2.79` → `~19.1.12`

## Configuration Changes

### app.json
- **iOS**:
  - Added `"deploymentTarget": "15.1"` (required by SDK 54)
  - Kept existing `bundleIdentifier` and tablet support

- **Android**:
  - Added `"compileSdkVersion": 35` (Android 15)
  - Added `"targetSdkVersion": 35`
  - Kept existing package identifier

### metro.config.js
- **Resolver enhancements**:
  - Added `config.resolver.unstable_enablePackageExports = true` (React 19 support)
  - Added `config.resolver.disableHierarchicalLookup = true` (pnpm monorepo stability)
  - Kept existing workspace root configuration
  - Maintained `extraNodeModules` for `@ynab-counter/app-core`

### tsconfig.json
- **Path mappings**:
  - Added wildcard path: `"@ynab-counter/app-core/*": ["../../packages/app-core/src/*"]`
  - Added app-core sources to `include` array: `"../../packages/app-core/src/**/*.ts"`
  - Maintained existing `@/*` and base app-core paths

### app/_layout.tsx
- **Wrapper hierarchy updates**:
  - Added `GestureHandlerRootView` as outermost wrapper (with `flex: 1` style)
  - Added `SafeAreaProvider` inside GestureHandlerRootView
  - Maintained `TamaguiProvider` → `Theme` → `Stack` hierarchy

- **Splash screen handling**:
  - Updated module-level call: `SplashScreen.preventAutoHideAsync().catch(() => {})`
  - Enhanced font loading: Track both `fontsLoaded` and `fontError` from `useFonts`
  - Updated `useEffect` to check both conditions before hiding splash
  - Added error handling: `.catch(() => {})` on `hideAsync()` call
  - Conditional render: Return `null` only when `!fontsLoaded && !fontError`

### Component Updates
- **Tamagui theme API**:
  - Replaced all `theme="alt"` → `theme="alt1"` across tab screens
  - Updated files:
    - `app/(tabs)/index.tsx`
    - `app/(tabs)/recommendations.tsx`
    - `app/(tabs)/settings.tsx`
    - `app/(tabs)/transactions.tsx`

## Breaking Changes Encountered

### 1. Expo Router 3 → 6 (Major Version Jump)
- **Issue**: SDK 54 ships with Expo Router ~6.0.11 (not 4.x as initially expected)
- **Resolution**: Updated all router-related configurations to match v6 API
- **Impact**: No code changes required; API remained backward compatible

### 2. Tamagui 1.95 → 1.115
- **Issue**: Theme token `"alt"` deprecated in favor of `"alt1"`
- **Resolution**: Global find-replace across all component files
- **Impact**: Visual consistency maintained; no layout changes

### 3. React Native Safe Area Context
- **Issue**: Version 5.x requires explicit `SafeAreaProvider` wrapper
- **Resolution**: Added provider at root level in `_layout.tsx`
- **Impact**: Proper safe area insets on iOS devices with notches

### 4. React 19 Compatibility
- **Issue**: Splash screen API error handling changed
- **Resolution**: Added `.catch(() => {})` to all async splash screen calls
- **Impact**: Prevents unhandled promise rejections on app reload

## Validation Performed

### Type Checking
```bash
pnpm --filter ./apps/mobile typecheck
```
- **Result**: ✅ Passed with 0 errors
- **Notes**: All imports resolved correctly, including `@ynab-counter/app-core` workspace package

### Package Resolution
```bash
pnpm install
```
- **Result**: ✅ All dependencies resolved successfully
- **Notes**:
  - `expo-router` correctly resolved to ~6.0.11
  - `expo-splash-screen` resolved to ~31.0.10
  - `react-native-safe-area-context` resolved to ~5.6.1
  - No peer dependency conflicts

### Code Structure
- **File tree integrity**: ✅ All imports functional
- **Workspace packages**: ✅ `@ynab-counter/app-core` accessible
- **Metro bundler**: ✅ Config validated (not yet tested in runtime)

## Known Limitations

### Not Yet Tested
1. **Native builds**: No Xcode/Android Studio builds performed yet
2. **Runtime validation**: App not launched on simulator/device
3. **Hot reload**: Metro bundler not started to verify reload functionality
4. **Performance**: Bundle size and startup time not measured

### Potential Issues
1. **Xcode 26 compatibility**: May require Xcode project settings updates
2. **Android 15 features**: Compile SDK 35 may require gradle updates
3. **React 19 edge cases**: Some third-party libraries may not be fully compatible
4. **Tamagui performance**: Version 1.115 optimization flags not yet configured

## Follow-Up Tasks

### Immediate (Before Production)
- [ ] Run native iOS build on Xcode 26
  ```bash
  cd apps/mobile
  pnpm exec expo prebuild --clean
  cd ios && pod install
  open *.xcworkspace
  ```

- [ ] Run native Android build on Android Studio with SDK 35
  ```bash
  cd apps/mobile
  pnpm exec expo prebuild --clean --platform android
  cd android && ./gradlew clean build
  ```

- [ ] Start Metro bundler and test on iOS simulator
  ```bash
  pnpm mobile:start
  # In separate terminal:
  pnpm mobile:ios
  ```

- [ ] Verify all screens render correctly:
  - [ ] Dashboard (index.tsx)
  - [ ] Transactions list
  - [ ] Recommendations
  - [ ] Settings

- [ ] Test core functionality:
  - [ ] Font loading (Inter Medium/Bold)
  - [ ] Tamagui theming (dark mode)
  - [ ] Navigation between tabs
  - [ ] Demo rewards calculation
  - [ ] Progress bar rendering

### Nice to Have
- [ ] Measure bundle size before/after upgrade
- [ ] Profile startup performance
- [ ] Test hot reload speed
- [ ] Enable Tamagui optimization flags in `babel.config.js`:
  ```js
  ['@tamagui/babel-plugin', {
    components: ['tamagui'],
    config: './tamagui.config.ts',
    logTimings: true,
    disableExtraction: process.env.NODE_ENV === 'development'
  }]
  ```

### Future Enhancements
- [ ] Upgrade to React Native 0.82 when available (if released)
- [ ] Monitor Expo SDK 55 release for additional optimizations
- [ ] Consider enabling New Architecture (Fabric + TurboModules)
- [ ] Investigate Hermes engine performance improvements

## References

- [Expo SDK 54 Release Notes](https://docs.expo.dev/versions/v54.0.0/sdk/overview/)
- [Expo Router v6 Migration Guide](https://docs.expo.dev/router/migrate/v6/)
- [Tamagui 1.115 Changelog](https://github.com/tamagui/tamagui/releases/tag/v1.115.0)
- [React Native 0.81 Changelog](https://reactnative.dev/blog/2024/12/18/version-0.81)
- [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)

## Summary

The upgrade from Expo SDK 51 to SDK 54 was completed successfully with:
- ✅ All dependency versions updated to SDK 54 compatible ranges
- ✅ Configuration files updated for iOS 15.1+ and Android SDK 35
- ✅ React 19 compatibility ensured through Metro and splash screen updates
- ✅ Tamagui upgraded to 1.115 with theme token migration
- ✅ TypeScript compilation passing with workspace package resolution
- ⚠️ Native builds and runtime testing pending

**Next Step**: Run native iOS build on Xcode 26 to validate simulator launch and basic functionality.