import "server-only";

import { cache } from "react";
import { and, eq, isNull } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import { profiles, teamMemberships, teams } from "@/db/schema";

declare const currentActorBrand: unique symbol;

export type CurrentActor = Actor & { readonly [currentActorBrand]: true };

const resolveCurrentActorByIdentity = cache(async (
  actorId: string,
): Promise<CurrentActor> => {
  const [profile] = await getDb()
    .select({
      id: profiles.id,
      role: profiles.role,
      organizationId: profiles.organizationId,
    })
    .from(profiles)
    .where(
      and(
        eq(profiles.id, actorId),
        eq(profiles.active, true),
        eq(profiles.accountStatus, "active"),
        isNull(profiles.deletedAt),
      ),
    )
    .limit(1);

  if (!profile) throw new Error("Forbidden");

  const memberships = await getDb()
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .innerJoin(
      teams,
      and(
        eq(teams.id, teamMemberships.teamId),
        eq(teams.organizationId, profile.organizationId),
        eq(teams.active, true),
        isNull(teams.archivedAt),
        isNull(teams.deletedAt),
      ),
    )
    .where(
      and(
        eq(teamMemberships.profileId, profile.id),
        eq(teamMemberships.role, profile.role),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
      ),
    );

  return {
    id: profile.id,
    role: profile.role,
    organizationId: profile.organizationId,
    teamIds: Array.from(new Set(memberships.map((membership) => membership.teamId))),
  } as CurrentActor;
});

export async function resolveCurrentActor(actor: Actor): Promise<CurrentActor> {
  return resolveCurrentActorByIdentity(actor.id);
}
