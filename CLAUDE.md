# CLAUDE: Project Orientation and Guardrails

This document orients LLM contributors (incl. Claude) to the YNAB credit‑card rewards tracker we are building. It captures current decisions, domain concepts, privacy constraints, and the near‑term plan. Keep answers concise, actionable, and aligned with the choices below.

## Snapshot
- Repository: `ynab-counter` (empty repo at start)
- Goal: Web app that reads a user’s YNAB budget and computes rewards progress/caps across credit cards; shows dashboards, alerts, and recommendations.
- Stack (planned): Next.js 14 (App Router, Node runtime) + TypeScript, Prisma, Postgres (SQLite locally), background worker for sync/compute, YNAB JS SDK or REST.
- Scope: Read‑only access to YNAB (Authorization Code OAuth). No multi‑currency for now.

## Decisions (2025‑09‑08)
- Single currency only: yes (no FX support in MVP).
- Refund handling: Treat refunds as inflows that reduce eligible spend and previously credited rewards within the same window. See “Refunds” below.
- Data minimization: Store only what’s needed. Hash payee names and memos by default; keep a short preview optionally for UX.
\- Explicitly out of scope: Shared issuer caps/cap groups. Do not model or reference them.

## Domain Glossary
- Reward window: A time range (monthly, quarterly, annual, or explicit start/end) in which spend accrues and caps reset.
- Cap (spend cap): Maximum eligible spend for a rule within a window (e.g., 5% up to $1,500/quarter).
- Sub‑cap: A cap scoped to a sub‑bucket (e.g., groceries sub‑cap under a card’s quarterly promo).
- Stacking modes:
  - `max` (default): pick the rule that yields the highest reward per split.
  - `sum`: add rewards from multiple rules (issuer promos that explicitly stack).
  - `first`: apply the highest‑priority rule only.
\- Cap groups: removed (out of scope for this project).

## Refunds
- Source: In YNAB, refunds commonly appear as inflows categorized back to the original category (or as income to be assigned).
- Handling:
  1) Identify negative/credit amounts or categorized inflows that reverse prior spend.
  2) Attempt to match to original transaction via `import_id`, payee, amount magnitude, and proximity in time.
  3) If matched in the same window, create a reversing accrual line (reduces eligible spend and rewards).
  4) If unmatched, treat as negative eligible spend in that category/window (cannot exceed prior accrued amount).
- Presentation: Show reversal links in the accrual ledger for explainability.

## High‑Level Data Model (abridged)
- User, Connection(YNAB tokens + serverKnowledge), Budget, Account, CategoryGroup, Category, Payee(nameHash, preview?), Transaction(amountMilli, date, flags, memoHash, subTxCount), Split(amountMilli,…).
- Card, RewardRule(scope/window/reward/caps/stacking), Mapping(flag/category/payee mappings), AccrualWindow, AccrualLine, SyncState.
- All money in integer milliunits; round only for display.

## Planned API Surface
- `GET /api/auth/ynab/start`, `GET /api/auth/ynab/callback` (OAuth Authorization Code; read‑only scope).
- `POST /api/sync/run` (manual sync trigger).
- `GET /api/accruals` (summaries), `GET /api/recommendations` (best card by category/current mix).
- `GET /api/export` (JSON/CSV export), `DELETE /api/data` (full purge).

## Directory Plan (to scaffold later)
```
apps/web
  app/(auth)/callback/route.ts
  app/dashboard/page.tsx
  app/settings/{cards|rules|mappings}/page.tsx
  components/
  lib/{ynab.ts,time-windows.ts}
  lib/reward-engine/{index.ts,rules.ts,calculators.ts}
  lib/mapping/{flags.ts,categories.ts}
  pages/api/auth/ynab/{start.ts,callback.ts}
  pages/api/sync/run.ts
packages/db/schema.prisma
packages/ynab-client/src/index.ts
packages/worker/src/{sync.ts,compute.ts,notify.ts}
docs/{architecture.md,privacy.md}
```

## Privacy, Security, and Rate Limits
- OAuth: Authorization Code with refresh; store tokens encrypted (AES‑GCM via managed key or env KMS). Never log tokens.
- Scope: `read-only` unless a write endpoint is explicitly needed (not planned for MVP).
- Rate limit: 200 requests/hour/token. Use leaky‑bucket (~3 req/min), delta sync (`server_knowledge`, `since_date`), and backoff on 429.
- Data deletion: Provide a one‑click purge of all user data and token revocation.

## Contributor Rules of Thumb
- Prefer pure, testable modules (rule engine and calculators). No side effects in computation code.
- Use zod for runtime validation of rule DSL and incoming payloads.
- Treat all amounts as milliunits; avoid floating point math.
- Explainability first: every reward outcome must be traceable to rules, caps, and transactions via `AccrualLine` records.
- Keep UX accessible and fast; provide previews in editors (no blocking syncs).

## MVP Checklist
- [ ] OAuth start/callback
- [ ] Minimal Prisma schema + migrations
- [ ] `ynab-client` wrapper with delta + rate budgeting
- [ ] Manual sync + daily cron
- [ ] Rule engine v0 (percent/miles/flat; window cadence; overall cap; `max` stacking)
- [ ] Dashboard (per‑card accruals, cap progress)
- [ ] Export + Delete endpoints

## Open Questions to Park
- Best UX for mapping limited YNAB flags to many reward categories—start with per‑account presets?

---
When generating code or plans, adhere to the above defaults. If a decision is ambiguous, propose 1–2 concrete options with trade‑offs and pick a default.
