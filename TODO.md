# TODO

Shortlist of next tasks after dark-mode + engine updates.

- Recommendations: read valuations from settings
  - Replace hard-coded 0.01 and 0.8 assumptions in `RecommendationEngine.generateCategoryRecommendations` with values from `AppSettings` (and optional block efficiency setting).

- Abortable fetches in UI
  - Add `AbortController` to data loads in `app/page.tsx` and `app/cards/[id]/transactions/page.tsx` to prevent setState-after-unmount.

- Tests
  - Calculator: category caps, overall cap scaling, miles/points and block rules, progress flags.
  - Recommendations: effective rate selection and “avoid/use” alerts.

- Clean up legacy path
  - Remove or migrate `apps/web/lib/reward-engine/rules.ts` (singular) to avoid confusion with `lib/rewards-engine/*`.
  - Optionally add lint rule to forbid importing from the singular path.

- Ynab client helper
  - Remove or wire `getYnabClient()` to `storage.getPAT()` (avoid key drift) if we keep it.

- Settings UI
  - Expose `milesValuation` / `pointsValuation` controls so users can tune assumptions used by the engine.

- Optional: persist category edits
  - In `cards/[id]/transactions/page.tsx`, wire the “edit reward category” action to a persistent mapping or storage if we want it to survive reloads.

