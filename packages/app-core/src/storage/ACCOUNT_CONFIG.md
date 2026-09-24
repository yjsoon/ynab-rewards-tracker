# Per-account rewards configuration exchange

Settings → Account Rewards Configuration exchanges JSON with HowMuch. This is
separate from whole-settings backup/import. Select an existing budget account,
choose a file, then confirm replacement. No transactions, balances, account
identifiers, credentials, global preferences, rules or tag mappings are exported.

Envelope: `{ "format": "rewards-account-config", "version": 1, "card": {...} }`.
Unknown formats/versions and malformed configuration are rejected before writes.
Unknown properties are discarded at every object level.

`card` uses shared `CreditCard` semantics, with only these fields:
`name`, `issuer`, `type`, `billingCycle`, `rewardPeriod`, `promotionalPeriod`,
`earningRate`, `earningBlockSize`, `minimumSpend`, `maximumSpend`,
`subcategoriesEnabled`, `subcategories`, `spendingTiers`, `flagNames`.
`name` is nonempty, `issuer` is a string (empty allowed), `type` is cashback/miles.
Top-level `id`, `ynabAccountId` and `featured` are never portable.

- Billing cycle: calendar/billing, optional integer day 1–31.
- Reward period: integer month count 2–24, real YYYY-MM-DD anchor, nonnegative monthly minimum.
- Promotion: real YYYY-MM-DD end, optional/null start not after end, optional description.
- Rates, block sizes and spend limits: finite nonnegative numbers; optional values may be null.
- Subcategories: id/name, recognised flag colour (including unflagged), nonnegative reward value,
  finite ordering priority, nonempty createdAt/updatedAt strings, active (defaults true).
  Optional milesBlockSize, minimumSpend, maximumSpend, excludeFromRewards.
- Tiers: id, nonnegative spendThreshold, optional earningRate/maximumSpend and subcategories.
  Overrides: subcategoryId, rewardValue, optional maximumSpend.
- IDs and flag colours within categories must be unique. Tier IDs and thresholds must be unique.
  Each override must reference an existing category, once per tier. Rejecting duplicates prevents
  the storage normaliser silently dropping rules.
- Optional `flagNames` maps recognised colours to strings. It is retained on the card for
  re-export, never applied to the connected budget's global labels.
- Tracker rejects enabled categories without an explicit unflagged category. Its
  normaliser would otherwise add a base-rate earning category, changing behaviour.
  Add an unflagged category with zero rewards or excluded from rewards in the source.
- Accounts with active legacy reward rules cannot import or export this card-only
  format: those rules can override the exchanged rate in calculations. Exchange is
  unavailable for these accounts; no legacy-rule migration UI is provided.
  Inactive rules and other accounts' rules remain untouched.

Import preserves the destination card ID, account link, name and featured status;
a newly configured account uses its account name. Omitted optional fields clear old
configuration. Existing storage normalisation supplies calendar billing, null unset
amounts and empty arrays; it orders categories
and tiers. Nested IDs remain stable. Only the selected card's derived calculations
are invalidated; ledger caches and sibling cards remain unchanged. The normal
Cloud Sync dirty marker advances. No upload is initiated by these controls.

Synthetic interoperable example: `fixtures/rewards-account-config.json` (miles,
billing day 17, quarterly qualification, promotional end, category cap and tier).
Tests: `account-config.test.ts` and web `lib/storage/service.test.ts`.
