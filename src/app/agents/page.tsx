import { redirect } from "next/navigation";

import { resolveAgentDirectoryFilters } from "@/agents/directory-analytics";
import { getAgentDirectoryData } from "@/agents/directory";
import { getCurrentUser } from "@/auth/session";
import { AgentsPageClient } from "@/components/dashboard/agents/agents-page-client";
import styles from "@/components/dashboard/agents/agents-page.module.css";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

function exportHref(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const key of [
    "range",
    "from",
    "to",
    "q",
    "team",
    "status",
    "data",
    "sort",
    "direction",
    "view",
  ] as const) {
    const value = params[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first) query.set(key, first);
  }
  const suffix = query.toString();
  return `/api/agents/export${suffix ? `?${suffix}` : ""}`;
}

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const timeZone = getEnv().GOOGLE_SHEETS_TIMEZONE;
  const range = resolveOverviewDateRange(params, new Date(), timeZone);
  const data = await getAgentDirectoryData(user, {
    dateRange: range,
    filters: resolveAgentDirectoryFilters(params),
  });

  return (
    <DashboardShell user={user}>
      <section className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.headingCopy}>
            <span className={styles.eyebrow}>Directory</span>
            <h1>{data.role === "agent" ? "My performance record" : "Agents"}</h1>
            <p>Find people in your reporting scope and open their active-version performance.</p>
          </div>
          <div className={styles.headerActions}>
            <DashboardDateFilter ariaLabel="Agents date filter" pathname="/agents" range={range} />
          </div>
        </header>
        <AgentsPageClient data={data} exportHref={exportHref(params)} />
      </section>
    </DashboardShell>
  );
}
