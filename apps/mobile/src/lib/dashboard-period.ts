function truncateDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isSameMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function parseMonthValue(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearRaw, monthRaw] = value.split('-');
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;

  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null;
  }

  return new Date(year, monthIndex, 1);
}

export function parseDateValue(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const day = Number(dayRaw);

  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(year, monthIndex, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function formatMonthValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function clampToToday(date: Date, today: Date): Date {
  return date > today ? today : date;
}

export interface DashboardPeriodSelection {
  dateValue: string;
  monthValue: string;
  referenceDate: Date;
  isToday: boolean;
  isCurrentMonth: boolean;
  monthLabel: string;
  asOfLabel: string;
  triggerLabel: string;
}

export function resolveDashboardPeriod(
  asOfValue: string | null | undefined,
  now: Date = new Date(),
): DashboardPeriodSelection {
  const today = truncateDate(now);
  const parsedAsOf = parseDateValue(asOfValue);
  const requestedDate = parsedAsOf ?? today;
  const safeDate = clampToToday(requestedDate, today);
  const isToday = isSameDay(safeDate, today);
  const referenceDate = isToday ? now : safeDate;

  return {
    dateValue: formatDateValue(safeDate),
    monthValue: formatMonthValue(safeDate),
    referenceDate,
    isToday,
    isCurrentMonth: isSameMonth(safeDate, today),
    monthLabel: safeDate.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    }),
    asOfLabel: safeDate.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    triggerLabel: isToday
      ? 'Today'
      : safeDate.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        }),
  };
}

export function shiftDashboardPeriodDays(
  dateValue: string,
  deltaDays: number,
  now: Date = new Date(),
): string {
  const today = truncateDate(now);
  const baseDate = parseDateValue(dateValue) ?? today;
  const shifted = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + deltaDays);
  return formatDateValue(clampToToday(shifted, today));
}

export function shiftDashboardPeriodMonths(
  dateValue: string,
  deltaMonths: number,
  now: Date = new Date(),
): string {
  const today = truncateDate(now);
  const baseDate = parseDateValue(dateValue) ?? today;
  const targetYear = baseDate.getFullYear();
  const targetMonth = baseDate.getMonth() + deltaMonths;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(baseDate.getDate(), lastDayOfTargetMonth);
  const shifted = new Date(targetYear, targetMonth, targetDay);

  return formatDateValue(clampToToday(shifted, today));
}
