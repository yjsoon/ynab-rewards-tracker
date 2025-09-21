# TODO

Updated 21 Sep 2025 — prioritised next steps for YJAB (British spelling in copy; code identifiers unchanged).

## P1 — Next Actions
- Persist per‑transaction overrides
  - Add a `transactionOverrides` store keyed by `{budgetId, accountId, transactionId}` with an optional `rewardCategory` and an optional `overrideDate` (for period moves).
  - Apply overrides in `TransactionMatcher.applyTagMappings` after tag mapping resolution.
  - UI: enable inline edit in TransactionsPreview and full Transactions to save overrides when “Apply to tag” isn’t desired.

- Shared TransactionsList
  - Extract a reusable list component used by card preview and full transactions page (sorting, paging, inline edit hooks, loading/empty states).

- Calculator window enforcement
  - Add `startDate`/`endDate` checks inside `calculateRuleRewards` (in addition to orchestration guard); include a unit test.

- Tests
  - Calculator: category caps, overall cap scaling, miles block rules, window enforcement, “stop using”.
  - Recommendations: effective‑rate selection and stop‑using logic using normalised dollars.

- A11y pass
  - Add `id`/`htmlFor` to form controls in RuleForm/Settings; ensure buttons have discernible text.

## P2 — Quality and UX
- Branding assets
  - Favicon + OG images for YJAB; update `app/layout.tsx` metadata.

- Recommendations UX
  - Show “why” tooltips (valuation used, cap progress) and quick links to rule/mappings.

- Progress & Limits UX Enhancement
  - ✅ Display min/max spend progress for cards (completed)
  - Show "stop using" badges when maximum reached
  - Indicate when caps are near (warning at 80-90%)

- MappingForm extraction
  - Create a shared form for new/edit tag mappings with simple validation and suggestions from existing categories.

## P3 — Enhancements
- Allow moving a transaction between periods (local override of date; never patch YNAB).
- Background refresh while the app is open with visible “last computed”.
- Lightweight local analytics for the rewards engine (toggle in dev).

## Recently Shipped (21 Sep 2025)
- Maximum spend limits per card
  - Added `maximumSpend` field to CreditCard type with migration support
  - Created comprehensive helper functions for maximum spend calculations
  - Updated SimpleRewardsCalculator to respect maximum limits
  - Added UI controls in CardSettingsEditor for configuring limits
  - Display progress bars and warnings in CardSpendingSummary and SpendingStatus
  - Eligible spend calculation respects both minimum and maximum bounds

## Previously Shipped (13 Sep 2025)
- Rebrand to YJAB in UI and docs.
- Shared RuleForm with zod validation; chips UX (enter/backspace).
- Valuation controls wired to engine and recommendations (normalised dollars).
- Abortable fetches for dashboard, transactions, and compute.
- Rewards: "Last computed" timestamp + per‑period recompute.
- Category recommendations surfaced on Rewards page.
- Card Transactions tab implemented with inline editing + "apply to tag".
- Mappings index page added (no more 404).
- Compute fetch consolidated to once per run; per‑card filtering.
- Prisma/DB artefacts purged from the web app.

## P2 — Quality and UX
- Persist Category Edits in Transactions
  - When a user changes a reward category, update the corresponding tag mapping (or store a per‑transaction override) so it survives reloads.

- Progress & Limits UX
  - Show distance to minimum/maximum per rule; surface “stop using” badges when capped.

- Recommendations Accuracy
  - Base effective‑rate comparisons on normalised dollars and respect `shouldStopUsing`; re‑run when valuation settings change.

- Tests
  - Calculator: category caps, overall cap scaling, miles and block rules, progress flags, window enforcement.
  - Recommendations: effective‑rate selection and “avoid/use” alerts; settings‑driven valuations.

- Clean Up Legacy Path
  - Remove or migrate `apps/web/lib/reward-engine/rules.ts` (singular) and optionally lint against importing it.

- Ynab Client Helper
  - Keep `getYnabClient()` reading from `storage.getPAT()` (already done) or remove if redundant.

## P3 — Optional Enhancements
- Allow moving a transaction between periods (local override date only; do not patch YNAB).
- Background refresh while the app is open (with visible “last updated”).
- Lightweight local analytics and debug tooling for the rewards engine.
