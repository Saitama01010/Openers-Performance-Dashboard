import {
  hourInTimeZone,
  OPERATING_SHIFT_END_HOUR,
} from "@/dashboard/shift-coverage";
import { dateKeyInTimeZone } from "@/sheets/timestamp";

export const DEFAULT_DASHBOARD_TIME_ZONE = "Africa/Cairo";

export type OverviewDateFilterKey =
  | "today"
  | "this-month"
  | "last-month"
  | "all-time"
  | "custom";

export type DashboardDateWindow = {
  from?: string;
  to?: string;
};

export type OverviewDateRange = DashboardDateWindow & {
  comparison: (DashboardDateWindow & { label: string }) | null;
  key: OverviewDateFilterKey;
  label: string;
};

export type OverviewDateFilterParams = {
  from?: string | string[];
  range?: string | string[];
  to?: string | string[];
};

function reportingDate(now: Date, timeZone: string) {
  const calendarDate = parseIsoDate(dateKeyInTimeZone(now, timeZone));
  if (!calendarDate) {
    throw new RangeError("Unable to resolve today's calendar date.");
  }
  return hourInTimeZone(now, timeZone) < OPERATING_SHIFT_END_HOUR
    ? addUtcDays(calendarDate, -1)
    : calendarDate;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}

function parseIsoDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || isoDate(date) !== value ? null : date;
}

function addUtcDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function daysInUtcMonth(year: number, month: number) {
  return utcDate(year, month + 1, 0).getUTCDate();
}

function thisMonthRange(today: Date): OverviewDateRange {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const previousMonthEnd = utcDate(year, month, 0);
  const previousYear = previousMonthEnd.getUTCFullYear();
  const previousMonth = previousMonthEnd.getUTCMonth();
  const comparisonDay = Math.min(
    today.getUTCDate(),
    daysInUtcMonth(previousYear, previousMonth),
  );

  return {
    key: "this-month",
    label: "This Month",
    from: isoDate(utcDate(year, month, 1)),
    to: isoDate(today),
    comparison: {
      from: isoDate(utcDate(previousYear, previousMonth, 1)),
      to: isoDate(utcDate(previousYear, previousMonth, comparisonDay)),
      label: "previous month to date",
    },
  };
}

function lastMonthRange(today: Date): OverviewDateRange {
  const currentMonthStart = utcDate(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    1,
  );
  const lastMonthEnd = addUtcDays(currentMonthStart, -1);
  const lastMonthStart = utcDate(
    lastMonthEnd.getUTCFullYear(),
    lastMonthEnd.getUTCMonth(),
    1,
  );
  const priorMonthEnd = addUtcDays(lastMonthStart, -1);
  const priorMonthStart = utcDate(
    priorMonthEnd.getUTCFullYear(),
    priorMonthEnd.getUTCMonth(),
    1,
  );

  return {
    key: "last-month",
    label: "Last Month",
    from: isoDate(lastMonthStart),
    to: isoDate(lastMonthEnd),
    comparison: {
      from: isoDate(priorMonthStart),
      to: isoDate(priorMonthEnd),
      label: "prior month",
    },
  };
}

function todayRange(today: Date): OverviewDateRange {
  const previousDay = addUtcDays(today, -1);

  return {
    key: "today",
    label: "Today",
    from: isoDate(today),
    to: isoDate(today),
    comparison: {
      from: isoDate(previousDay),
      to: isoDate(previousDay),
      label: "previous day",
    },
  };
}

function allTimeRange(): OverviewDateRange {
  return {
    key: "all-time",
    label: "All Time",
    comparison: null,
  };
}

function customRange(from: Date, to: Date): OverviewDateRange {
  const inclusiveDays =
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const comparisonTo = addUtcDays(from, -1);
  const comparisonFrom = addUtcDays(comparisonTo, -(inclusiveDays - 1));

  return {
    key: "custom",
    label: "Custom Date",
    from: isoDate(from),
    to: isoDate(to),
    comparison: {
      from: isoDate(comparisonFrom),
      to: isoDate(comparisonTo),
      label: inclusiveDays === 1 ? "previous day" : "previous period",
    },
  };
}

export function resolveOverviewDateRange(
  params: OverviewDateFilterParams,
  now = new Date(),
  timeZone = DEFAULT_DASHBOARD_TIME_ZONE,
) {
  const today = reportingDate(now, timeZone);
  const requestedRange = firstValue(params.range);

  if (requestedRange === "today") return todayRange(today);
  if (requestedRange === "last-month") return lastMonthRange(today);
  if (requestedRange === "all-time") return allTimeRange();

  if (requestedRange === "custom") {
    const from = parseIsoDate(firstValue(params.from));
    const to = parseIsoDate(firstValue(params.to));
    if (!from || !to) {
      throw new RangeError("Choose a valid start and end date.");
    }
    if (from > to) {
      throw new RangeError("The end date cannot be before the start date.");
    }
    return customRange(from, to);
  }

  return thisMonthRange(today);
}

export const resolveDashboardDateRange = resolveOverviewDateRange;
