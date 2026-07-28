import type {
  AgentMappingStatus,
  AgentPreviewSummary,
} from "@/import/dialer";

export const previewPageSizes = [25, 50, 100] as const;

export type PreviewPageSize = (typeof previewPageSizes)[number];

export type PreviewSortKey =
  | "agent"
  | "calls"
  | "loggedIn"
  | "talk"
  | "idle"
  | "callsPerHour"
  | "mappingStatus"
  | "rowCount";

export type PreviewStatusFilter =
  | "all"
  | AgentMappingStatus
  | "excluded"
  | "invalid_rows";

export const mappingStatusLabels: Record<AgentMappingStatus, string> = {
  mapped: "Mapped",
  unmapped: "Unmatched",
  out_of_scope: "Unauthorized",
  invalid_mapping: "Invalid",
};

function sortValue(agent: AgentPreviewSummary, key: PreviewSortKey) {
  switch (key) {
    case "agent":
      return agent.dialerAgentName.toLowerCase();
    case "calls":
      return agent.calls;
    case "loggedIn":
      return agent.durations.loggedInSeconds;
    case "talk":
      return agent.durations.talkSeconds;
    case "idle":
      return agent.durations.idleSeconds;
    case "callsPerHour":
      return agent.performance.callsPerLoggedInHour ?? -1;
    case "mappingStatus":
      return mappingStatusLabels[agent.mappingStatus];
    case "rowCount":
      return agent.validRowCount;
  }
}

export function getPreviewTeams(agents: AgentPreviewSummary[]) {
  return Array.from(
    new Set(agents.flatMap((agent) => agent.teamNames)),
  ).sort((left, right) => left.localeCompare(right));
}

export function filterPreviewAgents(
  agents: AgentPreviewSummary[],
  filters: {
    query: string;
    status: PreviewStatusFilter;
    team: string;
  },
) {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase();

  return agents.filter((agent) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      agent.dialerAgentName.toLocaleLowerCase().includes(normalizedQuery);
    const matchesTeam =
      filters.team === "all" || agent.teamNames.includes(filters.team);
    const matchesStatus =
      filters.status === "all" ||
      (filters.status === "excluded"
        ? agent.importStatus !== "Ready"
        : filters.status === "invalid_rows"
          ? agent.invalidRowCount > 0
          : agent.mappingStatus === filters.status);

    return matchesQuery && matchesTeam && matchesStatus;
  });
}

export function sortPreviewAgents(
  agents: AgentPreviewSummary[],
  key: PreviewSortKey,
  direction: "asc" | "desc",
) {
  const multiplier = direction === "asc" ? 1 : -1;

  return [...agents].sort((left, right) => {
    const leftValue = sortValue(left, key);
    const rightValue = sortValue(right, key);

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * multiplier;
    }

    return String(leftValue).localeCompare(String(rightValue)) * multiplier;
  });
}

export function paginatePreviewAgents(
  agents: AgentPreviewSummary[],
  requestedPage: number,
  pageSize: PreviewPageSize,
) {
  const totalPages = Math.max(1, Math.ceil(agents.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const startIndex = (page - 1) * pageSize;
  const rows = agents.slice(startIndex, startIndex + pageSize);

  return {
    page,
    rows,
    totalPages,
    from: rows.length === 0 ? 0 : startIndex + 1,
    to: startIndex + rows.length,
  };
}
