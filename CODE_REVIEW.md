Branch: feat/dark-mode-support
Base (merge-base with main): 33d898b914b5116f6cbbf7caafc332270cb4ddb4

Commits since base (newest first):
- 4359d20 feat: enhance dashboard and settings pages
- 5072843 feat: integrate theme provider and toggle in layout
- bfd3af1 feat: add dark mode CSS variables
- 0779161 feat: add dropdown-menu and select UI components
- 9ebf4e4 feat: add theme provider and toggle components
- 5960ec7 feat: add theme-related dependencies
- f19b57b fix: handle missing billingCycle property and remove redundant sections (on main)
- 33a7d9e feat: clean up dashboard UI - remove redundant elements

High-level summary
- Introduces dark mode via next-themes and shadcn primitives; adds ThemeToggle and ThemeProvider.
- Reworks dashboard and navigation styling; improves empty/partial setup states.
- Adds card detail and transactions pages with tabs; scaffolds rewards dashboard.
- Introduces rewards engine modules (calculator, matcher, recommendations) and new storage entities (tagMappings, calculations).
- Extends localStorage hooks and types to support mappings and calculations.

What’s great
- Thoughtful UX: clearer setup flow, alternating row styles, helpful empty states.
- Accessibility basics covered (sr-only labels, aria-hidden icons) and semantic headings.
- Local export/import excludes PAT — good data-minimization practice.
- The rewards engine is modularized for future extension.

Status

Resolved
- CreditCard type is aligned with usage; `ynabAccountId` is required (no manual cards), `billingCycle` optional, `type` includes `'points'`. File: apps/web/lib/storage.ts
- Rewards normalization: calculator computes `rewardEarnedDollars` using configurable valuations; recommendations use normalized dollars for card-level rates. Files: apps/web/lib/rewards-engine/calculator.ts, apps/web/lib/rewards-engine/recommendations.ts
- Overall cap handling: calculator now scales category rewards proportionally when total spend exceeds `maximumSpend` (no double-application).
- Removed manual-card UI branches; Settings shows a single YNAB-linked list. File: apps/web/app/settings/page.tsx
- Minor: transaction type newline fixed.

Remaining
- Rewards dashboard now normalized; no action needed there.
- Category recommendations use hard-coded 1¢/mile and an 80% block efficiency. Consider reading from settings valuations for consistency. File: apps/web/lib/rewards-engine/recommendations.ts
- Legacy module path: `apps/web/lib/reward-engine/rules.ts` (singular) remains; remove or migrate to the plural `rewards-engine` tree and add a lint rule to prevent reintroduction.
- Networking polish: consider AbortController in dashboard/transactions fetches to avoid state updates after unmount.
- Tests: add unit tests for calculator (category caps, overall cap scaling, blocks, progress flags) and a smoke test for recommendations.
- Ynab client helper: `getYnabClient` comment notes localStorage key drift; either wire it to the storage service or remove if unused. File: apps/web/lib/ynab-client.ts

Notes
- Valuations defaults exist in calculator (`milesValuation`/`pointsValuation`); surface these in Settings if you want user-tunable assumptions.
