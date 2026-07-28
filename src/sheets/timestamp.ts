export type TimestampParseResult =
  | { ok: true; value: Date }
  | { ok: false; reason: "empty" | "invalid" };

const LOCAL_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;
const ISO_UTC =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/i;

function partsInTimezone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function localDateTimeToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  timeZone: string;
}) {
  const desiredUtc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    input.second,
    input.millisecond,
  );
  let candidate = desiredUtc;

  // Two passes resolve the offset on both sides of ordinary DST boundaries.
  for (let pass = 0; pass < 2; pass += 1) {
    const rendered = partsInTimezone(new Date(candidate), input.timeZone);
    const renderedUtc = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second,
      input.millisecond,
    );
    candidate += desiredUtc - renderedUtc;
  }

  const result = new Date(candidate);
  const rendered = partsInTimezone(result, input.timeZone);
  if (
    rendered.year !== input.year ||
    rendered.month !== input.month ||
    rendered.day !== input.day ||
    rendered.hour !== input.hour ||
    rendered.minute !== input.minute ||
    rendered.second !== input.second
  ) {
    return null;
  }
  return result;
}

export function parseSheetTimestamp(
  rawValue: string,
  timeZone = "Africa/Cairo",
): TimestampParseResult {
  const value = rawValue.trim();
  if (!value) return { ok: false, reason: "empty" };

  if (ISO_UTC.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? { ok: false, reason: "invalid" }
      : { ok: true, value: parsed };
  }

  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return { ok: false, reason: "invalid" };
  const [, year, month, day, hour, minute, second, milliseconds = "0"] =
    match;
  const numeric = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    millisecond: Number(milliseconds.padEnd(3, "0")),
    timeZone,
  };
  if (
    numeric.month < 1 ||
    numeric.month > 12 ||
    numeric.day < 1 ||
    numeric.day > 31 ||
    numeric.hour > 23 ||
    numeric.minute > 59 ||
    numeric.second > 59
  ) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const result = localDateTimeToUtc(numeric);
    return result
      ? { ok: true, value: result }
      : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
