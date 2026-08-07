import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import { TeamPerformanceClient } from "@/components/dashboard/team-performance/team-performance-client";
import styles from "@/components/dashboard/team-performance/team-performance.module.css";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { resolveTeamPerformanceFilters } from "@/teams/performance-analytics";
import { getTeamPerformanceData } from "@/teams/performance";

export const dynamic = "force-dynamic";

function exportHref(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const key of [
    "range",
    "from",
    "to",
    "q",
    "status",
    "metric",
    "sort",
    "direction",
    "view",
  ] as const) {
    const value = params[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first) query.set(key, first);
  }
  const suffix = query.toString();
  return `/api/teams/performance/export${suffix ? `?${suffix}` : ""}`;
}

export default async function TeamPerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "agent") redirect("/performance");

  const params = await searchParams;
  const range = resolveOverviewDateRange(
    params,
    new Date(),
    getEnv().GOOGLE_SHEETS_TIMEZONE,
  );
  const data = await getTeamPerformanceData(user, {
    dateRange: range,
    filters: resolveTeamPerformanceFilters(params),
  });
  const downloadHref = exportHref(params);

  return (
    <DashboardShell user={user}>
      <section className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.heading}>
            <span className={styles.eyebrow}>Comparison</span>
            <h1>Team performance</h1>
            <p>Track and compare performance across your teams and drill into the teams that need attention.</p>
          </div>
          <div className={styles.headerActions}>
            <DashboardDateFilter
              ariaLabel="Team performance date filter"
              pathname="/teams/performance"
              range={range}
            />
            <Link className={styles.headerExport} download href={downloadHref}>
              <DashboardIcon name="import" />
              Export
            </Link>
          </div>
        </header>
        <TeamPerformanceClient data={data} exportHref={downloadHref} />
      </section>
    </DashboardShell>
  );
}
