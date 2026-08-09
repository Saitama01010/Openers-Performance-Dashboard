import { addDateKeyDays, normalizeWeekStart } from "@/coaching/week";

export type FlagPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PerformanceAnalyticsRow = {
  agentId: string;
  teamIds: string[];
  teamNames: string[];
  wrapFlag: boolean;
  pauseFlag: boolean;
};

export type PerformanceWeeklyRow = PerformanceAnalyticsRow & {
  weekStart: string;
  weekEnd: string;
};

export type TransferAnalyticsRow = {
  agentId: string;
  teamNames: string[];
  classification: "strong" | "improvement";
  week: { start: string; end: string };
};

export function paginateRows<T>(
  rows: readonly T[],
  requestedPage?: number,
  requestedPageSize?: number,
) {
  const pageSize = requestedPageSize === undefined
    ? 50
    : Math.min(100, Math.max(1, requestedPageSize));
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, requestedPage ?? 1));
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total: rows.length, totalPages },
  };
}

function addTeam<T extends { total: number; agents: Set<string> }>(
  map: Map<string, T>,
  names: readonly string[],
  agentId: string,
  create: () => T,
  update: (value: T) => void,
) {
  for (const teamName of names.length ? names : ["Unassigned"]) {
    const value = map.get(teamName) ?? create();
    value.total += 1;
    value.agents.add(agentId);
    update(value);
    map.set(teamName, value);
  }
}

export function aggregatePerformanceFlags(
  rows: readonly PerformanceAnalyticsRow[],
  weeklyRows: readonly PerformanceWeeklyRow[],
) {
  const wrapAgents = new Set(rows.filter((row) => row.wrapFlag).map((row) => row.agentId));
  const pauseAgents = new Set(rows.filter((row) => row.pauseFlag).map((row) => row.agentId));
  const teams = new Map<string, {
    teamName: string;
    total: number;
    wrapFlags: number;
    pauseFlags: number;
    agents: Set<string>;
  }>();
  for (const row of rows) {
    if (row.wrapFlag) {
      addTeam(teams, row.teamNames, row.agentId, () => ({ teamName: "", total: 0, wrapFlags: 0, pauseFlags: 0, agents: new Set() }), (value) => { value.wrapFlags += 1; });
    }
    if (row.pauseFlag) {
      addTeam(teams, row.teamNames, row.agentId, () => ({ teamName: "", total: 0, wrapFlags: 0, pauseFlags: 0, agents: new Set() }), (value) => { value.pauseFlags += 1; });
    }
  }
  const trend = new Map<string, {
    weekStart: string;
    weekEnd: string;
    wrapFlags: number;
    pauseFlags: number;
    agents: Set<string>;
  }>();
  for (const row of weeklyRows) {
    const value = trend.get(row.weekStart) ?? {
      weekStart: row.weekStart,
      weekEnd: row.weekEnd,
      wrapFlags: 0,
      pauseFlags: 0,
      agents: new Set<string>(),
    };
    if (row.wrapFlag) value.wrapFlags += 1;
    if (row.pauseFlag) value.pauseFlags += 1;
    if (row.wrapFlag || row.pauseFlag) value.agents.add(row.agentId);
    trend.set(row.weekStart, value);
  }
  return {
    composition: [
      { key: "wrap" as const, label: "Wrap Flags", count: rows.filter((row) => row.wrapFlag).length, agents: wrapAgents.size },
      { key: "pause" as const, label: "Pause Flags", count: rows.filter((row) => row.pauseFlag).length, agents: pauseAgents.size },
    ],
    teams: Array.from(teams.entries()).map(([teamName, value]) => ({
      teamName,
      total: value.total,
      wrapFlags: value.wrapFlags,
      pauseFlags: value.pauseFlags,
      agents: value.agents.size,
    })).sort((left, right) => right.total - left.total || left.teamName.localeCompare(right.teamName)),
    trend: Array.from(trend.values()).map((value) => ({
      weekStart: value.weekStart,
      weekEnd: value.weekEnd,
      wrapFlags: value.wrapFlags,
      pauseFlags: value.pauseFlags,
      agents: value.agents.size,
    })).sort((left, right) => left.weekStart.localeCompare(right.weekStart)),
  };
}

export function aggregateTransferFlags(rows: readonly TransferAnalyticsRow[]) {
  const strongAgents = new Set(rows.filter((row) => row.classification === "strong").map((row) => row.agentId));
  const improvementAgents = new Set(rows.filter((row) => row.classification === "improvement").map((row) => row.agentId));
  const weeksByAgent = new Map<string, Set<string>>();
  const teams = new Map<string, {
    total: number;
    strongFlags: number;
    improvementFlags: number;
    agents: Set<string>;
  }>();
  const trend = new Map<string, {
    weekStart: string;
    weekEnd: string;
    strongFlags: number;
    improvementFlags: number;
    agents: Set<string>;
  }>();
  for (const row of rows) {
    const weeks = weeksByAgent.get(row.agentId) ?? new Set<string>();
    weeks.add(row.week.start);
    weeksByAgent.set(row.agentId, weeks);
    addTeam(teams, row.teamNames, row.agentId, () => ({ total: 0, strongFlags: 0, improvementFlags: 0, agents: new Set() }), (value) => {
      if (row.classification === "strong") value.strongFlags += 1;
      else value.improvementFlags += 1;
    });
    const point = trend.get(row.week.start) ?? {
      weekStart: row.week.start,
      weekEnd: row.week.end,
      strongFlags: 0,
      improvementFlags: 0,
      agents: new Set<string>(),
    };
    if (row.classification === "strong") point.strongFlags += 1;
    else point.improvementFlags += 1;
    point.agents.add(row.agentId);
    trend.set(row.week.start, point);
  }
  return {
    repeatFlaggedAgents: Array.from(weeksByAgent.values()).filter((weeks) => weeks.size > 1).length,
    composition: [
      { key: "strong" as const, label: "Strong Weekly Flags", count: rows.filter((row) => row.classification === "strong").length, agents: strongAgents.size },
      { key: "improvement" as const, label: "Improvement Weekly Flags", count: rows.filter((row) => row.classification === "improvement").length, agents: improvementAgents.size },
    ],
    teams: Array.from(teams.entries()).map(([teamName, value]) => ({
      teamName,
      total: value.total,
      strongFlags: value.strongFlags,
      improvementFlags: value.improvementFlags,
      agents: value.agents.size,
    })).sort((left, right) => right.total - left.total || left.teamName.localeCompare(right.teamName)),
    trend: Array.from(trend.values()).map((value) => ({
      weekStart: value.weekStart,
      weekEnd: value.weekEnd,
      strongFlags: value.strongFlags,
      improvementFlags: value.improvementFlags,
      agents: value.agents.size,
    })).sort((left, right) => left.weekStart.localeCompare(right.weekStart)),
  };
}

export function weekForDate(date: string) {
  const weekStart = normalizeWeekStart(date);
  return weekStart ? { weekStart, weekEnd: addDateKeyDays(weekStart, 6) } : null;
}
