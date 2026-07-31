# Rewards Tracker for YNAB

A client-side rewards tracker with web and mobile apps. Both platforms analyse YNAB transactions to track credit card rewards with user-defined rules. User data lives in browser or device storage; the application does not depend on a server database.

## Platforms Overview

- **Web App (`apps/web`)**: Next.js experience with YNAB integration, rewards calculations, local persistence, cloud sync, and dashboard analytics.
- **Mobile App (`apps/mobile`)**: Expo-based companion using the shared domain model, native YNAB access, AsyncStorage persistence, and SecureStore for the PAT.
- **Shared Foundation (`packages/app-core`)**: Cross-platform rewards engine, storage types, and utilities consumed by both apps.
- **Agent API (`apps/web/app/api/agent/rewards`)**: Stateless endpoint that decrypts Cloud Sync data in memory and recomputes rewards for card limits, category recommendations, and transaction advice.

## Tech Stack

### Web App (`apps/web`)
- Next.js 14 (App Router) + TypeScript
- Hosted on Cloudflare Workers via `@opennextjs/cloudflare`
- Tailwind CSS + shadcn/ui + Radix UI primitives
- `next-themes` for light/dark/system modes
- Browser `localStorage` persistence via storage service
- Cloud sync via native Cloudflare KV bindings in production
- YNAB API proxied through `/api/ynab/*` routes (bearer PAT)
- Agent API docs at `/agent-api` (uses Cloud Sync + PAT per request)
- React hooks + Context API for state management

### Mobile App (`apps/mobile`)
- Expo (React Native 0.81) with Expo Router
- TypeScript + Tamagui component system and theming
- `@react-navigation/native` + Expo Router tabs
- `expo-haptics`, `expo-constants`, `expo-secure-store` (for PAT security)
- `@react-native-async-storage/async-storage` for persistence
- React Native Safe Area, Gesture Handler, Reanimated, SVG for platform affordances
- Direct YNAB API integration via native fetch (no proxy required)

### Shared Foundation (`packages/app-core`)
- Rewards calculation engine, recommendation helpers, and matcher utilities
- Storage type definitions, constants, and helpers for local persistence
- Shared date utilities, minimum spend helpers, and YNAB client abstractions

## Core Features

The web app provides the following capabilities. Check each platform's implementation before assuming feature parity.

### YNAB Integration
- Connect via Personal Access Token (PAT)
- Select budget and track credit card accounts
- Fetch transactions automatically
- All cards are YNAB-linked (no manual cards)

### Credit Card Management
- Support for cashback and miles cards
- Configurable earning rates per card
- Billing cycle tracking (calendar month or custom billing day)
- Active/inactive status for temporary disabling
- Minimum/maximum spend requirements and limits

### Reward Rules System
- Multiple rules per card with time windows
- Category-based reward rates (cashback % or miles per dollar)
- Block-based miles calculation (e.g., "1 mile per $5 spent")
- Spending caps with automatic limiting and priority system

### Tag Mapping & Categories
- Map YNAB flags/tags to reward categories
- Inline category editing in transaction views
- "Apply to tag" shortcut for bulk mappings

### Rewards Calculation Engine
- Period-based calculations (monthly or billing cycle)
- Progress tracking for minimum/maximum spend
- "Stop using" alerts when maximum spend reached
- Eligible spend calculation (respecting both minimum and maximum)
- Normalised dollar values for cross-card comparison
- Real-time recomputation with caching
- Agent API outputs limit signals and transaction advice on demand

### Dashboard & Analytics
- Overview of all tracked cards
- Recent transactions with reward annotations
- Spending status and progress bars
- Last computed timestamp
- Category recommendations for optimal rewards

### Settings & Configuration
- Theme switching (light/dark/system)
- Currency configuration
- Miles valuation settings (dollars per mile)
- Export/import settings (excluding PAT for security)
- Clear all data option

## Project Structure

```
apps/
├── web/                      # Next.js production app
│   ├── app/                  # App Router routes (dashboard, cards, settings, API)
│   ├── components/           # Shadcn/ui-based components
│   ├── lib/                  # Rewards engine entry points, storage service, utilities
│   └── hooks/                # React hooks for data fetching and state
├── mobile/                   # Expo + React Native companion app
│   ├── app/                  # Expo Router tabs (Home, Transactions, Recommendations, Settings)
│   ├── src/
│   │   ├── components/       # Mobile UI components and iOS-inspired primitives
│   │   ├── contexts/         # StorageContext with state management & sync orchestration
│   │   ├── hooks/            # Mobile-specific hooks (haptics, keyboard)
│   │   ├── lib/              # YNAB client, API wrappers, sync service
│   │   ├── storage/          # AsyncStorage service & persistence layer
│   │   └── theme/            # Semantic colour tokens shared across screens
packages/
├── app-core/                 # Shared rewards engine, storage types, utilities
├── db/                       # Database layer (unused in client-only apps)
├── worker/                   # Background compute scripts
└── ynab-client/              # YNAB API client abstractions
```

## Architecture Patterns

- Both apps consume the shared rewards engine and storage types from `packages/app-core`, ensuring consistent calculations and data structures.
- Web persists data via `storage.ts` service (browser `localStorage`); mobile mirrors this through AsyncStorage with SecureStore for sensitive PAT storage.
- Web routes YNAB API calls through `/api/ynab/*` proxy; mobile makes direct API calls using native fetch with built-in retry and rate limiting.
- Both apps use React Context (`StorageContext`) for state management with automatic hydration and sync orchestration.

## Data Model

### Resetting Local Storage
- **Web**: Browser state lives under the shared `STORAGE_KEY`.
- **Mobile**: AsyncStorage uses the shared storage keys; the PAT is stored separately in SecureStore.
- Bump `STORAGE_VERSION` in `packages/app-core/src/storage/constants.ts` when a deliberate cross-platform reset is required.

### Core Entities
```typescript
CreditCard {
  id: string, name: string, issuer: string,
  type: 'cashback' | 'miles', ynabAccountId: string,
  earningRate?: number, earningBlockSize?: number,
  minimumSpend?: number, maximumSpend?: number
}

RewardRule {
  id: string, cardId: string, name: string,
  rewardType: 'cashback' | 'miles', rewardValue: number,
  categories: string[], startDate: string, endDate: string
}

TagMapping {
  id: string, cardId: string, ynabTag: string, rewardCategory: string
}
```

## Key Conventions

### Naming & Units
- Use "dollars" in identifiers (not "USD")
- UI shows `$` symbol but avoids hardcoding currency
- Period labels: `YYYY-MM` (calendar) or `YYYY-MM-DD` (billing)
- All amounts in milliunits internally (YNAB standard)

### Rewards Calculation
- Raw rewards: cashback in dollars, miles in miles
- Normalised values: everything converted to dollars for comparison
- Eligible spend: amount between minimum and maximum that earns rewards
- Block-based calculation: applied per transaction, not on total sums

### Storage & Security
- All reads/writes through `storage.ts` service
- PAT never included in exports/backups
- Cloud Sync is optional and stores client-encrypted payloads in Cloudflare KV; there is no application database

### Brand & Icons
- Master vector and brand guidelines: `design/brand/` (see its README)
- Raster app icons are generated, never hand-edited: `node scripts/generate-icons.mjs`
- In-app brand marks come from `apps/web/components/icons/BrandIcons.tsx`; use these over generic lucide icons for brand moments
- Brand gold is the `--spark` token (Tailwind `text-spark`); brand crimson is `--primary`

## Development

### Prerequisites
- Node.js 18+
- pnpm package manager
- Expo tooling (`pnpm exec expo`) for mobile development

### Setup & Run
```bash
# Install dependencies
pnpm install

# Run web development server (App Router)
pnpm --filter ./apps/web dev

# Run mobile app (choose platform)
pnpm --filter ./apps/mobile start      # Metro bundler (QR code)
pnpm --filter ./apps/mobile ios        # Launch iOS simulator via Expo
pnpm --filter ./apps/mobile android    # Launch Android emulator via Expo
```

### Type Checking & Quality
- `pnpm lint` — lint the web app and shared packages
- `pnpm typecheck` — type-check the web app and shared packages
- `pnpm mobile:typecheck` — type-check the mobile app
- `pnpm test` — lint and run the primary test suites

## Testing Strategy
- Unit tests for calculation logic
- Integration tests for YNAB API proxy
- Component tests for critical UI flows (web)
- Manual testing for edge cases

## Deployment

### Web App
- Hosted on **Cloudflare Workers** via OpenNext adapter
- Auto-deploys on push to `main` via GitHub Actions
- Live at https://rewards.soon.sg
- Cloud sync uses native Cloudflare KV bindings through the custom Worker entrypoint
- Manual deploy: `pnpm --filter ./apps/web deploy:cloudflare`

### Mobile App
- Use the scripts in `apps/mobile/package.json` for local Expo builds. Inspect the current Expo/EAS configuration before changing release workflows.

## Contributing Guidelines
- TypeScript-first development
- Follow existing patterns and conventions
- Test calculations thoroughly
- Keep commits atomic and descriptive
- British spelling in user-facing copy
- US spelling in code identifiers

### Feature Management
This project uses a static feature flag system for managing incomplete or experimental features:

- **Location**: `packages/app-core/src/config/featureFlags.ts`
- **Usage**: Import and use in conditional rendering
  ```typescript
  import { featureFlags } from '@ynab-counter/app-core/config/featureFlags';

  // In arrays (web Navigation):
  ...(featureFlags.recommendations ? [{ href: '/recommendations', ... }] : [])

  // In JSX (mobile tabs):
  {featureFlags.recommendations && <RecommendationsTab />}
  ```
- Treat `featureFlags.ts` as the source of truth for available flags and their current values.
- **Benefits**:
  - Single source of truth for all feature toggles
  - Type-safe with TypeScript autocomplete
  - Easy to see all feature states at a glance
  - Cleaner than comments, no unused code paths
- **Trade-off**: Requires rebuild to toggle (acceptable for this single-developer project)
- **Implementation files**: Keep intact with header comments noting they're behind a flag
- **Routes**: Remain accessible via direct URL for testing even when hidden from navigation

## What NOT to Do
- ❌ Store PAT in exports or backups
- ❌ Reintroduce manual (non-YNAB) cards
- ❌ Mix reward units when comparing
- ❌ Access localStorage directly (use storage.ts)
- ❌ Hardcode currency symbols or values
- ❌ Create server-side dependencies

## Task Source

- Follow the user's request and the checked-in code as the source of truth for current work.
- Do not infer or manage work from repository-local task databases unless the user explicitly asks you to.
- Keep this file focused on durable architecture and conventions, not transient status snapshots or TODO lists.
