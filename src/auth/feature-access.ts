import "server-only";

import {
  canAccessCoaching,
  canAccessCoachingLeaderboard,
  canAccessFlags,
  canCreateCoachingSession,
  type Actor,
} from "@/auth/authorization";
import { assertPermission } from "@/auth/permissions";

export async function assertCoachingViewAccess(actor: Actor) {
  if (!canAccessCoaching(actor.role)) throw new Error("Forbidden");
  await assertPermission(
    actor,
    actor.role === "admin" ? "coaching.view_company" : "coaching.view_team",
  );
}

export async function assertCoachingCreateAccess(actor: Actor) {
  if (!canCreateCoachingSession(actor.role)) throw new Error("Forbidden");
  await assertPermission(
    actor,
    actor.role === "admin"
      ? "coaching.create_company"
      : "coaching.create_team",
  );
}

export async function assertCoachingLeaderboardAccess(actor: Actor) {
  if (!canAccessCoachingLeaderboard(actor.role)) throw new Error("Forbidden");
  await assertPermission(actor, "coaching.view_company");
}

export async function assertFlagsViewAccess(actor: Actor) {
  if (!canAccessFlags(actor.role)) throw new Error("Forbidden");
  await assertPermission(
    actor,
    actor.role === "admin"
      ? "flags.view_company"
      : actor.role === "manager"
        ? "flags.view_team"
        : "flags.view_own",
  );
}

export async function assertCommissionsViewAccess(actor: Actor) {
  await assertPermission(
    actor,
    actor.role === "admin"
      ? "commissions.view_company"
      : actor.role === "manager"
        ? "commissions.view_team"
        : "commissions.view_own",
  );
}

export async function assertCommissionsExportAccess(actor: Actor) {
  if (actor.role === "agent") throw new Error("Forbidden");
  await assertPermission(
    actor,
    actor.role === "admin"
      ? "commissions.export_company"
      : "commissions.export_team",
  );
}
