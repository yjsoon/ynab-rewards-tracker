# YJAB - YNAB Journal of Awards & Bonuses

A client-side rewards tracker spanning a production-ready web app and an in-progress mobile companion. Both platforms analyse YNAB transactions to track credit card rewards with user-defined rules. All user data lives in browser or device storage — no server database is used. The mobile app is actively integrating live storage/sync flows and continues to rely on demo data until current work (tracked in bd) is completed.

## Platforms Overview

- **Web App (`apps/web`)**: Fully featured, production-ready experience with complete YNAB integration, rewards calculation engine, storage persistence, and dashboard analytics. The Recommendations page is temporarily hidden from navigation (not ready for production).
- **Mobile App (`apps/mobile`)**: Expo-based companion app currently wiring up live YNAB integration, AsyncStorage persistence, and rewards calculations. Home and Settings screens are mid-integration; card management UI and remaining tab screens still need implementation. The Recommendations tab is temporarily hidden (not ready for production).
- **Shared Foundation (`packages/app-core`)**: Cross-platform rewards engine, storage types, and utilities consumed by both apps.

## Tech Stack

### Web App (`apps/web`)
- Next.js 14 (App Router) + TypeScript
- Hosted on Cloudflare Workers via `@opennextjs/cloudflare`
- Tailwind CSS + shadcn/ui + Radix UI primitives
- `next-themes` for light/dark/system modes
- Browser `localStorage` persistence via storage service
- Cloud sync via Cloudflare KV (native bindings in production)
- YNAB API proxied through `/api/ynab/*` routes (bearer PAT)
- React hooks + Context API for state management

### Mobile App (`apps/mobile`)
- Expo (React Native 0.81) with Expo Router
- TypeScript + Tamagui component system and theming
- `@react-navigation/native` + Expo Router tabs
- `expo-haptics`, `expo-constants`, `expo-secure-store` (for PAT security)
- `@react-native-async-storage/async-storage` (persistence layer under active integration)
- React Native Safe Area, Gesture Handler, Reanimated, SVG for platform affordances
- Direct YNAB API integration via native fetch (no proxy required)

### Shared Foundation (`packages/app-core`)
- Rewards calculation engine, recommendation helpers, and matcher utilities
- Storage type definitions, constants, and helpers for local persistence
- Shared date utilities, minimum spend helpers, and YNAB client abstractions

## Current Status Snapshot

| Area | Web (apps/web) | Mobile (apps/mobile) |
| --- | --- | --- |
| UI Screens & Navigation | Stable and production-ready; Recommendations hidden | Core tabs scaffolded; several flows incomplete |
| YNAB Authentication & Sync | Fully functional | StorageContext and PAT flows under active development; live sync not yet validated end-to-end |
| Rewards Calculation Engine | Production usage | Shares engine, but mobile still mixes demo data with partial live wiring |
| Storage Persistence | Browser localStorage service | AsyncStorage + SecureStore integration in progress |
| Card & Rule Management | Complete CRUD | UI missing; tracked in bd |
| Transactions & Analytics | Full parity; Recommendations hidden | Transactions tab pending live wiring; Recommendations tab temporarily hidden |

All actionable work should be tracked in **bd**. This document is an architectural reference—do not maintain TODOs here. When new tasks arise, log or update a bd issue instead.

> Note: Until bd issues confirm the live storage/sync flow is complete, assume the mobile app falls back to `useDemoRewards`.

## Core Features

The production web app currently delivers the following capabilities. The mobile app implements most infrastructure but lacks UI for card/rules management.

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
- Per-transaction overrides (planned)

### Rewards Calculation Engine
- Period-based calculations (monthly or billing cycle)
- Progress tracking for minimum/maximum spend
- "Stop using" alerts when maximum spend reached
- Eligible spend calculation (respecting both minimum and maximum)
- Normalised dollar values for cross-card comparison
- Real-time recomputation with caching

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

## Issue Tracking with bd

This repository uses the bd CLI (from the Beads project) for issue tracking. The database is initialized at `.beads/ynab-counter.db` and bd auto-discovers it from the repo root.

Common commands:
- Show ready work: `bd ready`
- List all issues: `bd list`
- Show details: `bd show ynab-counter-<id>`
- Create a new issue:
  - `bd create "Title" -d "Description" -l mobile,P0,ui -p 0 -t feature`
- Close/reopen: `bd close ynab-counter-<id>` / `bd reopen ynab-counter-<id>`
- Blocked view: `bd blocked`

Labels and priorities:
- Labels in use: `mobile`, `P0`, `P1`, `P2`, `ui`, `infra`
- Priority flag `-p` ranges 0 (highest) to 4 (lowest)

Notes:
- bd walks up like git to find `.beads/`
- Issues are per-repo; use `bd list` and `bd ready` to navigate work
- For advanced usage, see Beads documentation: https://github.com/steveyegge/beads
apps/
├── web/                      # Next.js production app
│   ├── app/                  # App Router routes (dashboard, cards, settings, API)
│   ├── components/           # Shadcn/ui-based components
│   ├── lib/                  # Rewards engine entry points, storage service, utilities
│   └── hooks/                # React hooks for data fetching and state
├── mobile/                   # Expo + React Native companion app
│   ├── app/                  # Expo Router tabs (Home, Transactions, Recommendations, Settings)
│   ├── components/ios/       # iOS-inspired primitives (Card, Button, Typography)
│   ├── src/
│   │   ├── contexts/         # StorageContext with state management & sync orchestration
│   │   ├── hooks/            # Mobile-specific hooks (demo rewards, haptics, keyboard)
│   │   ├── lib/              # YNAB client, API wrappers, sync service
│   │   ├── storage/          # AsyncStorage service & persistence layer
│   │   └── theme/            # Semantic colour tokens shared across screens
packages/
├── app-core/                 # Shared rewards engine, storage types, utilities
├── core/                     # Additional core utilities (legacy)
├── db/                       # Database layer (unused in client-only apps)
├── worker/                   # Background compute scripts
└── ynab-client/              # YNAB API client abstractions
```

## Architecture Patterns

- Both apps consume the shared rewards engine and storage types from `packages/app-core`, ensuring consistent calculations and data structures.
- Web persists data via `storage.ts` service (browser `localStorage`); mobile mirrors this through AsyncStorage with SecureStore for sensitive PAT storage.
- Mobile uses `useDemoRewards` as fallback when no cards configured, otherwise computes live rewards from cached YNAB transactions.
- Web routes YNAB API calls through `/api/ynab/*` proxy; mobile makes direct API calls using native fetch with built-in retry and rate limiting.
- Both apps use React Context (`StorageContext`) for state management with automatic hydration and sync orchestration.

## Data Model

### Resetting Local Storage
- **Web**: Browser state lives under `ynab-rewards-tracker` key. Bump `STORAGE_VERSION` in `apps/web/lib/storage.ts` to force-clear cached data
- **Mobile**: AsyncStorage uses `ynab-rewards-tracker:` prefix. Bump `STORAGE_VERSION` in `packages/app-core/src/storage/constants.ts` to force-clear cached data. PAT stored separately in SecureStore for security

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
- No server-side data storage

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
- `pnpm --filter ./apps/web lint`
- `pnpm --filter ./apps/web typecheck`
- `pnpm --filter ./apps/mobile typecheck`
- `pnpm test` — repository-wide tests (web coverage currently most comprehensive)

## Testing Strategy
- Unit tests for calculation logic
- Integration tests for YNAB API proxy
- Component tests for critical UI flows (web)
- Mobile testing focus pending integration work; current priority is wiring real data before UI regression coverage
- Manual testing for edge cases

## Deployment

### Web App
- Hosted on **Cloudflare Workers** via OpenNext adapter
- Auto-deploys on push to `main` via GitHub Actions
- Live at https://rewards.soon.sg
- Cloud sync uses native Cloudflare KV bindings (no REST API overhead)
- Manual deploy: `pnpm --filter ./apps/web deploy:cloudflare`

### Mobile App
- Expo EAS or local builds planned once integrations land

## Roadmap & Task Management

Roadmaps and priorities are maintained in bd. Use the CLI (`bd ready`, `bd list`, `bd show`, `bd close`, `bd reopen`) to inspect and update the backlog. Keep this document focused on architecture; do not add checklists or TODO items here.

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
- **Current flags**:
  - `recommendations`: Smart card suggestions (currently `false` - not ready for production)
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
