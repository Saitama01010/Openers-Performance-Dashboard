function dateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return {
    day,
    month,
    year,
    date: new Date(Date.UTC(year, month - 1, day)),
  };
}

function monthDay(value: ReturnType<typeof dateParts>) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(value.date);
}

export function formatCompactLeaderboardRange(from: string, to: string) {
  const start = dateParts(from);
  const end = dateParts(to);

  if (from === to) return `${monthDay(start)}, ${start.year}`;
  if (start.year === end.year && start.month === end.month) {
    return `${monthDay(start)}–${end.day}, ${start.year}`;
  }
  if (start.year === end.year) {
    return `${monthDay(start)}–${monthDay(end)}, ${start.year}`;
  }
  return `${monthDay(start)}, ${start.year}–${monthDay(end)}, ${end.year}`;
}
