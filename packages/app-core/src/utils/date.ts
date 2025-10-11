export function formatPeriodRange(period: { startDate: Date; endDate: Date }): string {
  const start = period.startDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const end = period.endDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${start} - ${end}`;
}

export function clampDaysLeft(period: { endDate: Date }, now = new Date()): number {
  const days = Math.ceil((period.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(days, 0);
}

export function formatPeriodRangeParts(period: { startDate: Date; endDate: Date }): { start: string; end: string } {
  const start = period.startDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const end = period.endDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return { start, end };
}