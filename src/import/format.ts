export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatRatio(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatOptionalNumber(value: number | null) {
  return value === null ? "N/A" : formatRatio(value);
}

export function formatPercentage(value: number | null) {
  return value === null ? "N/A" : `${formatRatio(value)}%`;
}

export function formatDurationSeconds(seconds: number) {
  const safeSeconds = Math.max(0, Math.trunc(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  const hms = [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(remainingSeconds).padStart(2, "0"),
  ].join(":");
  const decimalHours = safeSeconds / 3600;

  return {
    hms,
    decimalHours,
    decimalHoursLabel: `${formatRatio(decimalHours)} hours`,
  };
}
