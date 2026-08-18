import type { TargetProgress } from "@/dashboard/target-evaluation";

export const MANAGER_AGENT_SORT_KEYS = [
  "agent", "team", "coverage", "today", "month", "target", "rank", "coaching", "flags", "status",
] as const;

export type ManagerAgentSortKey = (typeof MANAGER_AGENT_SORT_KEYS)[number];
export type ManagerAgentSortDirection = "asc" | "desc";

type SortableManagerAgent = {
  agentName: string;
  automaticFlags: { triggeredFlags: readonly string[] };
  coachingPending: number;
  coverage: { status: string; percentage?: number };
  lowPerformance: { isLowPerformer: boolean };
  manualFlagCount: number;
  monthTargetProgress: TargetProgress | null;
  monthTransfers: { value: number | null };
  team: { name: string } | null;
  transferFlagCount: number;
  transfers: { value: number | null };
  weeklyRank: number | null;
};

export function resolveManagerAgentSort(requestedSort?: string, requestedDirection?: string) {
  const key: ManagerAgentSortKey = MANAGER_AGENT_SORT_KEYS.includes(requestedSort as ManagerAgentSortKey)
    ? requestedSort as ManagerAgentSortKey
    : "agent";
  const direction: ManagerAgentSortDirection = requestedDirection === "desc" ? "desc" : "asc";
  return { key, direction };
}

export function sortManagerAgentRows<T extends SortableManagerAgent>(
  rows: readonly T[],
  sort: { key: ManagerAgentSortKey; direction: ManagerAgentSortDirection },
) {
  const flagCount = (row: T) =>
    row.automaticFlags.triggeredFlags.length + row.transferFlagCount + row.manualFlagCount;
  const value = (row: T): string | number | null => {
    switch (sort.key) {
      case "agent": return row.agentName;
      case "team": return row.team?.name ?? null;
      case "coverage": return row.coverage.status === "ready" ? row.coverage.percentage ?? null : null;
      case "today": return row.transfers.value;
      case "month": return row.monthTransfers.value;
      case "target": return row.monthTargetProgress?.status === "not_configured" ? null : row.monthTargetProgress?.percentage ?? null;
      case "rank": return row.weeklyRank;
      case "coaching": return row.coachingPending;
      case "flags": return flagCount(row);
      case "status": return row.lowPerformance.isLowPerformer ? 2 : flagCount(row) ? 1 : 0;
    }
  };

  return [...rows].sort((left, right) => {
    const leftValue = value(left);
    const rightValue = value(right);
    if (leftValue === null) return rightValue === null ? left.agentName.localeCompare(right.agentName) : 1;
    if (rightValue === null) return -1;
    const comparison = typeof leftValue === "string" && typeof rightValue === "string"
      ? leftValue.localeCompare(rightValue, "en", { sensitivity: "base" })
      : Number(leftValue) - Number(rightValue);
    return (sort.direction === "asc" ? comparison : -comparison) || left.agentName.localeCompare(right.agentName);
  });
}
