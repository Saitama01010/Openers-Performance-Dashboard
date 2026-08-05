import type { Actor } from "@/auth/authorization";
import type { DashboardDateWindow } from "@/dashboard/date-range";

type AgentScopedFlagFilters = {
  dateRange: DashboardDateWindow;
  teamId?: string;
  managerId?: string;
  profileId?: string;
};

export function enforceFlagRequestScope<T extends AgentScopedFlagFilters>(
  actor: Actor,
  filters: T,
): T {
  if (actor.role !== "agent") return filters;
  if (filters.profileId && filters.profileId !== actor.id) {
    throw new Error("Forbidden");
  }
  return {
    ...filters,
    profileId: actor.id,
    teamId: undefined,
    managerId: undefined,
  };
}

export function canViewAggregateFlagSummary(actor: Actor) {
  return actor.role === "admin" || actor.role === "manager";
}
