# YNAB Rewards Tracker

## Overview
Web app that tracks credit card rewards by analyzing YNAB transactions with user-defined rules and tag mappings.

## Core Architecture

### Client-Side Only Design
- All data stored in browser localStorage
- YNAB API access via Personal Access Token (PAT)
- No server-side storage or user accounts
- Export/import for data portability

### Tech Stack
- **Frontend**: Next.js 14 (App Router) + TypeScript
- **UI**: shadcn/ui components + Tailwind CSS  
- **Storage**: Browser localStorage
- **API**: YNAB REST API (read-only)

## Core Concepts

### Credit Cards & Rules
- **Card Types**: Cashback (%) or Miles (points per $)
- **Billing Cycles**: Calendar month or custom billing date
- **Reward Rules**: Category-based with min/max spend limits
- **Sub-caps**: Category-specific spending limits within rules

### Transaction Processing
1. User tags transactions in YNAB with flags/tags
2. App fetches tagged transactions via YNAB API
3. Tag mappings convert YNAB tags to reward categories
4. Rules engine calculates rewards based on spend and limits
5. Dashboard shows progress, recommendations, and alerts

### Key Features
- **Multi-card tracking**: Support multiple cards with different rules
- **Category mapping**: Map YNAB tags to reward categories
- **Spend tracking**: Monitor minimum requirements and maximum caps
- **Period management**: Handle different billing cycles per card
- **Smart recommendations**: Suggest best card for each category
- **Transaction editing**: Modify categories and move between periods

## Data Models

### CreditCard
```typescript
interface CreditCard {
  id: string;
  name: string;
  type: 'cashback' | 'miles';
  ynabAccountId: string;
  billingCycle: {
    type: 'calendar' | 'billing';
    dayOfMonth?: number;
  };
  active: boolean;
}
```

### RewardRule
```typescript
interface RewardRule {
  id: string;
  cardId: string;
  name: string;
  rewardType: 'cashback' | 'miles';
  rewardValue: number;
  milesBlockSize?: number; // for $5 blocks, etc
  categories: string[]; // YNAB tag names
  minimumSpend?: number;
  maximumSpend?: number;
  categoryCaps?: { category: string; maxSpend: number }[];
  startDate: string;
  endDate: string;
  active: boolean;
  priority: number;
}
```

### TagMapping
```typescript
interface TagMapping {
  id: string;
  cardId: string;
  ynabTag: string;
  rewardCategory: string;
}
```

### RewardCalculation
```typescript
interface RewardCalculation {
  cardId: string;
  ruleId: string;
  period: string;
  totalSpend: number;
  eligibleSpend: number;
  rewardEarned: number;
  minimumProgress?: number;
  maximumProgress?: number;
  categoryBreakdowns: {
    category: string;
    spend: number;
    reward: number;
    capReached: boolean;
  }[];
  minimumMet: boolean;
  maximumExceeded: boolean;
  shouldStopUsing: boolean;
}
```

## Implementation Plan

### Core Components
1. **Rewards Engine** (`/lib/rewards-engine/`)
   - `calculator.ts` - Core calculation logic
   - `matcher.ts` - Match transactions to rules via tags  
   - `aggregator.ts` - Aggregate by period and category
   - `recommendations.ts` - Best card suggestions

2. **Page Structure**
   - `/` - Dashboard with rewards summary
   - `/cards/[id]` - Card detail with rules and transactions
   - `/cards/[id]/rules` - Configure reward rules
   - `/cards/[id]/transactions` - View/edit transactions
   - `/rewards` - Rewards overview and recommendations

3. **Key Features**
   - Period-based calculations (calendar vs billing)
   - Transaction category editing
   - Progress tracking (min/max spend)
   - Smart alerts (stop using card, needs more spend)
   - Data export/import

## Privacy & Security
- **No server storage**: All data remains in browser
- **PAT security**: Never logged or transmitted beyond YNAB API calls
- **Data portability**: Export/import via JSON
- **No tracking**: No analytics or external data sharing

## Development Principles
- **Explainability**: Every calculation must be traceable
- **Performance**: Client-side calculations with caching
- **Accessibility**: Full keyboard navigation and screen reader support
- **Reliability**: Graceful error handling and data validation


