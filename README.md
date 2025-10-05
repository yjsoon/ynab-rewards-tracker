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
MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
