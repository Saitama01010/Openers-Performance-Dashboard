import "server-only";

import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNull,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { formatAuditEvent } from "@/admin/audit-format";
import type { Actor } from "@/auth/authorization";
import { resolveCurrentActor } from "@/auth/current-actor";
import { getDb } from "@/db";
import { auditLogs, profiles, teamMemberships, teams } from "@/db/schema";
import { resolveOverviewDateRange } from "@/dashboard/date-range";
import { getEnv } from "@/env";
import { resolveTeamPerformanceFilters } from "@/teams/performance-analytics";
import { getTeamPerformanceData } from "@/teams/performance";
import {
  actorOrganizationId,
  normalizeTeamName,
  teamBelongsToActorWhere,
} from "@/teams/visibility";

export type AdminTeamStatusFilter = "active" | "inactive" | "";
export type AdminTeamSort = "name" | "members" | "agents" | "status" | "created";
export type AdminTeamDirection = "asc" | "desc";

export type AdminTeamDirectoryFilters = {
  query: string;
  status: AdminTeamStatusFilter;
  managerId: string;
  sortBy: AdminTeamSort;
  direction: AdminTeamDirection;
  page: number;
  pageSize: number;
};

export type AdminTeamDirectoryRow = {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  memberCount: number;
  agentCount: number;
  activeAgentCount: number;
  managerCount: number;
  managers: Array<{
    id: string;
    name: string;
    email: string | null;
    accountStatus: string;
  }>;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveAdminTeamDirectoryFilters(
  params: RawParams,
): AdminTeamDirectoryFilters {
  const status = first(params.status);
  const sortBy = first(params.sort);
  const direction = first(params.direction);
  const pageSize = positiveInteger(first(params.pageSize), 10);

  return {
    query: (first(params.q) ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 120),
    status: status === "active" || status === "inactive" ? status : "",
    managerId: (first(params.manager) ?? "").trim().slice(0, 80),
    sortBy: ["name", "members", "agents", "status", "created"].includes(
      sortBy ?? "",
    )
      ? (sortBy as AdminTeamSort)
      : "name",
    direction: direction === "desc" ? "desc" : "asc",
    page: positiveInteger(first(params.page), 1),
    pageSize: [10, 25, 50].includes(pageSize) ? pageSize : 10,
  };
}

function assertAdmin(actor: Actor) {
  if (actor.role !== "admin") throw new Error("Forbidden");
}

function currentMembershipJoin() {
  return and(
    eq(teamMemberships.teamId, teams.id),
    eq(teamMemberships.active, true),
    isNull(teamMemberships.endedAt),
  );
}

function currentProfileJoin() {
  return and(
    eq(profiles.id, teamMemberships.profileId),
    isNull(profiles.deletedAt),
    eq(profiles.role, teamMemberships.role),
  );
}

function directoryWhere(actor: Actor, filters: AdminTeamDirectoryFilters) {
  const managerFilter = filters.managerId
    ? sql`exists (
        select 1 from ${teamMemberships} filtered_membership
        inner join ${profiles} filtered_profile on filtered_profile.id = filtered_membership.profile_id
        where filtered_membership.team_id = ${teams.id}
          and filtered_membership.profile_id = ${filters.managerId}
          and filtered_membership.membership_role = 'manager'
          and filtered_membership.active = true
          and filtered_membership.ended_at is null
          and filtered_profile.deleted_at is null
      )`
    : undefined;

  return and(
    teamBelongsToActorWhere(actor),
    filters.query
      ? like(sql`lower(${teams.name})`, `%${normalizeTeamName(filters.query)}%`)
      : undefined,
    filters.status ? eq(teams.active, filters.status === "active") : undefined,
    managerFilter,
  );
}

const memberCountSql = sql<number>`count(distinct ${profiles.id})`;
const agentCountSql = sql<number>`count(distinct case when ${teamMemberships.role} = 'agent' and ${profiles.id} is not null then ${profiles.id} end)`;
const activeAgentCountSql = sql<number>`count(distinct case when ${teamMemberships.role} = 'agent' and ${profiles.id} is not null and ${profiles.accountStatus} = 'active' and ${profiles.active} = true then ${profiles.id} end)`;
const managerCountSql = sql<number>`count(distinct case when ${teamMemberships.role} = 'manager' and ${profiles.id} is not null then ${profiles.id} end)`;

function orderExpression(filters: AdminTeamDirectoryFilters): SQL {
  const expression =
    filters.sortBy === "members"
      ? memberCountSql
      : filters.sortBy === "agents"
        ? agentCountSql
        : filters.sortBy === "status"
          ? teams.active
          : filters.sortBy === "created"
            ? teams.createdAt
            : teams.name;
  return filters.direction === "desc" ? desc(expression) : asc(expression);
}

export async function listAdminTeamsDirectory(
  actor: Actor,
  filters: AdminTeamDirectoryFilters,
  options: { allRows?: boolean } = {},
) {
  assertAdmin(actor);
  const where = directoryWhere(actor, filters);
  const [totalRowsResult, managerOptions] = await Promise.all([
    getDb().select({ count: count() }).from(teams).where(where),
    listTeamManagerOptions(actor),
  ]);

  const totalRows = Number(totalRowsResult[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / filters.pageSize));
  const page = options.allRows ? 1 : Math.min(filters.page, totalPages);
  const rawRows = await getDb()
    .select({
      id: teams.id,
      name: teams.name,
      active: teams.active,
      createdAt: teams.createdAt,
      updatedAt: teams.updatedAt,
      memberCount: memberCountSql,
      agentCount: agentCountSql,
      activeAgentCount: activeAgentCountSql,
      managerCount: managerCountSql,
    })
    .from(teams)
    .leftJoin(teamMemberships, currentMembershipJoin())
    .leftJoin(profiles, currentProfileJoin())
    .where(where)
    .groupBy(
      teams.id,
      teams.name,
      teams.active,
      teams.createdAt,
      teams.updatedAt,
    )
    .orderBy(orderExpression(filters), asc(teams.name), asc(teams.id))
    .limit(options.allRows ? 10_000 : filters.pageSize)
    .offset(options.allRows ? 0 : (page - 1) * filters.pageSize);
  const teamIds = rawRows.map((row) => row.id);
  const managerRows = teamIds.length
    ? await getDb()
        .select({
          teamId: teamMemberships.teamId,
          id: profiles.id,
          name: profiles.name,
          email: profiles.email,
          accountStatus: profiles.accountStatus,
        })
        .from(teamMemberships)
        .innerJoin(profiles, currentProfileJoin())
        .where(
          and(
            inArray(teamMemberships.teamId, teamIds),
            eq(teamMemberships.active, true),
            isNull(teamMemberships.endedAt),
            eq(teamMemberships.role, "manager"),
          ),
        )
        .orderBy(asc(profiles.name), asc(profiles.id))
    : [];
  const managersByTeam = new Map<string, AdminTeamDirectoryRow["managers"]>();
  for (const manager of managerRows) {
    const values = managersByTeam.get(manager.teamId) ?? [];
    values.push({
      id: manager.id,
      name: manager.name,
      email: manager.email,
      accountStatus: manager.accountStatus,
    });
    managersByTeam.set(manager.teamId, values);
  }
  const rows: AdminTeamDirectoryRow[] = rawRows.map((row) => ({
    ...row,
    memberCount: Number(row.memberCount ?? 0),
    agentCount: Number(row.agentCount ?? 0),
    activeAgentCount: Number(row.activeAgentCount ?? 0),
    managerCount: Number(row.managerCount ?? 0),
    managers: managersByTeam.get(row.id) ?? [],
  }));

  return {
    rows,
    managerOptions,
    pagination: {
      page,
      pageSize: filters.pageSize,
      totalRows,
      totalPages,
      from: totalRows === 0 ? 0 : (page - 1) * filters.pageSize + 1,
      to: Math.min(totalRows, page * filters.pageSize),
    },
  };
}

export async function listTeamManagerOptions(actor: Actor) {
  assertAdmin(actor);
  return getDb()
    .selectDistinct({ id: profiles.id, name: profiles.name })
    .from(profiles)
    .innerJoin(teamMemberships, eq(teamMemberships.profileId, profiles.id))
    .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(
      and(
        teamBelongsToActorWhere(actor),
        eq(teamMemberships.active, true),
        isNull(teamMemberships.endedAt),
        eq(teamMemberships.role, "manager"),
        eq(profiles.role, "manager"),
        isNull(profiles.deletedAt),
      ),
    )
    .orderBy(asc(profiles.name), asc(profiles.id));
}

export async function getAdminTeamStats(actor: Actor) {
  assertAdmin(actor);
  const teamScope = teamBelongsToActorWhere(actor);
  const [teamRows, membershipRows] = await Promise.all([
    getDb()
      .select({
        total: count(),
        active: sql<number>`sum(case when ${teams.active} = true then 1 else 0 end)`,
        inactive: sql<number>`sum(case when ${teams.active} = false then 1 else 0 end)`,
      })
      .from(teams)
      .where(teamScope),
    getDb()
      .select({
        totalMembers: countDistinct(teamMemberships.id),
        activeAgents: sql<number>`count(distinct case when ${teams.active} = true and ${teamMemberships.role} = 'agent' and ${profiles.role} = 'agent' and ${profiles.accountStatus} = 'active' and ${profiles.active} = true then ${profiles.id} end)`,
        uniqueManagers: sql<number>`count(distinct case when ${teamMemberships.role} = 'manager' and ${profiles.role} = 'manager' then ${profiles.id} end)`,
      })
      .from(teamMemberships)
      .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
      .innerJoin(profiles, eq(profiles.id, teamMemberships.profileId))
      .where(
        and(
          teamScope,
          eq(teamMemberships.active, true),
          isNull(teamMemberships.endedAt),
          isNull(profiles.deletedAt),
          eq(profiles.role, teamMemberships.role),
        ),
      ),
  ]);
  return {
    totalTeams: Number(teamRows[0]?.total ?? 0),
    activeTeams: Number(teamRows[0]?.active ?? 0),
    inactiveTeams: Number(teamRows[0]?.inactive ?? 0),
    totalMembers: Number(membershipRows[0]?.totalMembers ?? 0),
    activeAgents: Number(membershipRows[0]?.activeAgents ?? 0),
    teamManagers: Number(membershipRows[0]?.uniqueManagers ?? 0),
  };
}

export async function getAdminTeamDetails(
  actor: Actor,
  teamId: string,
  options: { memberQuery?: string; memberPage?: number; memberPageSize?: number } = {},
) {
  assertAdmin(actor);
  const [team] = await getDb()
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), teamBelongsToActorWhere(actor)))
    .limit(1);
  if (!team) return null;

  const memberQuery = (options.memberQuery ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 120);
  const memberPageSize = [10, 25, 50].includes(options.memberPageSize ?? 25) ? (options.memberPageSize ?? 25) : 25;
  const baseMemberWhere = and(
    eq(teamMemberships.teamId, teamId),
    eq(teamMemberships.active, true),
    isNull(teamMemberships.endedAt),
    isNull(profiles.deletedAt),
    eq(profiles.role, teamMemberships.role),
  );
  const memberWhere = and(
    baseMemberWhere,
    memberQuery
      ? or(
          like(sql`lower(${profiles.name})`, `%${memberQuery.toLocaleLowerCase("en-US")}%`),
          like(sql`lower(coalesce(${profiles.email}, ''))`, `%${memberQuery.toLocaleLowerCase("en-US")}%`),
        )
      : undefined,
  );
  const [memberTotals] = await getDb()
    .select({
      total: countDistinct(profiles.id),
      agents: sql<number>`count(distinct case when ${teamMemberships.role} = 'agent' then ${profiles.id} end)`,
      activeAgents: sql<number>`count(distinct case when ${teamMemberships.role} = 'agent' and ${profiles.accountStatus} = 'active' and ${profiles.active} = true then ${profiles.id} end)`,
      managers: sql<number>`count(distinct case when ${teamMemberships.role} = 'manager' then ${profiles.id} end)`,
    })
    .from(teamMemberships)
    .innerJoin(profiles, eq(profiles.id, teamMemberships.profileId))
    .where(baseMemberWhere);
  const [filteredMemberTotal] = memberQuery
    ? await getDb()
        .select({ total: countDistinct(profiles.id) })
        .from(teamMemberships)
        .innerJoin(profiles, eq(profiles.id, teamMemberships.profileId))
        .where(memberWhere)
    : [{ total: memberTotals?.total ?? 0 }];
  const totalMembers = Number(memberTotals?.total ?? 0);
  const filteredMembers = Number(filteredMemberTotal?.total ?? 0);
  const memberTotalPages = Math.max(1, Math.ceil(filteredMembers / memberPageSize));
  const requestedMemberPage = Math.max(1, Math.trunc(options.memberPage ?? 1));
  const memberPage = Math.min(requestedMemberPage, memberTotalPages);

  const [members, managers, destinationTeams, assignableManagers, activity, performance] =
    await Promise.all([
      getDb()
        .select({
          membershipId: teamMemberships.id,
          profileId: profiles.id,
          name: profiles.name,
          email: profiles.email,
          role: profiles.role,
          membershipRole: teamMemberships.role,
          accountStatus: profiles.accountStatus,
          startedAt: teamMemberships.startedAt,
        })
        .from(teamMemberships)
        .innerJoin(profiles, eq(profiles.id, teamMemberships.profileId))
        .where(memberWhere)
        .orderBy(asc(profiles.role), asc(profiles.name), asc(profiles.id))
        .limit(memberPageSize)
        .offset((memberPage - 1) * memberPageSize),
      getDb()
        .select({
          membershipId: teamMemberships.id,
          profileId: profiles.id,
          name: profiles.name,
          email: profiles.email,
          role: profiles.role,
          membershipRole: teamMemberships.role,
          accountStatus: profiles.accountStatus,
          startedAt: teamMemberships.startedAt,
        })
        .from(teamMemberships)
        .innerJoin(profiles, eq(profiles.id, teamMemberships.profileId))
        .where(and(
          eq(teamMemberships.teamId, teamId),
          eq(teamMemberships.active, true),
          isNull(teamMemberships.endedAt),
          eq(teamMemberships.role, "manager"),
          eq(profiles.role, "manager"),
          isNull(profiles.deletedAt),
        ))
        .orderBy(asc(profiles.name), asc(profiles.id)),
      getDb()
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(
          and(
            eq(teams.organizationId, actorOrganizationId(actor)),
            eq(teams.active, true),
            isNull(teams.archivedAt),
            isNull(teams.deletedAt),
          ),
        )
        .orderBy(asc(teams.name), asc(teams.id)),
      getDb()
        .select({ id: profiles.id, name: profiles.name, email: profiles.email })
        .from(profiles)
        .where(
          and(
            eq(profiles.organizationId, actorOrganizationId(actor)),
            eq(profiles.role, "manager"),
            eq(profiles.accountStatus, "active"),
            eq(profiles.active, true),
            isNull(profiles.deletedAt),
          ),
        )
        .orderBy(asc(profiles.name), asc(profiles.id)),
      getTeamActivity(actor, teamId),
      getSevenDayTeamPerformance(actor, teamId),
    ]);

  return {
    team,
    members,
    managers,
    counts: {
      members: totalMembers,
      agents: Number(memberTotals?.agents ?? 0),
      activeAgents: Number(memberTotals?.activeAgents ?? 0),
      managers: Number(memberTotals?.managers ?? 0),
    },
    memberPagination: {
      page: memberPage,
      pageSize: memberPageSize,
      totalRows: filteredMembers,
      totalPages: memberTotalPages,
      query: memberQuery,
    },
    destinationTeams,
    assignableManagers,
    activity,
    performance,
  };
}

async function getTeamActivity(actor: Actor, teamId: string) {
  const rows = await getDb()
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorName: profiles.name,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(profiles, eq(profiles.id, auditLogs.actorProfileId))
    .where(
      and(
        or(
          and(eq(auditLogs.entityType, "team"), eq(auditLogs.entityId, teamId)),
          sql`json_unquote(json_extract(${auditLogs.metadata}, '$.before.teamId')) = ${teamId}`,
          sql`json_unquote(json_extract(${auditLogs.metadata}, '$.after.teamId')) = ${teamId}`,
        ),
        or(
          eq(profiles.organizationId, actorOrganizationId(actor)),
          isNull(auditLogs.actorProfileId),
        ),
      ),
    )
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(50);
  return rows.map((row) => ({
    id: row.id,
    event: formatAuditEvent(row.action, row.metadata).title,
    actorName: row.actorName ?? "System",
    createdAt: row.createdAt,
  }));
}

function dateDaysAgo(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function getSevenDayTeamPerformance(actor: Actor, teamId: string) {
  const timeZone = getEnv().GOOGLE_SHEETS_TIMEZONE;
  const todayRange = resolveOverviewDateRange({ range: "today" }, new Date(), timeZone);
  const to = todayRange.to!;
  const from = dateDaysAgo(to, 6);
  const range = resolveOverviewDateRange(
    { range: "custom", from, to },
    new Date(),
    timeZone,
  );
  const data = await getTeamPerformanceData(await resolveCurrentActor(actor), {
    dateRange: range,
    filters: resolveTeamPerformanceFilters({
      teamId,
      metric: "transfers",
      sort: "transfers",
      page: "1",
    }),
    includeTrends: false,
  });
  const row = data.standings.find((item) => item.teamId === teamId) ?? null;
  return {
    range: { from, to, label: "Last 7 days" },
    sources: data.sources,
    metrics: row
      ? {
          transfers: row.transfers,
          closedDeals: row.closedDeals,
          conversion: row.conversion,
          averageLoggedInSeconds: row.averageLoggedInSeconds,
          averageTalkPercentage: row.averageTalkPercentage,
          comparison: row.comparison,
        }
      : null,
  };
}
