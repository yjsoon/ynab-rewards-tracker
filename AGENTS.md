# YJAB - YNAB Journal of Awards & Bonuses

A client-side rewards tracker spanning a production-ready web app and an early-stage mobile companion. Both platforms analyse YNAB transactions (real in web, demo in mobile) to track credit card rewards with user-defined rules. All user data continues to live in browser or device storage — no server database is used.

## Platforms Overview

- **Web App (`apps/web`)**: Fully featured, production-ready experience with complete YNAB integration, rewards calculation engine, storage persistence, and dashboard analytics.
- **Mobile App (`apps/mobile`)**: Expo-based companion app with complete UI flows (Home, Settings, Transactions, Recommendations) backed by hardcoded demo data while core integrations are under development.
- **Shared Foundation (`packages/app-core`)**: Cross-platform rewards engine, storage types, and utilities consumed by both apps.

## Tech Stack

### Web App (`apps/web`)
- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui + Radix UI primitives
- `next-themes` for light/dark/system modes
- Browser `localStorage` persistence via storage service
- YNAB API proxied through `/api/ynab/*` routes (bearer PAT)
- React hooks + Context API for state management

### Mobile App (`apps/mobile`)
- Expo (React Native 0.81) with Expo Router
- TypeScript + Tamagui component system and theming
- `@react-navigation/native` + Expo Router tabs
- `expo-haptics`, `expo-constants`, `expo-secure-store`
- `@react-native-async-storage/async-storage` (planned for persistence)
- React Native Safe Area, Gesture Handler, Reanimated, SVG for platform affordances

### Shared Foundation (`packages/app-core`)
- Rewards calculation engine, recommendation helpers, and matcher utilities
- Storage type definitions, constants, and helpers for local persistence
- Shared date utilities, minimum spend helpers, and YNAB client abstractions

## Current Feature Matrix

| Capability | Web (apps/web) | Mobile (apps/mobile) |
| --- | --- | --- |
| UI Screens & Navigation | ✅ | ✅ Demo UI |
| YNAB Authentication & Sync | ✅ | ❌ Missing |
| Rewards Calculation Engine | ✅ | ⏳ Demo (sample data) |
| Storage Persistence | ✅ | ❌ Missing |
| Card CRUD & Settings | ✅ | ❌ Missing |
| Transaction Fetching | ✅ | ⏳ Demo (seeded list) |
| Recommendations & Insights | ✅ | ⏳ Static content |

## Mobile Feature Gaps

- Operates entirely in demo mode via `useDemoRewards`; lacks live YNAB API token capture or refresh.
- No persistent storage yet; AsyncStorage integration and syncing are pending.
- Card CRUD flows (create, edit, archive) are absent — UI currently assumes a single demo card.
- Rewards calculations rely on shared engine but are not wired to real transactions.
- Real transaction fetching, filtering, and categorisation are not connected.
- Settings screen buttons trigger haptics but do not yet initiate authentication or syncing flows.

## Core Features

The production web app currently delivers the following capabilities (the mobile app reuses the same concepts but remains demo-only until integrations land).

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
apps/
├── web/                      # Next.js production app
│   ├── app/                  # App Router routes (dashboard, cards, settings, API)
│   ├── components/           # Shadcn/ui-based components
│   ├── lib/                  # Rewards engine entry points, storage service, utilities
│   └── hooks/                # React hooks for data fetching and state
├── mobile/                   # Expo + React Native companion app
│   ├── app/                  # Expo Router tabs (Home, Transactions, Recommendations, Settings)
│   ├── components/ios/       # iOS-inspired primitives (Card, Button, Typography)
│   ├── src/hooks/            # Mobile-specific hooks (demo rewards, haptics, keyboard)
│   └── theme/                # Semantic colour tokens shared across screens
packages/
├── app-core/                 # Shared rewards engine, storage types, utilities
├── core/                     # Additional core utilities (legacy)
├── db/                       # Database layer (unused in client-only apps)
├── worker/                   # Background compute scripts
└── ynab-client/              # YNAB API client abstractions
```

## Architecture Patterns

- Both apps consume the shared rewards engine and storage types from `packages/app-core`, ensuring consistent calculations and data structures.
- Web persists data via the `storage.ts` service (browser `localStorage`); mobile will mirror this through an AsyncStorage-backed implementation once persistence ships.
- Mobile demo data is generated through `useDemoRewards`, which wraps the shared simple calculator in a mocked environment to validate UI flows before live wiring.
- API interactions remain centralised in the web app's `/api/ynab/*` routes; future mobile work will reuse `packages/ynab-client` for direct device-side calls.

## Data Model

### Resetting Local Storage
- Browser state lives under `ynab-rewards-tracker` key
- Bump `STORAGE_VERSION` in `apps/web/lib/storage.ts` to force-clear cached data

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
- Vercel recommended for Next.js apps
- Expo EAS or local builds planned for mobile once integrations land
- No environment variables needed for the web app (fully client-side)
- Static export possible with some limitations

## Roadmap

### Web Roadmap

#### P1 — Next Actions
- [ ] Persist per-transaction category overrides
- [ ] Shared TransactionsList component for reuse
- [ ] Calculator window enforcement with tests
- [ ] Comprehensive test coverage for calculator & recommendations
- [ ] Accessibility improvements (labels, ARIA)

#### P2 — Quality & UX
- [ ] Branding assets (favicon, OG images)
- [ ] Recommendations "why" tooltips
- [ ] Progress & limits UX improvements
- [ ] MappingForm extraction for reuse

#### P3 — Enhancements
- [ ] Transaction period overrides (local only)
- [ ] Background refresh while app is open
- [ ] Debug tooling for rewards engine

### Mobile Roadmap

1. **Phase 1 — Foundation**: Introduce storage context, navigation guards, and real app-core wiring; replace demo card with shared types.
2. **Phase 2 — YNAB Connectivity**: Implement PAT capture, budget selection, and transaction fetching using `packages/ynab-client`.
3. **Phase 3 — Persistence & Sync**: Add AsyncStorage-backed persistence, sync flows, and initial cloud sync parity.
4. **Phase 4 — Rewards Integration**: Hook live transactions into the shared rewards engine, surface progress, and enable card CRUD flows.
5. **Phase 5 — Parity & Polish**: Align recommendations, accessibility, and visual polish with the web experience; prepare for TestFlight/Play Store distribution.

## Contributing Guidelines
- TypeScript-first development
- Follow existing patterns and conventions
- Test calculations thoroughly
- Keep commits atomic and descriptive
- British spelling in user-facing copy
- US spelling in code identifiers

## What NOT to Do
- ❌ Store PAT in exports or backups
- ❌ Reintroduce manual (non-YNAB) cards
- ❌ Mix reward units when comparing
- ❌ Access localStorage directly (use storage.ts)
- ❌ Hardcode currency symbols or values
- ❌ Create server-side dependencies
