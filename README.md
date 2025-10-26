# YJAB — YNAB Journal of Awards & Bonuses

Client-side tracker that analyses YNAB transactions to monitor credit card rewards using configurable rules stored in browser `localStorage`.

## Features
- Connect via YNAB personal access token and track linked credit card accounts.
- Define per-card reward rules with minimum/maximum spend limits and category mapping.
- Real-time reward computation with normalised dollar comparisons and recommendations.
- Dashboard, settings, and card detail views built with Next.js 14, Tailwind CSS, and shadcn/ui.

## Getting Started
### Prerequisites
- Node.js 18+
- pnpm 9+

### Installation
```bash
pnpm install
```

### Development Server
```bash
pnpm --filter ./apps/web dev
```

### Production Build
```bash
pnpm --filter ./apps/web build
```

## Scripts
- `pnpm dev` — syncs environment metadata then launches the web app dev server.
- `pnpm build` — prepares a production build.
- `pnpm start` — runs the built app.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` — quality tooling.

## License
Licensed under the MIT License. Copyright (c) 2025-present.
