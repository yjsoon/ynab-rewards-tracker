# TODO

Updated 12 Sep 2025 — prioritised next steps to align the app with the intended behaviour. British spelling is used in copy; code identifiers remain unchanged.

## P1 — Next Actions
- Implement Rules & Mappings UI — initial version done
  - Status: pages added under `app/cards/[id]/rules/(new|[ruleId]/edit)` and `app/cards/[id]/mappings/(new|[mappingId]/edit)`; persisted via `storage.ts`.
  - Follow‑ups: better validation, friendlier category input, polish.

- Wire the Calculation Pipeline — initial version done
  - Status: “Compute Now” on Rewards runs fetch → match → calculate for the current period and saves results.
  - Follow‑ups: show “last computed” timestamp; optional auto‑recompute on app open; per‑period selective clearing instead of full clear.

- Enforce Rule Windows
  - In `calculateRuleRewards`, add calculator‑level checks for `startDate`/`endDate` (current orchestration skips out‑of‑window rules already).

- Expose Valuation Controls in Settings
  - Add `milesValuation` input; plumb through to the calculator and recommendations.
  - Replace hard‑coded 0.01 and block efficiency assumptions in category recommendations (optionally add a block efficiency knob).

- Add Abortable Fetches
  - Use `AbortController` in `app/page.tsx` and `app/cards/[id]/transactions/page.tsx` to prevent state updates after unmount.

- Remove Prisma/DB Artefacts from Web App — done
  - Dropped `@prisma/client` and `@ynab-counter/db` from `apps/web` deps; deleted `apps/web/lib/db.ts` and `apps/web/types/prisma.d.ts`.
  - Removed `transpilePackages` entry for DB in `apps/web/next.config.js`.
  - `packages/db` remains quarantined for future server use; not referenced by web.

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
