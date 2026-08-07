import type { OverviewDateRange } from "@/dashboard/date-range";

export type AgentDirectorySortKey =
  | "logged-in"
  | "transfers"
  | "closed-deals"
  | "conversion"
  | "talk-percentage";
export type AgentDirectoryDirection = "asc" | "desc";
export type AgentDirectoryView = "all" | "top" | "attention";
export type AgentDirectoryDataFilter = "all" | "with-data" | "without-data";

export type AgentDirectoryFilters = {
  query: string;
  teamId: string;
  status: string;
  data: AgentDirectoryDataFilter;
  sortBy: AgentDirectorySortKey;
  direction: AgentDirectoryDirection;
  view: AgentDirectoryView;
  page: number;
};

export type AgentDirectoryTrendPoint = {
  date: string;
  loggedInSeconds: number | null;
  talkPercentage: number | null;
  transfers: number | null;
  closedDeals: number | null;
  conversion: number | null;
};

export type AgentDirectoryComparison = {
  loggedInSeconds: number | null;
  talkPercentage: number | null;
  transfers: number | null;
  closedDeals: number | null;
  conversion: number | null;
};

export type AgentDirectoryRow = {
  profileId: string;
  realName: string;
  americanName: string | null;
  teamId: string | null;
  teamIds: string[];
  teamName: string;
  accountStatus: "invited" | "active" | "deactivated" | "revoked" | "deleted";
  hasMetrics: boolean;
  loggedInSeconds: number | null;
  talkSeconds: number | null;
  talkPercentage: number | null;
  transfers: number | null;
  closedDeals: number | null;
  conversion: number | null;
  comparison: AgentDirectoryComparison | null;
  trend: AgentDirectoryTrendPoint[];
};

export type AgentDirectoryKpis = {
  totalAgents: number;
  activeAccounts: number;
  activeAccountRate: number | null;
  averageLoggedInSeconds: number | null;
  averageLoggedInComparison: number | null;
  averageTalkPercentage: number | null;
  averageTalkComparison: number | null;
  loggedInSampleSize: number;
  talkSampleSize: number;
};

export type AgentDirectoryData = {
  role: "admin" | "manager" | "agent";
  range: OverviewDateRange;
  filters: AgentDirectoryFilters;
  rows: AgentDirectoryRow[];
  teams: Array<{ id: string; name: string }>;
  statuses: string[];
  kpis: AgentDirectoryKpis;
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

const SORT_KEYS = new Set<AgentDirectorySortKey>([
  "logged-in",
  "transfers",
  "closed-deals",
  "conversion",
  "talk-percentage",
]);

export function resolveAgentDirectoryFilters(params: RawParams): AgentDirectoryFilters {
  const sort = first(params.sort);
  const data = first(params.data);
  const view = first(params.view);
  const direction = first(params.direction);
  const page = Number.parseInt(first(params.page) ?? "1", 10);

  return {
    query: (first(params.q) ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 120),
    teamId: (first(params.team) ?? "").trim().slice(0, 80),
    status: (first(params.status) ?? "").trim().toLocaleLowerCase("en-US").slice(0, 32),
    data: data === "all" || data === "without-data" ? data : "with-data",
    sortBy: SORT_KEYS.has(sort as AgentDirectorySortKey)
      ? (sort as AgentDirectorySortKey)
      : "logged-in",
    direction: direction === "asc" ? "asc" : "desc",
    view: view === "top" || view === "attention" ? view : "all",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function calculateConversion(closedDeals: number | null, transfers: number | null) {
  return closedDeals === null || transfers === null || transfers <= 0
    ? null
    : (closedDeals / transfers) * 100;
}

function normalized(value: string | null) {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .trim();
}

export function sortValue(row: AgentDirectoryRow, key: AgentDirectorySortKey) {
  if (key === "transfers") return row.transfers;
  if (key === "closed-deals") return row.closedDeals;
  if (key === "conversion") return row.conversion;
  if (key === "talk-percentage") return row.talkPercentage;
  return row.loggedInSeconds;
}

function compareRows(
  left: AgentDirectoryRow,
  right: AgentDirectoryRow,
  key: AgentDirectorySortKey,
  direction: AgentDirectoryDirection,
) {
  const leftValue = sortValue(left, key);
  const rightValue = sortValue(right, key);
  if (leftValue === null && rightValue !== null) return 1;
  if (leftValue !== null && rightValue === null) return -1;
  if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
    return direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
  }
  return left.realName.localeCompare(right.realName, "en", { sensitivity: "base" });
}

function average(values: Array<number | null>) {
  const available = values.filter((value): value is number => value !== null);
  return available.length === 0
    ? { value: null, count: 0 }
    : {
        value: available.reduce((sum, value) => sum + value, 0) / available.length,
        count: available.length,
      };
}

export function calculateAgentDirectoryKpis(rows: readonly AgentDirectoryRow[]): AgentDirectoryKpis {
  const logged = average(rows.map((row) => row.loggedInSeconds));
  const talk = average(rows.map((row) => row.talkPercentage));
  const previousLogged = average(rows.map((row) => row.comparison?.loggedInSeconds ?? null));
  const previousTalk = average(rows.map((row) => row.comparison?.talkPercentage ?? null));
  const activeAccounts = rows.filter((row) => row.accountStatus === "active").length;

  return {
    totalAgents: rows.length,
    activeAccounts,
    activeAccountRate: rows.length > 0 ? (activeAccounts / rows.length) * 100 : null,
    averageLoggedInSeconds: logged.value,
    averageLoggedInComparison: previousLogged.value,
    averageTalkPercentage: talk.value,
    averageTalkComparison: previousTalk.value,
    loggedInSampleSize: logged.count,
    talkSampleSize: talk.count,
  };
}

export function prepareAgentDirectoryRows(
  rows: readonly AgentDirectoryRow[],
  filters: AgentDirectoryFilters,
  pageSize = 12,
) {
  const query = normalized(filters.query);
  let filtered = rows.filter((row) => {
    if (
      query &&
      !normalized(row.realName).includes(query) &&
      !normalized(row.americanName).includes(query)
    ) return false;
    if (filters.teamId && !row.teamIds.includes(filters.teamId)) return false;
    if (filters.status && row.accountStatus !== filters.status) return false;
    if (filters.data === "with-data" && !row.hasMetrics) return false;
    if (filters.data === "without-data" && row.hasMetrics) return false;
    return true;
  });

  filtered = [...filtered].sort((left, right) =>
    compareRows(left, right, filters.sortBy, filters.direction),
  );

  if (filters.view === "attention") {
    filtered = filtered.filter((row) => !row.hasMetrics);
  } else if (filters.view === "top") {
    const ranked = filtered.filter((row) => sortValue(row, filters.sortBy) !== null);
    const topCount = Math.max(1, Math.ceil(ranked.length * 0.2));
    filtered = ranked.slice(0, topCount);
  }

  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(filters.page, totalPages);
  const fromIndex = (page - 1) * pageSize;
  const pageRows = filtered.slice(fromIndex, fromIndex + pageSize);

  return {
    allRows: filtered,
    pageRows,
    pagination: {
      page,
      pageSize,
      totalRows,
      totalPages,
      from: totalRows === 0 ? 0 : fromIndex + 1,
      to: Math.min(fromIndex + pageSize, totalRows),
    },
  };
}
