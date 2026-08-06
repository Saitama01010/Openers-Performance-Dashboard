import { addDateKeyDays } from "@/coaching/week";
import { dateKeyInTimeZone } from "@/sheets/timestamp";

export const OPERATING_SHIFT_START_HOUR = 16;
export const OPERATING_SHIFT_END_HOUR = 6;
export const OPERATING_SHIFT_HOURS = 14;

export type CompletedShiftWindow = {
  startDate: string;
  startHour: 16;
  endDate: string;
  endHourExclusive: 6;
};

export function hourInTimeZone(now: Date, timeZone: string) {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(now).find((part) => part.type === "hour")?.value;
  const parsed = Number(hour);
  if (!Number.isInteger(parsed)) throw new RangeError("Unable to resolve local hour.");
  return parsed;
}

export function isTimestampInShift(
  timestamp: Date,
  window: CompletedShiftWindow,
  timeZone: string,
) {
  return isHourInShift(
    {
      metricDate: dateKeyInTimeZone(timestamp, timeZone),
      metricHour: hourInTimeZone(timestamp, timeZone),
    },
    window,
  );
}

export function lastCompletedShift(
  now = new Date(),
  timeZone = "Africa/Cairo",
): CompletedShiftWindow {
  const today = dateKeyInTimeZone(now, timeZone);
  const endDate =
    hourInTimeZone(now, timeZone) >= OPERATING_SHIFT_END_HOUR
      ? today
      : addDateKeyDays(today, -1);
  return {
    startDate: addDateKeyDays(endDate, -1),
    startHour: OPERATING_SHIFT_START_HOUR,
    endDate,
    endHourExclusive: OPERATING_SHIFT_END_HOUR,
  };
}

export function previousCompletedShift(window: CompletedShiftWindow) {
  return {
    ...window,
    startDate: addDateKeyDays(window.startDate, -1),
    endDate: addDateKeyDays(window.endDate, -1),
  } satisfies CompletedShiftWindow;
}

export function isHourInShift(
  row: { metricDate: string; metricHour: number | null },
  window: CompletedShiftWindow,
) {
  if (row.metricHour === null) return false;
  return (
    (row.metricDate === window.startDate && row.metricHour >= window.startHour) ||
    (row.metricDate === window.endDate && row.metricHour < window.endHourExclusive)
  );
}

export type ShiftCoverage =
  | { status: "incomplete"; recordedHours: number; expectedHours: 14 }
  | {
      status: "ready";
      recordedHours: number;
      activeHours: number;
      expectedHours: 14;
      percentage: number;
      loggedInSeconds: number;
    };

export function calculateShiftCoverage(
  rows: readonly {
    metricDate: string;
    metricHour: number | null;
    loggedInSeconds: number;
  }[],
  window: CompletedShiftWindow,
): ShiftCoverage {
  const buckets = new Map<string, number>();
  for (const row of rows) {
    if (!isHourInShift(row, window) || row.metricHour === null) continue;
    const key = `${row.metricDate}:${row.metricHour}`;
    buckets.set(key, (buckets.get(key) ?? 0) + Math.max(0, row.loggedInSeconds));
  }
  if (buckets.size < OPERATING_SHIFT_HOURS) {
    return {
      status: "incomplete",
      recordedHours: buckets.size,
      expectedHours: OPERATING_SHIFT_HOURS,
    };
  }
  const loggedInSeconds = Array.from(buckets.values()).reduce(
    (total, seconds) => total + seconds,
    0,
  );
  const activeHours = Array.from(buckets.values()).filter((seconds) => seconds > 0).length;
  return {
    status: "ready",
    recordedHours: buckets.size,
    activeHours,
    expectedHours: OPERATING_SHIFT_HOURS,
    percentage: (activeHours / OPERATING_SHIFT_HOURS) * 100,
    loggedInSeconds,
  };
}
