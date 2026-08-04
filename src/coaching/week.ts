import { dateKeyInTimeZone } from "@/sheets/timestamp";

export const DEFAULT_APPLICATION_TIME_ZONE = "Africa/Cairo";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type WeekWindow = {
  start: string;
  end: string;
};

function parseDateKey(value: string) {
  if (!ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : parsed;
}

export function addDateKeyDays(value: string, amount: number) {
  const parsed = parseDateKey(value);
  if (!parsed) throw new Error("Invalid calendar date.");
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

export function normalizeWeekStart(value: string) {
  const parsed = parseDateKey(value);
  if (!parsed) return null;
  const day = parsed.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return addDateKeyDays(value, -daysSinceMonday);
}

export function resolveWeekWindow(
  requestedDate: string | undefined,
  now = new Date(),
  timeZone = DEFAULT_APPLICATION_TIME_ZONE,
): WeekWindow {
  const today = dateKeyInTimeZone(now, timeZone);
  const start = normalizeWeekStart(requestedDate ?? "") ?? normalizeWeekStart(today);
  if (!start) throw new Error("Unable to resolve the selected week.");
  return { start, end: addDateKeyDays(start, 6) };
}

export function coachingMeasurementWindows(sessionDate: string) {
  if (!parseDateKey(sessionDate)) throw new Error("Invalid coaching date.");
  return {
    before: {
      start: addDateKeyDays(sessionDate, -7),
      end: addDateKeyDays(sessionDate, -1),
    },
    after: {
      start: addDateKeyDays(sessionDate, 1),
      end: addDateKeyDays(sessionDate, 7),
    },
  };
}

export function isPostCoachingWindowComplete(
  sessionDate: string,
  now = new Date(),
  timeZone = DEFAULT_APPLICATION_TIME_ZONE,
) {
  const today = dateKeyInTimeZone(now, timeZone);
  return today > coachingMeasurementWindows(sessionDate).after.end;
}

export function calendarDayDifference(later: string, earlier: string) {
  const laterDate = parseDateKey(later);
  const earlierDate = parseDateKey(earlier);
  if (!laterDate || !earlierDate) return null;
  return Math.max(
    0,
    Math.round((laterDate.getTime() - earlierDate.getTime()) / 86_400_000),
  );
}

export function isValidDateKey(value: string) {
  return parseDateKey(value) !== null;
}
