# YJAB — YNAB Journal of Awards & Bonuses

Client-side tracker that analyses YNAB transactions to monitor credit card rewards using configurable rules stored in browser `localStorage`.

## Features
- Connect via YNAB personal access token and track linked credit card accounts.
- Define per-card reward rules with minimum/maximum spend limits and category mapping.
- Real-time reward computation with normalised dollar comparisons and recommendations.
- Web app built with Next.js 14, Tailwind CSS, and shadcn/ui.
- Mobile companion app built with Expo and React Native.

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
# Web app
pnpm dev                    # or: pnpm --filter ./apps/web dev

# Mobile app
pnpm mobile:start          # starts Metro bundler
pnpm mobile:ios             # launches iOS simulator
pnpm mobile:android         # launches Android emulator
```

### Production Build
```bash
pnpm --filter ./apps/web build
```

## Scripts
- `pnpm dev` — syncs environment metadata then launches the web app dev server.
- `pnpm build` — prepares a production build.
- `pnpm start` — runs the built app.
- `pnpm mobile:start` — starts the mobile app Metro bundler.
- `pnpm mobile:ios` — launches mobile app in iOS simulator.
- `pnpm mobile:android` — launches mobile app in Android emulator.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` — quality tooling.

## License
Licensed under the MIT License. Copyright (c) 2025-present.
