import type { Actor } from "@/auth/authorization";

export function assertCommissionTeamFilter(actor: Actor, teamId?: string) {
  if (!teamId) return;
  if (actor.role === "agent") throw new Error("Forbidden");
  if (actor.role === "manager" && !actor.teamIds.includes(teamId)) {
    throw new Error("Forbidden");
  }
}

export function canExportCommissions(actor: Actor) {
  return actor.role === "admin" || actor.role === "manager";
}
