import { dateKeyInTimeZone, parseSheetTimestamp } from "@/sheets/timestamp";

export type CommissionMonth = {
  key: string;
  label: string;
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
};

function validMonthKey(value: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1000 && year <= 9998
    ? { year, month: Number(match[2]) }
    : null;
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function localMidnight(date: string, timeZone: string) {
  const parsed = parseSheetTimestamp(`${date} 00:00:00`, timeZone);
  if (!parsed.ok) throw new RangeError("Unable to resolve commission month boundary.");
  return parsed.value;
}

export function currentCommissionMonth(now: Date, timeZone: string) {
  return dateKeyInTimeZone(now, timeZone).slice(0, 7);
}

export function resolveCommissionMonth(
  requested: string | undefined,
  now = new Date(),
  timeZone = "Africa/Cairo",
): CommissionMonth {
  const key = requested ?? currentCommissionMonth(now, timeZone);
  const parsed = validMonthKey(key);
  if (!parsed) throw new RangeError("Choose a valid commission month.");
  const following = nextMonth(parsed.year, parsed.month);
  const startDate = `${String(parsed.year).padStart(4, "0")}-${String(parsed.month).padStart(2, "0")}-01`;
  const endDate = `${String(following.year).padStart(4, "0")}-${String(following.month).padStart(2, "0")}-01`;
  const start = localMidnight(startDate, timeZone);
  const end = localMidnight(endDate, timeZone);

  return {
    key,
    label: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone,
    }).format(start),
    start,
    end,
    startDate,
    endDate,
    isCurrent: key === currentCommissionMonth(now, timeZone),
  };
}

export function monthKeyInTimeZone(date: Date, timeZone: string) {
  return dateKeyInTimeZone(date, timeZone).slice(0, 7);
}
