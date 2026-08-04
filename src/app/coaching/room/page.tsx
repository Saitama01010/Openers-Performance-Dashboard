import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { NewCoachingSessionDialog } from "@/app/coaching/room/new-coaching-session-dialog";
import {
  COACHING_CATEGORIES,
  COACHING_CATEGORY_LABELS,
  type CoachingCategory,
} from "@/coaching/domain";
import { getCoachingRoomData } from "@/coaching/data";
import { DashboardFilterToolbar } from "@/components/dashboard/dashboard-filter-toolbar";
import { DashboardDateFilter } from "@/components/dashboard/overview-date-filter";
import {
  EmptyTableRow,
  StatusBadge,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { dateKeyInTimeZone } from "@/sheets/timestamp";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function category(value: string | undefined): CoachingCategory | undefined {
  return COACHING_CATEGORIES.includes(value as CoachingCategory)
    ? (value as CoachingCategory)
    : undefined;
}

function pageHref(
  params: Record<string, string | string[] | undefined>,
  page: number,
) {
  const search = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = first(raw);
    if (value && key !== "page") search.set(key, value);
  }
  search.set("page", String(page));
  return `/coaching/room?${search.toString()}`;
}

export default async function CoachingRoomPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (actor.role === "agent") redirect("/flags");
  const params = await searchParams;
  const dateRange = resolveOverviewDateRange(
    params,
    new Date(),
    getEnv().GOOGLE_SHEETS_TIMEZONE,
  );
  const page = Math.max(
    1,
    Math.floor(Number(first(params.page) ?? "1") || 1),
  );
  const data = await getCoachingRoomData(actor, {
    coachProfileId: first(params.coach)?.trim() || undefined,
    teamId: first(params.team)?.trim() || undefined,
    agentProfileId: first(params.agent)?.trim() || undefined,
    category: category(first(params.category)),
    dateRange,
    page,
    pageSize: 20,
  });
  const timeZone = getEnv().GOOGLE_SHEETS_TIMEZONE;
  const totalPages = Math.max(
    1,
    Math.ceil(data.pagination.total / data.pagination.pageSize),
  );

  return (
    <div className="feature-view">
      <div className="feature-view__heading">
        <div>
          <h2>Coaching Room</h2>
          <p>Past sessions appear once, with every in-scope participant grouped together.</p>
        </div>
        <NewCoachingSessionDialog
          actorId={actor.id}
          actorRole={actor.role}
          agents={data.creationAgents}
          coaches={data.coaches}
          today={dateKeyInTimeZone(new Date(), timeZone)}
        />
        <DashboardDateFilter
          ariaLabel="Coaching Room date filter"
          pathname="/coaching/room"
          range={dateRange}
        />
      </div>

      <DashboardFilterToolbar
        ariaLabel="Coaching Room filters"
        filters={[
          ...(actor.role === "admin" ? [{
            kind: "combobox" as const,
            label: "Coach",
            name: "coach",
            value: first(params.coach),
            options: [
              { label: "All coaches", value: "" },
              ...data.coaches.map((coach) => ({ label: coach.name, value: coach.id })),
            ],
          }] : []),
          {
            label: "Team",
            name: "team",
            value: first(params.team),
            options: [
              { label: "All teams", value: "" },
              ...data.teams.map((team) => ({ label: team.name, value: team.id })),
            ],
          },
          {
            kind: "combobox",
            label: "Agent",
            name: "agent",
            value: first(params.agent),
            options: [
              { label: "All agents", value: "" },
              ...data.agents.map((agent) => ({
                label: `${agent.name} — ${agent.teams.map((team) => team.name).join(", ") || "Unassigned"}`,
                value: agent.id,
              })),
            ],
          },
          {
            label: "Category",
            name: "category",
            value: first(params.category),
            options: [
              { label: "All categories", value: "" },
              ...COACHING_CATEGORIES.map((item) => ({
                label: COACHING_CATEGORY_LABELS[item],
                value: item,
              })),
            ],
          },
        ]}
      />

      <section className="ui-card">
        <div className="ui-card__header">
          <div>
            <h2 className="ui-card__title">Past coaching sessions</h2>
            <p className="ui-card__subtitle">Newest sessions first</p>
          </div>
          <p className="feature-count">{data.pagination.total} sessions</p>
        </div>
        <TableScroll label="Past coaching sessions">
          <table className="ui-table feature-table">
            <caption>Past coaching sessions and grouped participants</caption>
            <thead><tr>
              <th scope="col">Session date</th><th scope="col">Coach</th>
              <th scope="col">Category</th><th scope="col">Coached agents</th>
              <th scope="col">Agents</th><th scope="col">Coaching note</th>
              <th scope="col">Created</th>
            </tr></thead>
            <tbody>
              {data.rows.length === 0 ? (
                <EmptyTableRow colSpan={7} title="No coaching sessions found" description="No sessions match the authorized scope and selected filters." />
              ) : data.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.sessionDate}</td>
                  <th scope="row">{row.coachName}</th>
                  <td><StatusBadge tone="info">{COACHING_CATEGORY_LABELS[row.category]}</StatusBadge></td>
                  <td><ul className="feature-name-list">{row.participants.map((participant) => (
                    <li key={participant.id}>{participant.name}<span>{participant.teamName}</span></li>
                  ))}</ul></td>
                  <td className="numeric">{row.participants.length}</td>
                  <td className="feature-note">{row.note ?? "—"}</td>
                  <td>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(row.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        <div className="pagination">
          {page > 1 ? <Link href={pageHref(params, page - 1)}>Previous</Link> : <span className="pagination__disabled">Previous</span>}
          <span>Page {page} of {totalPages}</span>
          {page < totalPages ? <Link href={pageHref(params, page + 1)}>Next</Link> : <span className="pagination__disabled">Next</span>}
        </div>
      </section>
    </div>
  );
}
