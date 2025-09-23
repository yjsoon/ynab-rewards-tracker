# YJAB - YNAB Journal of Awards & Bonuses

A client‑side rewards tracker that analyses YNAB transactions to track credit card rewards with user‑defined rules. All user data lives in browser localStorage — no server database is used.

## Tech Stack

- **App**: Next.js 14 (App Router) + TypeScript
- **UI**: Tailwind CSS + shadcn/ui + Radix UI primitives
- **Theming**: `next-themes` with light/dark/system modes
- **Data**: Browser `localStorage` (see `apps/web/lib/storage.ts`)
- **YNAB API**: Proxied via `/api/ynab/*` routes (bearer PAT)
- **State Management**: React hooks + Context API

## Core Features

### 1. YNAB Integration

- Connect via Personal Access Token (PAT)
- Select budget and track credit card accounts
- Fetch transactions automatically
- All cards are YNAB‑linked (no manual cards)

### 2. Credit Card Management

- Support for cashback and miles cards
- Configurable earning rates per card
- Billing cycle tracking (calendar month or custom billing day)
- Active/inactive status for temporary disabling
- Minimum spend requirements (optional)
- Maximum spend limits (optional)

### 3. Reward Rules System

- Multiple rules per card with time windows
- Category‑based reward rates (cashback % or miles per dollar)
- Block‑based miles calculation (e.g., "1 mile per $5 spent")
- Spending caps:
  - Per‑category caps with automatic limiting
  - Overall caps with proportional scaling
- Priority system for rule application

### 4. Tag Mapping & Categories

- Map YNAB flags/tags to reward categories
- Inline category editing in transaction views
- "Apply to tag" shortcut for bulk mappings
- Per‑transaction overrides (planned)

### 5. Rewards Calculation Engine

- Period‑based calculations (monthly or billing cycle)
- Progress tracking for minimum/maximum spend
- "Stop using" alerts when maximum spend reached
- Eligible spend calculation (respecting both minimum and maximum)
- Normalised dollar values for cross‑card comparison
- Real‑time recomputation with caching

### 6. Dashboard & Analytics

- Overview of all tracked cards
- Recent transactions with reward annotations
- Spending status and progress bars
- Last computed timestamp
- Category recommendations for optimal rewards

### 7. Settings & Configuration

- Theme switching (light/dark/system)
- Currency configuration
- Miles valuation settings (dollars per mile)
- Export/import settings (excluding PAT for security)
- Clear all data option

## Project Structure (apps/web)

```
apps/web/
├── app/                      # Next.js App Router pages
│   ├── api/ynab/            # YNAB API proxy routes
│   ├── cards/[id]/          # Card detail pages
│   │   ├── mappings/        # Tag mapping management
│   │   ├── transactions/    # Transaction list with editing
│   │   └── page.tsx         # Card overview with tabs
│   ├── dashboard/           # Main dashboard (redirects to /)
│   ├── rewards/             # Rewards calculation & display
│   ├── settings/            # App settings & configuration
│   ├── layout.tsx           # Root layout with providers
│   └── page.tsx             # Homepage/dashboard
│
├── components/              # React components
│   ├── ui/                  # shadcn/ui components
│   ├── CardSpendingSummary.tsx
│   ├── Navigation.tsx
│   ├── SetupPrompt.tsx
│   ├── TagMappingManager.tsx
│   └── theme‑*.tsx          # Theme components
│
├── lib/                     # Core libraries
│   ├── rewards‑engine/      # Calculation logic
│   │   ├── calculator.ts    # Core calculation
│   │   ├── compute.ts       # Orchestration
│   │   ├── matcher.ts       # Transaction matching
│   │   └── recommendations.ts
│   ├── storage.ts           # localStorage service
│   ├── utils.ts             # Utility functions
│   └── constants.ts         # App constants
│
├── hooks/                   # React hooks
│   └── useLocalStorage.ts   # Storage hooks
│
├── types/                   # TypeScript types
│   └── transaction.ts       # Transaction types
│
└── contexts/                # React contexts
    └── StorageContext.tsx   # Storage provider
```

## Data Model

### Resetting Local Storage

- Browser state lives entirely under the `ynab-rewards-tracker` key.
- The storage service checks `STORAGE_VERSION` / `STORAGE_VERSION_KEY` in `apps/web/lib/storage.ts`. Bump `STORAGE_VERSION` and restart to force-clear cached budgets/cards/settings and the setup prompt flag.
- `storage.clearAll()` now also clears the version marker, giving you a manual wipe hook if needed inside the app.

### Core Entities (in storage.ts)

```typescript
CreditCard {
  id: string
  name: string
  issuer: string
  type: 'cashback' | 'miles'
  ynabAccountId: string  // Required YNAB linkage
  billingCycle?: {
    type: 'calendar' | 'billing'
    dayOfMonth?: number  // For billing type
  }
  active: boolean
  earningRate?: number  // % for cashback, miles/$ for miles
  milesBlockSize?: number  // For block‑based miles
  minimumSpend?: number | null  // Min spend to earn rewards
  maximumSpend?: number | null  // Max spend that earns rewards
}

RewardRule {
  id: string
  cardId: string
  name: string
  rewardType: 'cashback' | 'miles'
  rewardValue: number
  milesBlockSize?: number
  categories: string[]
  minimumSpend?: number
  maximumSpend?: number
  categoryCaps?: CategoryCap[]
  startDate: string
  endDate: string
  active: boolean
  priority: number
}

TagMapping {
  id: string
  cardId: string
  ynabTag: string
  rewardCategory: string
}

RewardCalculation {
  cardId: string
  ruleId: string
  period: string  // YYYY‑MM or YYYY‑MM‑DD
  totalSpend: number
  eligibleSpend: number
  rewardEarned: number  // Raw units
  rewardEarnedDollars: number  // Normalised
  rewardType: 'cashback' | 'miles'
  categoryBreakdowns: CategoryBreakdown[]
  minimumMet: boolean
  maximumExceeded: boolean
  shouldStopUsing: boolean
}
```

## Key Conventions

### Naming & Units

- Use "dollars" in identifiers (not "USD")
- UI shows `$` symbol but avoids hardcoding currency
- Period labels: `YYYY‑MM` (calendar) or `YYYY‑MM‑DD` (billing)
- All amounts in milliunits internally (YNAB standard)

### Rewards Calculation

- Raw rewards: cashback in dollars, miles in miles
- Normalised values: everything converted to dollars for comparison
- Eligible spend: amount between minimum and maximum that earns rewards
- Minimum spend: must be met before any rewards earned
- Maximum spend: rewards stop accumulating after this limit
- Effective rates: based on normalised dollar values

### Storage & Migrations

- All reads/writes through `storage.ts` service
- Automatic migrations for field renames
- PAT never included in exports/backups
- UI state flags kept separate from main storage

### Security & Privacy

- PAT stored locally only
- Exports exclude authentication tokens
- No server‑side data storage
- All processing happens client‑side

## Development

### Prerequisites

- Node.js 18+
- pnpm package manager

### Setup & Run

```bash
# Install dependencies
pnpm install

# Run development server
pnpm ‑‑filter ./apps/web dev

# Build for production
pnpm ‑‑filter ./apps/web build
```

### Environment

- No `.env` files needed (fully client‑side)
- PAT entered through UI settings
- Development runs on `http://localhost:3000`

## Current Roadmap (from TODO.md)

### P1 — Next Actions

- [ ] Persist per‑transaction category overrides
- [ ] Shared TransactionsList component for reuse
- [ ] Calculator window enforcement with tests
- [ ] Comprehensive test coverage for calculator & recommendations
- [ ] Accessibility improvements (labels, ARIA)

### P2 — Quality & UX

- [ ] Branding assets (favicon, OG images)
- [ ] Recommendations "why" tooltips
- [ ] Progress & limits UX improvements
- [ ] MappingForm extraction for reuse

### P3 — Enhancements

- [ ] Transaction period overrides (local only)
- [ ] Background refresh while app is open
- [ ] Debug tooling for rewards engine

### Recently Shipped (Sep 2025)

- ✅ YJAB rebrand complete
- ✅ Shared RuleForm with validation
- ✅ Miles valuation settings integrated
- ✅ Abortable fetches throughout
- ✅ "Last computed" timestamps
- ✅ Category recommendations
- ✅ Card transactions tab with inline editing
- ✅ Mappings index page
- ✅ Optimised compute performance
- ✅ Removed Prisma/DB artefacts
- ✅ Maximum spend limits per card
- ✅ Eligible spend calculation with min/max bounds

## Architecture Decisions

### Client‑Only Approach

- **Decision**: No backend server or database
- **Rationale**: Privacy‑first, zero hosting costs, instant deployment
- **Trade‑off**: Limited to single‑device usage

### YNAB Integration

- **Decision**: All cards must be YNAB‑linked
- **Rationale**: Single source of truth, automatic transaction sync
- **Trade‑off**: Cannot track non‑YNAB cards

### Rewards Normalisation

- **Decision**: Convert all rewards to dollar values
- **Rationale**: Enable cross‑card comparison regardless of type
- **Implementation**: Configurable valuation rates in settings

### Period‑Based Calculations

- **Decision**: Calculate by calendar month or billing cycle
- **Rationale**: Match real credit card statements
- **Implementation**: Flexible period calculation in calculator

## Testing Strategy

- Unit tests for calculation logic
- Integration tests for YNAB API proxy
- Component tests for critical UI flows
- Manual testing for edge cases

## Deployment

- Vercel recommended for Next.js apps
- No environment variables needed
- Static export possible with some limitations

## Contributing Guidelines

- TypeScript‑first development
- Follow existing patterns and conventions
- Test calculations thoroughly
- Keep commits atomic and descriptive
- British spelling in user‑facing copy
- US spelling in code identifiers

## What NOT to Do

- ❌ Store PAT in exports or backups
- ❌ Reintroduce manual (non‑YNAB) cards
- ❌ Mix reward units when comparing
- ❌ Access localStorage directly (use storage.ts)
- ❌ Hardcode currency symbols or values
- ❌ Create server‑side dependencies
