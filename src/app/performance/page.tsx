import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PerformancePageClient } from "@/components/dashboard/performance/performance-page-client";
import styles from "@/components/dashboard/performance/performance-page.module.css";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { getPerformancePageData } from "@/performance/data";

export const dynamic = "force-dynamic";

function exportHref(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const key of ["range", "from", "to"] as const) {
    const value = params[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first) query.set(key, first);
  }
  const suffix = query.toString();
  return `/api/performance/export${suffix ? `?${suffix}` : ""}`;
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const timeZone = getEnv().GOOGLE_SHEETS_TIMEZONE;
  const dateRange = resolveOverviewDateRange(params, new Date(), timeZone);
  const data = await getPerformancePageData(user, { dateRange, timeZone });

  return (
    <DashboardShell user={user}>
      <section className={`performance-page ${styles.page}`}>
        <header className={styles.pageHeader}>
          <div className={styles.headingCopy}>
            <h1>Performance</h1>
            <p>
              Activity volume, outcomes, and time allocation from the same active data used on the overview.
            </p>
          </div>
          <div className={styles.headerActions}>
            <DashboardDateFilter ariaLabel="Performance date filter" pathname="/performance" range={dateRange} />
            <Link className="ui-button ui-button--secondary" download href={exportHref(params)}>
              <DashboardIcon name="import" />
              Export Data
            </Link>
            {data.role === "agent" ? null : (
              <Link className="ui-button ui-button--primary" href="/agents">
                View Agent Performance
                <DashboardIcon name="arrowRight" />
              </Link>
            )}
          </div>
        </header>
        <PerformancePageClient data={data} exportHref={exportHref(params)} />
      </section>
    </DashboardShell>
  );
}
