import { and, eq, isNull } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { teams } from "@/db/schema";
import { DEFAULT_ORGANIZATION_ID } from "@/tenancy/constants";

export function actorOrganizationId(actor: Actor) {
  return actor.organizationId ?? DEFAULT_ORGANIZATION_ID;
}

export function visibleTeamWhere(actor: Actor) {
  return and(
    eq(teams.organizationId, actorOrganizationId(actor)),
    eq(teams.active, true),
    isNull(teams.archivedAt),
    isNull(teams.deletedAt),
  );
}

export function teamBelongsToActorWhere(actor: Actor) {
  return and(
    eq(teams.organizationId, actorOrganizationId(actor)),
    isNull(teams.archivedAt),
    isNull(teams.deletedAt),
  );
}

export function normalizeTeamName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
