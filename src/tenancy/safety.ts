import "server-only";

import { count, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { getEnv } from "@/env";

export function singleTenantInvariantError(activeOrganizationCount: number) {
  if (activeOrganizationCount === 1) return null;
  return `Single-tenant production requires exactly one active organization; found ${activeOrganizationCount}.`;
}

export async function assertProductionSingleTenantInvariant() {
  const env = getEnv();
  if (
    env.NODE_ENV !== "production" ||
    env.DATABASE_ENVIRONMENT !== "production" ||
    env.DEPLOYMENT_ENVIRONMENT !== "production"
  ) {
    return;
  }

  const [row] = await getDb()
    .select({ total: count() })
    .from(organizations)
    .where(eq(organizations.active, true));
  const error = singleTenantInvariantError(Number(row?.total ?? 0));
  if (error) throw new Error(error);
}
