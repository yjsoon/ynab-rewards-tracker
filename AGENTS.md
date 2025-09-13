# AGENTS

This repo hosts YJAB — YJ's Awards Buddy. It’s a client‑side rewards tracker that analyses YNAB transactions to track credit‑card rewards with user‑defined rules. No server DB is used; all user data lives in browser localStorage.

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
- `lib/rewards-engine/` — engine modules: `calculator`, `matcher`, `recommendations`, `compute`
- `lib/storage.ts` — localStorage schema + getters/setters + migrations
- `hooks/useLocalStorage.ts` — React hooks over `storage`
- `app/api/ynab/*` — thin proxy to YNAB REST API
- `types/transaction.ts` — client transaction types and reward adornments

## Data Model (storage)
- `CreditCard`: `{ id, name, issuer, type: 'cashback'|'miles', ynabAccountId, billingCycle?, active }`
  - `ynabAccountId` is required; there are no manual cards.
- `RewardRule`: percentages or miles per dollar, optional caps (overall and per category).
- `TagMapping`: maps YNAB flags/tags to reward categories.
- `RewardCalculation`: includes raw `rewardEarned` and normalised `rewardEarnedDollars` for cross‑card comparisons.
- `AppSettings`: default currency label, and valuation knob: `milesValuation` (dollars per mile).

Conventions:
- Use “dollars” in identifiers (not “USD”). UI shows `$` but avoids hard coding currency copy.
- For time windows, `RewardsCalculator.calculatePeriod` labels months as `YYYY-MM` and billing cycles as `YYYY-MM-DD` (start day).
- When overall `maximumSpend` is exceeded, the calculator proportionally scales per‑category rewards once at the aggregate level.
- Recommendation effective rates use normalised dollar rewards.

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
- Persist per‑transaction category overrides (or create tag mappings automatically).
- Shared `TransactionsList` component (preview + full view reuse).
- Tests for calculator/recommendations end‑to‑end.
- Remove legacy `lib/reward-engine/rules.ts` (singular), if any.


## Alignment Check — 13 Sep 2025

Conclusion: The project is on track. The client‑only architecture, YNAB linkage, localStorage data model, and rewards engine scaffolding match the intent. The main gaps are UI for rules/mappings, wiring real calculations from YNAB transactions, enforcing rule windows, exposing valuation controls, and removing stray server‑DB artefacts to keep the client‑only promise.

What’s working as intended
- Rewards: Cashback and miles supported, including block‑based miles; rewards are normalised to dollars for cross‑card comparison.
- Caps and progress: Per‑category caps, an overall cap with proportional scaling, minimum/maximum spend tracking, and a “stop using” signal when capped.
- Time windows: Calendar vs billing‑day cycles with period labels (`YYYY‑MM` or `YYYY‑MM‑DD`).
- Tag mappings: YNAB flags/names map to reward categories; recommendations use normalised values. Mappings index page exists for each card.
- Privacy: PAT remains local; exports exclude the token.

Gaps to close
- Transactions UX: Inline edits exist in the card preview but are not persisted; add per‑transaction overrides and/or mapping auto‑create flow.
- Rule windows: Enforcement is in orchestration; add calculator‑level guard for completeness.
- Tests: Calculator scenarios (caps scaling, miles blocks, windows) and recommendations need coverage.
- A11y: Add `id`/`htmlFor` to inputs and `aria` hints across new components.
- Branding assets: Favicon/OG images for YJAB.

Guardrails (unchanged)
- Do not reintroduce manual cards; all cards are YNAB‑linked.
- Do not store or export the PAT.
- Do not mix reward units when comparing; always use normalised dollars.

## Progress Update — 13 Sep 2025

Recent work shipped:
- Rebrand to YJAB (nav, metadata, setup copy, docs).
- Shared `RuleForm` with zod validation (used by New/Edit), chips UX, numeric/date guards.
- Valuation controls in Settings (`milesValuation`); engine and recs use normalised dollars with settings.
- Abortable fetches for dashboard, card transactions, and compute.
- Rewards page shows “Last computed” timestamp; recompute clears only the computed period.
- Category recommendations surface on the Rewards page.
- Card Transactions tab implemented with inline reward‑category editing and “apply to tag” mapping shortcut.
- Mappings index route added to avoid 404s from Overview links.
- Compute performance: single fetch since the earliest relevant period; per‑card filtering in‑memory.
- Purged Prisma/DB artefacts from the web app.

Planned next (high level): see TODO.md for a prioritised list.
