import { sql } from "drizzle-orm";

import { getDb } from "../src/db";
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_DESCRIPTIONS,
  ROLE_DEFAULT_PERMISSIONS,
} from "../src/admin/policy";
import {
  organizations,
  permissions,
  rolePermissions,
  roles,
} from "../src/db/schema";
import {
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_ORGANIZATION_NAME,
} from "../src/tenancy/constants";

export async function initializeReferenceData() {
  await getDb()
    .insert(organizations)
    .values({
      id: DEFAULT_ORGANIZATION_ID,
      name: DEFAULT_ORGANIZATION_NAME,
      active: true,
    })
    .onDuplicateKeyUpdate({
      set: { name: DEFAULT_ORGANIZATION_NAME, active: true },
    });

  await getDb()
    .insert(roles)
    .values([
      { id: "admin", name: "Administrator", description: "Company-wide administration" },
      { id: "manager", name: "Manager", description: "Assigned-team operations" },
      { id: "agent", name: "Agent", description: "Personal performance access" },
    ])
    .onDuplicateKeyUpdate({ set: { name: sql`values(name)` } });

  await getDb()
    .insert(permissions)
    .values(
      ALL_PERMISSION_KEYS.map((key) => ({
        key,
        description: PERMISSION_DESCRIPTIONS[key],
      })),
    )
    .onDuplicateKeyUpdate({ set: { description: sql`values(description)` } });

  await getDb()
    .insert(rolePermissions)
    .values(
      (["admin", "manager", "agent"] as const).flatMap((roleId) =>
        ROLE_DEFAULT_PERMISSIONS[roleId].map((permissionKey) => ({
          roleId,
          permissionKey,
        })),
      ),
    )
    .onDuplicateKeyUpdate({ set: { permissionKey: sql`values(permission_key)` } });
}
