import type {
  CardDashboardProjection,
  CardPortfolioStatus,
} from '@ynab-counter/app-core/rewards-engine';

export type DashboardStatusSlot =
  | 'qualification-failed'
  | 'below-minimum'
  | 'earning'
  | 'near-cap'
  | 'at-cap';

const EMPTY_COUNTS: Record<DashboardStatusSlot, number> = {
  'qualification-failed': 0,
  'below-minimum': 0,
  earning: 0,
  'near-cap': 0,
  'at-cap': 0,
};

const STATUS_SLOT: Record<Exclude<CardPortfolioStatus, 'unconfigured'>, DashboardStatusSlot> = {
  capped: 'at-cap',
  near_cap: 'near-cap',
  building: 'below-minimum',
  earning: 'earning',
  open: 'earning',
};

function slotForProjection(projection: CardDashboardProjection): DashboardStatusSlot | null {
  if (projection.status === 'unconfigured') {
    return null;
  }
  if (projection.calculation.qualificationStatus === 'failed') {
    return 'qualification-failed';
  }
  const slot = STATUS_SLOT[projection.status];
  if (
    projection.calculation.qualificationStatus === 'pending'
    && slot !== 'at-cap'
    && slot !== 'near-cap'
  ) {
    return 'below-minimum';
  }
  return slot;
}

export function summariseDashboardStatus(
  projections: CardDashboardProjection[],
): Record<DashboardStatusSlot, number> {
  const counts = { ...EMPTY_COUNTS };
  for (const projection of projections) {
    const slot = slotForProjection(projection);
    if (slot) {
      counts[slot] += 1;
    }
  }
  return counts;
}
