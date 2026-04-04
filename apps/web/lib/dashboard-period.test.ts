import { describe, expect, it } from "vitest";
import {
  formatDateValue,
  resolveDashboardPeriod,
  shiftDashboardPeriodDays,
  shiftDashboardPeriodMonths,
} from "./dashboard-period";

describe("resolveDashboardPeriod", () => {
  const now = new Date(2026, 3, 4, 15, 30);

  it("uses the live current day when no selection is provided", () => {
    const period = resolveDashboardPeriod(null, null, now);

    expect(period.dateValue).toBe("2026-04-04");
    expect(period.isToday).toBe(true);
    expect(period.referenceDate).toEqual(now);
  });

  it("supports an explicit as-at date", () => {
    const period = resolveDashboardPeriod("2026-03-18", null, now);

    expect(period.dateValue).toBe("2026-03-18");
    expect(period.monthValue).toBe("2026-03");
    expect(period.isToday).toBe(false);
    expect(period.referenceDate).toEqual(new Date(2026, 2, 18));
  });

  it("falls back to the legacy month param by choosing that month end", () => {
    const period = resolveDashboardPeriod(null, "2026-03", now);

    expect(period.dateValue).toBe("2026-03-31");
    expect(period.isToday).toBe(false);
  });

  it("clamps future dates back to today", () => {
    const period = resolveDashboardPeriod("2026-05-01", null, now);

    expect(period.dateValue).toBe("2026-04-04");
    expect(period.isToday).toBe(true);
    expect(period.referenceDate).toEqual(now);
  });
});

describe("shiftDashboardPeriodDays", () => {
  const now = new Date(2026, 3, 4);

  it("moves one day at a time", () => {
    expect(shiftDashboardPeriodDays("2026-04-04", -1, now)).toBe("2026-04-03");
    expect(shiftDashboardPeriodDays("2026-04-03", 1, now)).toBe("2026-04-04");
  });

  it("does not move beyond today", () => {
    expect(shiftDashboardPeriodDays("2026-04-04", 1, now)).toBe("2026-04-04");
  });
});

describe("shiftDashboardPeriodMonths", () => {
  const now = new Date(2026, 3, 4);

  it("moves one month at a time while preserving day when possible", () => {
    expect(shiftDashboardPeriodMonths("2026-04-04", -1, now)).toBe("2026-03-04");
  });

  it("clamps overflowed month lengths", () => {
    expect(shiftDashboardPeriodMonths("2026-03-31", -1, now)).toBe("2026-02-28");
  });

  it("does not move beyond today", () => {
    expect(shiftDashboardPeriodMonths("2026-03-31", 1, now)).toBe(formatDateValue(now));
  });
});
