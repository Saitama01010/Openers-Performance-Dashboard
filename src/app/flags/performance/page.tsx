import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { PerformanceFlagsClient } from "@/components/dashboard/flags/flags-page-client";
import styles from "@/components/dashboard/flags/flags-page.module.css";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { getPerformanceFlagsData } from "@/flags/data";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function exportHref(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const key of ["range", "from", "to", "team", "manager", "profile", "wrap", "pause"] as const) {
    const value = first(params[key]);
    if (value) query.set(key, value);
  }
  return `/api/flags/performance/export${query.size ? `?${query}` : ""}`;
}

export default async function PerformanceFlagsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  const params = await searchParams;
  const dateRange = resolveOverviewDateRange(params, new Date(), getEnv().GOOGLE_SHEETS_TIMEZONE);
  const data = await getPerformanceFlagsData(actor, {
    dateRange,
    teamId: first(params.team)?.trim() || undefined,
    managerId: first(params.manager)?.trim() || undefined,
    profileId: first(params.profile)?.trim() || undefined,
    wrap: first(params.wrap) === "flagged" ? "flagged" : "all",
    pause: first(params.pause) === "flagged" ? "flagged" : "all",
    page: positiveInteger(first(params.page), 1),
    pageSize: positiveInteger(first(params.pageSize), 10),
  });
  const filters = actor.role === "agent" ? [] : [
    { label: "Team", name: "team", value: first(params.team), options: [{ label: "All teams", value: "" }, ...data.teams.map((team) => ({ label: team.name, value: team.id }))] },
    ...(actor.role === "admin" ? [{ label: "Manager", name: "manager", value: first(params.manager), options: [{ label: "All managers", value: "" }, ...data.managers.map((manager) => ({ label: manager.name, value: manager.id }))] }] : []),
    { label: "Agent", name: "profile", value: first(params.profile), options: [{ label: "All agents", value: "" }, ...data.agents.map((agent) => ({ label: `${agent.name} — ${agent.teams.map((team) => team.name).join(", ") || "Unassigned"}`, value: agent.id }))] },
    { label: "Wrap flag type", name: "wrap", value: first(params.wrap) ?? "all", options: [{ label: "All", value: "all" }, { label: "Wrap flagged", value: "flagged" }] },
    { label: "Pause flag type", name: "pause", value: first(params.pause) ?? "all", options: [{ label: "All", value: "all" }, { label: "Pause flagged", value: "flagged" }] },
  ];
  return <>
    <div className={styles.dateRow}><DashboardDateFilter ariaLabel="Performance flags date filter" pathname="/flags/performance" range={dateRange} /></div>
    <PerformanceFlagsClient data={data} exportHref={exportHref(params)} filters={filters} />
  </>;
}
