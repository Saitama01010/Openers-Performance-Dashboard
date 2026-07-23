export function secondsToDuration(seconds: number) {
  const normalized = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function toPercentage(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}
