# AGENTS

This repo hosts a client‑side YNAB Rewards Tracker. It analyzes YNAB transactions to track credit‑card rewards with user‑defined rules. No server DB is used; all user data lives in browser localStorage.

## Snapshot
- App: Next.js 14 (App Router) + TypeScript
- UI: Tailwind + shadcn/ui + Radix primitives
- Theming: `next-themes` with light/dark/system
- Data: Browser `localStorage` (see `apps/web/lib/storage.ts`)
- YNAB API: proxied via `/api/ynab/*` routes (bearer PAT)
- Cards: All cards are YNAB‑linked (manual cards removed)

## Key Paths (apps/web)
- `app/` — routes and pages (dashboard, settings, rewards, cards/*)
- `components/` — UI primitives and app components (Navigation, ThemeToggle)
- `lib/rewards-engine/` — engine modules: `calculator`, `matcher`, `recommendations`
- `lib/storage.ts` — localStorage schema + getters/setters + migrations
- `hooks/useLocalStorage.ts` — React hooks over `storage`
- `app/api/ynab/*` — thin proxy to YNAB REST API
- `types/transaction.ts` — client transaction types and reward adornments

## Data Model (storage)
- `CreditCard`: `{ id, name, issuer, type: 'cashback'|'miles', ynabAccountId, billingCycle?, active }`
  - `ynabAccountId` is required; there are no manual cards.
- `RewardRule`: percentages or miles per dollar, optional caps (overall and per category).
- `TagMapping`: maps YNAB flags/tags to reward categories.
- `RewardCalculation`: includes raw `rewardEarned` and normalized `rewardEarnedDollars` for cross‑card comparisons.
- `AppSettings`: default currency label, and valuation knob: `milesValuation` (dollars per mile).

Conventions:
- Use “dollars” in identifiers (not “USD”). UI shows `$` but avoids hard coding currency copy.
- For time windows, `RewardsCalculator.calculatePeriod` labels months as `YYYY-MM` and billing cycles as `YYYY-MM-DD` (start day).
- When overall `maximumSpend` is exceeded, the calculator proportionally scales per‑category rewards once at the aggregate level.
- Recommendation effective rates use normalized dollar rewards.

## Coding Guidelines
- TypeScript first; keep types aligned with usage (e.g., `issuer` required, `ynabAccountId` required).
- Avoid adding “manual” card paths; cards are created from tracked YNAB accounts only.
- Read/write through `storage.ts` (do not reach into `localStorage` directly). Prefer adding migrations when renaming fields.
- Networking: when adding new fetch flows in React components, use `AbortController` to avoid setting state after unmount.
- Engine: prefer explicit constants over magic numbers; pull valuations from settings where practical.
- Keep commits atomic and descriptive.

## Run/Dev (indicative)
- Install: `pnpm install`
- Web app: `pnpm --filter ./apps/web dev`
- PAT: User pastes YNAB PAT under Settings; routes under `/api/ynab/*` forward with the bearer token.

## What Not To Do
- Do not store the PAT in exports/backups (exports already exclude it).
- Do not reintroduce manual cards.
- Do not mix reward units when computing effective rates — use normalized dollars.

## Open Items (see TODO.md for details)
- Wire category recommendations to settings valuations
- Add abortable fetches in dashboard/transactions
- Tests for calculator/recommendations
- Remove legacy `lib/reward-engine/rules.ts` (singular)
