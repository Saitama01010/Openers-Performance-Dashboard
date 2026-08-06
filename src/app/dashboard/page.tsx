import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import {
  AdminRoleDashboard,
  AgentRoleDashboard,
  ManagerRoleDashboard,
} from "@/components/dashboard/role-dashboard";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getRoleDashboardData } from "@/dashboard/role-data";
import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const dateRange = resolveOverviewDateRange(
    params,
    new Date(),
    getEnv().GOOGLE_SHEETS_TIMEZONE,
  );
  const requestedPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const dashboard = await getRoleDashboardData(user, {
    dateRange,
    page: Number(requestedPage) || 1,
  });

  return (
    <DashboardShell user={user}>
      {dashboard.role === "agent" ? (
        <AgentRoleDashboard data={dashboard.data} userId={user.id} />
      ) : dashboard.role === "manager" ? (
        <ManagerRoleDashboard data={dashboard.data} />
      ) : (
        <AdminRoleDashboard data={dashboard.data} />
      )}
    </DashboardShell>
  );
}
