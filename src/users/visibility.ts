import { and, eq } from "drizzle-orm";

import { profiles } from "@/db/schema";

export function activeProfileWhere(organizationId?: string) {
  return and(
    eq(profiles.accountStatus, "active"),
    eq(profiles.active, true),
    organizationId ? eq(profiles.organizationId, organizationId) : undefined,
  );
}
