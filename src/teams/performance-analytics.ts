import type { OverviewDateRange } from "@/dashboard/date-range";

export type TeamPerformanceMetric = "transfers" | "closed-deals" | "conversion";
export type TeamPerformanceSortKey =
  | TeamPerformanceMetric
  | "active-agents"
  | "logged-in"
  | "talk-percentage";
export type TeamPerformanceDirection = "asc" | "desc";
export type TeamPerformanceView = "overview" | "trends";
export type TeamHealth = "healthy" | "under-target" | "not-configured" | "unavailable";

export type TeamPerformanceFilters = {
  query: string;
  status: TeamHealth | "";
  metric: TeamPerformanceMetric;
  sortBy: TeamPerformanceSortKey;
  direction: TeamPerformanceDirection;
  view: TeamPerformanceView;
  selectedTeamId: string;
  page: number;
};

export type TeamTrendPoint = {
  date: string;
  transfers: number | null;
  closedDeals: number | null;
  conversion: number | null;
  averageLoggedInSeconds: number | null;
};

export type TeamComparison = {
  transfers: number | null;
  closedDeals: number | null;
  conversion: number | null;
  averageLoggedInSeconds: number | null;
  averageTalkPercentage: number | null;
};

export type TeamPerformanceRow = {
  teamId: string;
  teamName: string;
  activeAgents: number;
  agentsWithDialerData: number;
  transfers: number | null;
  closedDeals: number | null;
  conversion: number | null;
  averageLoggedInSeconds: number | null;
  averageTalkPercentage: number | null;
  comparison: TeamComparison | null;
  health: TeamHealth;
  healthLabel: string;
  targetValue: number | null;
  targetMetric: TeamPerformanceMetric;
  trend: TeamTrendPoint[];
};

export type TeamPerformanceKpis = {
  totalTeams: number;
  transfers: number | null;
  previousTransfers: number | null;
  closedDeals: number | null;
  previousClosedDeals: number | null;
  conversion: number | null;
  previousConversion: number | null;
  averageLoggedInSeconds: number | null;
  previousAverageLoggedInSeconds: number | null;
  loggedInTeamSampleSize: number;
};

export type TeamPerformanceData = {
  role: "admin" | "manager";
  range: OverviewDateRange;
  filters: TeamPerformanceFilters;
  rows: TeamPerformanceRow[];
  standings: TeamPerformanceRow[];
  trendTeams: TeamPerformanceRow[];
  spotlight: TeamPerformanceRow | null;
  attention: TeamPerformanceRow[];
  kpis: TeamPerformanceKpis;
  healthMix: Array<{ health: TeamHealth; label: string; count: number }>;
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
    from: number;
    to: number;
  };
  sources: {
    dialer: "ready" | "unavailable";
    transfers: "ready" | "unavailable";
    closedDeals: "ready" | "unavailable";
    message: string | null;
  };
};

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const METRICS = new Set<TeamPerformanceMetric>([
  "transfers",
  "closed-deals",
  "conversion",
]);
const SORT_KEYS = new Set<TeamPerformanceSortKey>([
  ...METRICS,
  "active-agents",
  "logged-in",
  "talk-percentage",
]);
const HEALTH = new Set<TeamHealth>([
  "healthy",
  "under-target",
  "not-configured",
  "unavailable",
]);

export function resolveTeamPerformanceFilters(params: RawParams): TeamPerformanceFilters {
  const metric = first(params.metric);
  const sort = first(params.sort);
  const status = first(params.status);
  const direction = first(params.direction);
  const view = first(params.view);
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  const resolvedMetric = METRICS.has(metric as TeamPerformanceMetric)
    ? (metric as TeamPerformanceMetric)
    : "transfers";

  return {
    query: (first(params.q) ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 120),
    status: HEALTH.has(status as TeamHealth) ? (status as TeamHealth) : "",
    metric: resolvedMetric,
    sortBy: SORT_KEYS.has(sort as TeamPerformanceSortKey)
      ? (sort as TeamPerformanceSortKey)
      : resolvedMetric,
    direction: direction === "asc" ? "asc" : "desc",
    view: view === "trends" ? "trends" : "overview",
    selectedTeamId: (first(params.teamId) ?? "").trim().slice(0, 80),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function conversionPercentage(
  closedDeals: number | null,
  transfers: number | null,
) {
  return closedDeals === null || transfers === null || transfers <= 0
    ? null
    : (closedDeals / transfers) * 100;
}

export function metricValue(
  row: TeamPerformanceRow,
  metric: TeamPerformanceSortKey,
) {
  if (metric === "transfers") return row.transfers;
  if (metric === "closed-deals") return row.closedDeals;
  if (metric === "conversion") return row.conversion;
  if (metric === "active-agents") return row.activeAgents;
  if (metric === "talk-percentage") return row.averageTalkPercentage;
  return row.averageLoggedInSeconds;
}

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function compareRows(
  left: TeamPerformanceRow,
  right: TeamPerformanceRow,
  filters: Pick<TeamPerformanceFilters, "sortBy" | "direction">,
) {
  const leftValue = metricValue(left, filters.sortBy);
  const rightValue = metricValue(right, filters.sortBy);
  if (leftValue === null && rightValue !== null) return 1;
  if (leftValue !== null && rightValue === null) return -1;
  if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
    return filters.direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
  }
  return left.teamName.localeCompare(right.teamName, "en", { sensitivity: "base" });
}

export function prepareTeamRows(
  rows: readonly TeamPerformanceRow[],
  filters: TeamPerformanceFilters,
  pageSize = 8,
) {
  const query = normalize(filters.query);
  const filtered = [...rows]
    .filter((row) => !query || normalize(row.teamName).includes(query))
    .filter((row) => !filters.status || row.health === filters.status)
    .sort((left, right) => compareRows(left, right, filters));
  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(filters.page, totalPages);
  const start = (page - 1) * pageSize;

  return {
    allRows: filtered,
    pageRows: filtered.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      totalRows,
      totalPages,
      from: totalRows === 0 ? 0 : start + 1,
      to: Math.min(totalRows, start + pageSize),
    },
  };
}

function average(values: Array<number | null>) {
  const available = values.filter((value): value is number => value !== null);
  return {
    value:
      available.length === 0
        ? null
        : available.reduce((total, value) => total + value, 0) / available.length,
    count: available.length,
  };
}

function sumIfReady(values: Array<number | null>) {
  return values.some((value) => value === null)
    ? null
    : values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export function calculateTeamKpis(
  rows: readonly TeamPerformanceRow[],
): TeamPerformanceKpis {
  const transfers = sumIfReady(rows.map((row) => row.transfers));
  const closedDeals = sumIfReady(rows.map((row) => row.closedDeals));
  const previousTransfers = rows.every((row) => row.comparison !== null)
    ? sumIfReady(rows.map((row) => row.comparison?.transfers ?? null))
    : null;
  const previousClosedDeals = rows.every((row) => row.comparison !== null)
    ? sumIfReady(rows.map((row) => row.comparison?.closedDeals ?? null))
    : null;
  const logged = average(rows.map((row) => row.averageLoggedInSeconds));
  const previousLogged = average(
    rows.map((row) => row.comparison?.averageLoggedInSeconds ?? null),
  );

  return {
    totalTeams: rows.length,
    transfers,
    previousTransfers,
    closedDeals,
    previousClosedDeals,
    conversion: conversionPercentage(closedDeals, transfers),
    previousConversion: conversionPercentage(previousClosedDeals, previousTransfers),
    averageLoggedInSeconds: logged.value,
    previousAverageLoggedInSeconds: previousLogged.value,
    loggedInTeamSampleSize: logged.count,
  };
}

export function healthForTarget(
  actual: number | null,
  target: number | null,
): Pick<TeamPerformanceRow, "health" | "healthLabel"> {
  if (target === null) {
    return { health: "not-configured", healthLabel: "No target configured" };
  }
  if (actual === null) {
    return { health: "unavailable", healthLabel: "Source unavailable" };
  }
  return actual >= target
    ? { health: "healthy", healthLabel: "Target achieved" }
    : { health: "under-target", healthLabel: "Under target" };
}

export function buildHealthMix(rows: readonly TeamPerformanceRow[]) {
  const labels: Record<TeamHealth, string> = {
    healthy: "Healthy",
    "under-target": "Under target",
    "not-configured": "Not configured",
    unavailable: "Unavailable",
  };
  return (Object.keys(labels) as TeamHealth[]).map((health) => ({
    health,
    label: labels[health],
    count: rows.filter((row) => row.health === health).length,
  }));
}
