# WORKLOG - OAuth and DB Wiring Implementation

## Date: 2025-09-08

## Changes Made

### 1. Database Setup (packages/db)
- Added Prisma and @prisma/client dependencies
- Created DB client singleton (`src/client.ts`) with proper connection management
- Added index export (`src/index.ts`) for clean imports
- Added Prisma scripts: `generate`, `migrate:dev`, `studio`
- Configured TypeScript with Node types support
 - Switched datasource to SQLite by default; set WAL + busy timeout at client init

### 2. OAuth Implementation (apps/web)
- **Token Exchange**: Implemented OAuth callback route with full token exchange flow
  - Exchanges authorization code for access/refresh tokens via YNAB token endpoint
  - Stores encrypted tokens in database using AES-256-GCM encryption
  - Creates placeholder user and connection records
- **Encryption**: Added crypto utilities (`lib/crypto.ts`) for secure token storage
  - Uses Node.js built-in crypto module
  - Implements AES-256-GCM with authentication tags
  - Requires 32-byte base64-encoded key from environment

### 3. YNAB Client (packages/ynab-client)
- Implemented basic YNAB API client with rate limiting
- Added `getBudgets()` with full fetch implementation
- Simple leaky bucket rate limiting (200 req/hour per YNAB limits)
- Automatic retry on 429 rate limit responses
- All API methods now functional with proper auth headers

### 4. Build Configuration
- Fixed Next.js config (removed deprecated serverActions, added transpilePackages)
- Added TypeScript types (@types/node, @types/react, @types/react-dom)
- Configured workspace dependencies properly
- Made API routes dynamic to prevent static generation errors
- Updated CI workflow to run Prisma generate before typecheck

### 5. Environment Variables
- Added `ENCRYPTION_KEY` to .env.example with generation instructions
- All OAuth variables documented

## How to Run Locally

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your values:
   # - YNAB OAuth credentials
   # - Generate encryption key: openssl rand -base64 32
   # - Database URL (SQLite for local dev: file:./dev.db)
   ```

3. **Initialize database (SQLite default)**:
   ```bash
   # Important: Prisma reads .env from packages/db/.env
   cp packages/db/.env.example packages/db/.env # adjust if needed
   pnpm db:generate
   pnpm db:migrate
   ```

4. **Run development server**:
   ```bash
   # Next.js reads env from apps/web/.env.local
   cp apps/web/.env.local.example apps/web/.env.local # fill secrets
   pnpm dev
   ```

5. **Test OAuth flow**:
   - Visit http://localhost:3000/api/auth/ynab/start
   - Authorize with YNAB
   - Check callback response for success

## Verification

- ✅ TypeScript compiles cleanly: `pnpm typecheck`
- ✅ Next.js builds successfully: `pnpm -C apps/web build`
- ✅ OAuth routes are dynamic (not statically generated)
- ✅ Prisma client generates and connects properly
- ✅ CI workflow updated with Prisma generation step

## Next Steps

1. Implement sync endpoints to fetch YNAB data
2. Add background worker for periodic syncs
3. Implement reward rule engine
4. Add UI components for dashboard
5. Set up proper user authentication (replace placeholder)
### 6. PAT Mode & Settings UI (2025-09-09)
- Added `POST/GET /api/auth/ynab/pat` to store a YNAB Personal Access Token securely (AES-GCM), scoped as `scope: 'pat'`.
- Added `apps/web/app/settings/page.tsx` to paste token and test sync.
- Updated `/api/sync/run` to support `YNAB_ACCESS_TOKEN` env override (mode: `pat`) and continue supporting DB-backed tokens.

6. **Alternatively, use Personal Access Token (PAT)**:
   - Generate a PAT in YNAB account settings.
   - EITHER set `YNAB_ACCESS_TOKEN` in `.env`, OR visit `/settings` and paste it.
   - Trigger a sync: `curl -X POST http://localhost:3000/api/sync/run`.
