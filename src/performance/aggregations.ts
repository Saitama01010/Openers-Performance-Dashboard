import type { Actor } from "@/auth/authorization";
import type { DashboardDateWindow } from "@/dashboard/date-range";

export type PerformanceGranularity = "day" | "week" | "month";
export type PerformanceSourceStatus = "healthy" | "partial" | "unavailable";

export type ScopedOutcomeEvent = {
  date: string;
  profileId: string;
  teamId: string | null;
};

export type DialerDailyAggregate = {
  date: string;
  loggedInSeconds: number;
  readySeconds: number;
  talkSeconds: number;
  ringingSeconds: number | null;
  wrapSeconds: number;
  pausedSeconds: number;
  systemPauseSeconds: number | null;
  idleSeconds: number | null;
  untrackedSeconds: number | null;
  netSeconds: number | null;
  sourceRows: number;
};

export type PerformanceSeriesPoint = Omit<DialerDailyAggregate, "loggedInSeconds"> & {
  key: string;
  rangeStart: string;
  rangeEnd: string;
  transfers: number | null;
  closedDeals: number | null;
  closedDealRate: number | null;
  loggedInSeconds: number | null;
};

export const PRODUCTIVITY_MIX_KEYS = [
  "readySeconds",
  "talkSeconds",
  "ringingSeconds",
  "wrapSeconds",
  "pausedSeconds",
  "systemPauseSeconds",
  "idleSeconds",
  "untrackedSeconds",
] as const;

export function sumProductivityMixSeconds(
  totals: Record<(typeof PRODUCTIVITY_MIX_KEYS)[number], number | null> & {
    netSeconds?: number | null;
  },
) {
  return PRODUCTIVITY_MIX_KEYS.reduce(
    (sum, key) => sum + (totals[key] ?? 0),
    0,
  );
}

export function calculateClosedDealRate(
  closedDeals: number | null,
  transfers: number | null,
) {
  if (closedDeals === null || transfers === null || transfers <= 0) return null;
  return (closedDeals / transfers) * 100;
}

export function calculatePerformanceDelta(
  current: number | null,
  previous: number | null,
) {
  if (current === null || previous === null) {
    return { absolute: null, percentage: null };
  }
  const absolute = current - previous;
  return {
    absolute,
    percentage: previous === 0 ? null : (absolute / previous) * 100,
  };
}

function parseDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function inclusiveDays(window: DashboardDateWindow) {
  if (!window.from || !window.to) return null;
  return Math.floor((parseDate(window.to).getTime() - parseDate(window.from).getTime()) / 86_400_000) + 1;
}

export function selectPerformanceGranularity(window: DashboardDateWindow) {
  const days = inclusiveDays(window);
  if (days === null || days > 365) return "month" as const;
  if (days > 90) return "week" as const;
  return "day" as const;
}

export function bucketDate(date: string, granularity: PerformanceGranularity) {
  if (granularity === "day") {
    return { key: date, rangeStart: date, rangeEnd: date };
  }
  if (granularity === "month") {
    const start = `${date.slice(0, 7)}-01`;
    const parsed = parseDate(start);
    parsed.setUTCMonth(parsed.getUTCMonth() + 1);
    parsed.setUTCDate(0);
    return { key: date.slice(0, 7), rangeStart: start, rangeEnd: isoDate(parsed) };
  }

  const parsed = parseDate(date);
  const weekday = parsed.getUTCDay();
  parsed.setUTCDate(parsed.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  const start = isoDate(parsed);
  parsed.setUTCDate(parsed.getUTCDate() + 6);
  return { key: start, rangeStart: start, rangeEnd: isoDate(parsed) };
}

export function actorCanViewOutcome(
  actor: Actor,
  identity: Pick<ScopedOutcomeEvent, "profileId" | "teamId">,
) {
  if (actor.role === "admin") return true;
  if (actor.role === "agent") return actor.id === identity.profileId;
  return identity.teamId !== null && actor.teamIds.includes(identity.teamId);
}

export function scopeOutcomeEvents(
  events: readonly ScopedOutcomeEvent[],
  actor: Actor,
  window: DashboardDateWindow,
) {
  return events.filter((event) => {
    if (!actorCanViewOutcome(actor, event)) return false;
    if (window.from && event.date < window.from) return false;
    if (window.to && event.date > window.to) return false;
    return true;
  });
}

function sumRequired(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function sumOptional(values: Array<number | null>) {
  return values.some((value) => value === null)
    ? null
    : sumRequired(values as number[]);
}

export function aggregatePerformanceSeries(input: {
  closedDeals: readonly ScopedOutcomeEvent[] | null;
  dialer: readonly DialerDailyAggregate[] | null;
  granularity: PerformanceGranularity;
  transfers: readonly ScopedOutcomeEvent[] | null;
}) {
  const rows = new Map<
    string,
    {
      rangeStart: string;
      rangeEnd: string;
      transfers: number;
      closedDeals: number;
      dialer: DialerDailyAggregate[];
    }
  >();

  function rowFor(date: string) {
    const bucket = bucketDate(date, input.granularity);
    const existing = rows.get(bucket.key);
    if (existing) return existing;
    const created = {
      rangeStart: bucket.rangeStart,
      rangeEnd: bucket.rangeEnd,
      transfers: 0,
      closedDeals: 0,
      dialer: [],
    };
    rows.set(bucket.key, created);
    return created;
  }

  for (const event of input.transfers ?? []) rowFor(event.date).transfers += 1;
  for (const event of input.closedDeals ?? []) rowFor(event.date).closedDeals += 1;
  for (const daily of input.dialer ?? []) rowFor(daily.date).dialer.push(daily);

  return Array.from(rows.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, row]): PerformanceSeriesPoint => {
      const hasDialer = row.dialer.length > 0;
      const loggedInSeconds = hasDialer
        ? sumRequired(row.dialer.map((item) => item.loggedInSeconds))
        : null;
      const transfers = input.transfers === null ? null : row.transfers;
      const closedDeals = input.closedDeals === null ? null : row.closedDeals;
      return {
        key,
        rangeStart: row.rangeStart,
        rangeEnd: row.rangeEnd,
        date: row.rangeStart,
        transfers,
        closedDeals,
        closedDealRate: calculateClosedDealRate(closedDeals, transfers),
        loggedInSeconds,
        readySeconds: hasDialer ? sumRequired(row.dialer.map((item) => item.readySeconds)) : 0,
        talkSeconds: hasDialer ? sumRequired(row.dialer.map((item) => item.talkSeconds)) : 0,
        ringingSeconds: hasDialer ? sumOptional(row.dialer.map((item) => item.ringingSeconds)) : null,
        wrapSeconds: hasDialer ? sumRequired(row.dialer.map((item) => item.wrapSeconds)) : 0,
        pausedSeconds: hasDialer ? sumRequired(row.dialer.map((item) => item.pausedSeconds)) : 0,
        systemPauseSeconds: hasDialer ? sumOptional(row.dialer.map((item) => item.systemPauseSeconds)) : null,
        idleSeconds: hasDialer ? sumOptional(row.dialer.map((item) => item.idleSeconds)) : null,
        untrackedSeconds: hasDialer ? sumOptional(row.dialer.map((item) => item.untrackedSeconds)) : null,
        netSeconds: hasDialer ? sumOptional(row.dialer.map((item) => item.netSeconds)) : null,
        sourceRows:
          row.dialer.reduce((total, item) => total + item.sourceRows, 0) +
          row.transfers +
          row.closedDeals,
      };
    });
}

export function sumSeriesTotals(rows: readonly PerformanceSeriesPoint[]) {
  const sumNullable = (select: (row: PerformanceSeriesPoint) => number | null) =>
    rows.some((row) => select(row) === null)
      ? null
      : rows.reduce((total, row) => total + (select(row) ?? 0), 0);

  return {
    transfers: sumNullable((row) => row.transfers),
    closedDeals: sumNullable((row) => row.closedDeals),
    loggedInSeconds: sumNullable((row) => row.loggedInSeconds),
    sourceRows: rows.reduce((total, row) => total + row.sourceRows, 0),
  };
}

export function productivityStatePercentage(
  seconds: number | null,
  totalRecordedSeconds: number,
) {
  if (seconds === null || totalRecordedSeconds <= 0) return null;
  return (seconds / totalRecordedSeconds) * 100;
}

export function serializePerformanceTimestamp(value: Date | string | null) {
  if (value === null) return null;
  const normalized =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
  const parsed = normalized instanceof Date ? normalized : new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
