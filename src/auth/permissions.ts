import "server-only";

import { and, eq } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { resolvePermission } from "@/auth/authorization";
import { getDb } from "@/db";
import { rolePermissions, userPermissionOverrides } from "@/db/schema";
import { OVERRIDABLE_PERMISSION_KEYS } from "@/admin/policy";

export async function hasPermission(actor: Actor, permissionKey: string) {
  const canUseIndividualOverride = OVERRIDABLE_PERMISSION_KEYS.includes(
    permissionKey as (typeof OVERRIDABLE_PERMISSION_KEYS)[number],
  );
  const [overrideRows, roleRows] = await Promise.all([
    canUseIndividualOverride
      ? getDb()
          .select({ allowed: userPermissionOverrides.allowed })
          .from(userPermissionOverrides)
          .where(
            and(
              eq(userPermissionOverrides.profileId, actor.id),
              eq(userPermissionOverrides.permissionKey, permissionKey),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    getDb()
      .select({ permissionKey: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, actor.role),
          eq(rolePermissions.permissionKey, permissionKey),
        ),
      )
      .limit(1),
  ]);

  return resolvePermission(roleRows.length > 0, overrideRows[0]?.allowed ?? null);
}

export async function assertPermission(actor: Actor, permissionKey: string) {
  if (!(await hasPermission(actor, permissionKey))) {
    throw new Error("Forbidden");
  }
}
