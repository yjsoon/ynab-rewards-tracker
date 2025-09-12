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

Issues to address (suggested fixes inline below)
1) Type mismatches for CreditCard (blocking)
   - Code uses fields not in the type: `issuer`, `isManual`, optional `ynabAccountId`, and the union references `'points'` in several components.
   - Fix: widen the `CreditCard` interface to include these and make `billingCycle` optional. See apps/web/lib/storage.ts change.

2) Rewards units consistency (logic/UX correctness)
   - `RewardsCalculator.calculateRuleRewards` sets `rewardEarned` to raw “miles” for `rewardType === 'miles'`. Downstream UI and `RecommendationEngine.generateCardRecommendations` compute effective rates by `rewardEarned / eligibleSpend`, mixing miles with dollars.
   - Fix options:
     - Normalize to USD (e.g., 1¢/mile default, configurable) and store both `rewardEarnedUnits` and `rewardEarnedUsd`.
     - Or, keep units, and have `RecommendationEngine` compute effective rate from rule definitions instead of raw `rewardEarned` values.
   - Inline REVIEW notes added to both files.

3) Cap application correctness (logic)
   - In calculator, per-category handling applies `maximumSpend` as if it were per-category; later you also cap overall `eligibleSpend`. This can overcount rewards when the overall cap should limit total rewards, not each category independently.
   - Fix: compute aggregate eligible spend across categories, apply the overall cap once, and (if needed) proportionally scale category rewards or track remaining cap as you iterate categories. Inline REVIEW note added.

4) Legacy module naming
   - `apps/web/lib/reward-engine/rules.ts` (singular) remains but new code uses `rewards-engine` (plural). This is confusing and risks drift.
   - Fix: remove or migrate the old path; keep a single canonical module tree.

5) Minor
   - `types/transaction.ts` had no trailing newline; added.
   - Consider abort controllers for fetches in dashboard/transactions to avoid setting state after unmount.
   - Consider memoizing `accountsMap.get(...)` lookups by computing a simple object map; `Map` is fine, but not serializable if later moved to context.

Suggested follow-ups
- Add a simple “miles valuation” setting (default 0.01) to normalize rewards and make the dashboard’s effective rate meaningful across card types.
- Unit tests for `RewardsCalculator` covering: category caps, overall caps, miles-block rules, minimum/maximum progress flags, and refund/negative adjustments when introduced.
- Lint rule to forbid importing from the legacy `reward-engine` path.

If you want, I can implement the type fix and a minimal normalization in the recommendations logic in a follow-up patch.

