import "server-only";

import { and, eq } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { resolveCurrentActor } from "@/auth/current-actor";
import { assertDashboardExportAccess } from "@/auth/feature-access";
import { getDb } from "@/db";
import { teams } from "@/db/schema";
import { visibleTeamWhere } from "@/teams/visibility";

export async function authorizeDashboardExport(
  actor: Actor,
  requestedTeamId?: string,
) {
  const currentActor = await resolveCurrentActor(actor);
  await assertDashboardExportAccess(currentActor);

  if (!requestedTeamId) return currentActor;

  const [team] = await getDb()
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, requestedTeamId), visibleTeamWhere(currentActor)))
    .limit(1);

  if (!team) throw new Error("Forbidden");
  if (
    currentActor.role === "manager" &&
    !currentActor.teamIds.includes(requestedTeamId)
  ) {
    throw new Error("Forbidden");
  }

  return currentActor;
}
