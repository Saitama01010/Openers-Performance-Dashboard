import "server-only";

import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lt,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  auditCategory,
  auditCategoryLabel,
  auditSearchActionKeys,
  auditTargetName,
  formatAuditEvent,
  sanitizeAuditMetadata,
  type AuditCategory,
} from "@/admin/audit-format";
import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  auditLogs,
  dialerImportBatches,
  profiles,
  teams,
  userImportBatches,
} from "@/db/schema";
import { humanizeIdentifier, auditActionLabel } from "@/presentation/labels";
import { dateKeyInTimeZone, parseSheetTimestamp } from "@/sheets/timestamp";
import { actorOrganizationId } from "@/teams/visibility";

export type AuditDateRangeKey = "today" | "last-7" | "last-30" | "all-time" | "custom";

export type AdminAuditFilters = {
  query: string;
  range: AuditDateRangeKey;
  from: string;
  to: string;
  actorId: string;
  action: string;
  targetType: string;
  category: AuditCategory | "";
  page: number;
  pageSize: number;
  direction: "asc" | "desc";
  focus: "today" | "admin-actions" | "import-events" | "unique-actors" | "";
  dateRange: {
    label: string;
    from?: Date;
    toExclusive?: Date;
    fromKey?: string;
    toKey?: string;
  };
};

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function validDateKey(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function boundary(value: string, timeZone: string) {
  const parsed = parseSheetTimestamp(`${value} 00:00:00`, timeZone);
  return parsed.ok ? parsed.value : undefined;
}

export function resolveAdminAuditFilters(
  params: RawParams,
  now = new Date(),
  timeZone = "Africa/Cairo",
): AdminAuditFilters {
  const today = dateKeyInTimeZone(now, timeZone);
  const requestedRange = first(params.range);
  const range: AuditDateRangeKey = ["today", "last-7", "last-30", "all-time", "custom"].includes(requestedRange ?? "")
    ? requestedRange as AuditDateRangeKey
    : "last-7";
  const customFrom = validDateKey(first(params.from));
  const customTo = validDateKey(first(params.to));
  let fromKey: string | undefined;
  let toKey: string | undefined;
  let label: string;
  if (range === "today") {
    fromKey = today;
    toKey = today;
    label = "Today";
  } else if (range === "last-30") {
    fromKey = addDays(today, -29);
    toKey = today;
    label = "Last 30 days";
  } else if (range === "all-time") {
    label = "All time";
  } else if (range === "custom" && customFrom && customTo && customFrom <= customTo) {
    fromKey = customFrom;
    toKey = customTo;
    label = `${customFrom} – ${customTo}`;
  } else {
    fromKey = addDays(today, -6);
    toKey = today;
    label = "Last 7 days";
  }
  const pageSize = positiveInteger(first(params.pageSize), 10);
  const category = first(params.category);

  return {
    query: (first(params.q) ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 160),
    range: range === "custom" && (!customFrom || !customTo || customFrom > customTo) ? "last-7" : range,
    from: customFrom ?? "",
    to: customTo ?? "",
    actorId: (first(params.actor) ?? "").trim().slice(0, 80),
    action: (first(params.action) ?? "").trim().slice(0, 120),
    targetType: (first(params.target) ?? "").trim().slice(0, 120),
    category: ["user-management", "team-management", "import", "data-management", "other"].includes(category ?? "")
      ? category as AuditCategory
      : "",
    page: positiveInteger(first(params.page), 1),
    pageSize: [10, 25, 50].includes(pageSize) ? pageSize : 10,
    direction: first(params.direction) === "asc" ? "asc" : "desc",
    focus: ["today", "admin-actions", "import-events", "unique-actors"].includes(first(params.focus) ?? "")
      ? first(params.focus) as AdminAuditFilters["focus"]
      : "",
    dateRange: {
      label,
      from: fromKey ? boundary(fromKey, timeZone) : undefined,
      toExclusive: toKey ? boundary(addDays(toKey, 1), timeZone) : undefined,
      fromKey,
      toKey,
    },
  };
}

function assertAdmin(actor: Actor) {
  if (actor.role !== "admin") throw new Error("Forbidden");
}

const importPredicate = or(
  like(auditLogs.action, "dialer_import.%"),
  inArray(auditLogs.action, ["user.imported", "user.bulk_import_completed"]),
  like(auditLogs.entityType, "dialer_import%"),
  eq(auditLogs.entityType, "user_import_batch"),
)!;
const teamPredicate = or(
  like(auditLogs.action, "team.%"),
  eq(auditLogs.action, "user.team_moved"),
  eq(auditLogs.entityType, "team"),
)!;
const userPredicate = or(
  like(auditLogs.action, "user.%"),
  like(auditLogs.action, "permission.%"),
  eq(auditLogs.entityType, "profile"),
)!;
const dataPredicate = or(
  like(auditLogs.action, "dialer_mapping.%"),
  like(auditLogs.action, "performance_target.%"),
  like(auditLogs.action, "tenure_threshold.%"),
  like(auditLogs.action, "employment.%"),
  eq(auditLogs.action, "local.users_reset"),
)!;
const administrativePredicate = and(not(importPredicate), or(teamPredicate, userPredicate, dataPredicate))!;

function categoryPredicate(category: AuditCategory): SQL {
  if (category === "import") return importPredicate;
  if (category === "team-management") return and(not(importPredicate), teamPredicate)!;
  if (category === "user-management") return and(not(importPredicate), not(teamPredicate), userPredicate)!;
  if (category === "data-management") return and(not(importPredicate), not(teamPredicate), not(userPredicate), dataPredicate)!;
  return not(or(importPredicate, teamPredicate, userPredicate, dataPredicate)!);
}

function safeMetadataSearch(search: string) {
  return or(
    like(sql`lower(json_unquote(json_extract(${auditLogs.metadata}, '$.after.name')))`, search),
    like(sql`lower(json_unquote(json_extract(${auditLogs.metadata}, '$.after.teamName')))`, search),
    like(sql`lower(json_unquote(json_extract(${auditLogs.metadata}, '$.fileName')))`, search),
    like(sql`lower(json_unquote(json_extract(${auditLogs.metadata}, '$.originalFileName')))`, search),
  );
}

function auditWhere(actor: Actor, filters: AdminAuditFilters, options: { includeDate?: boolean } = {}) {
  const search = `%${filters.query.toLocaleLowerCase("en-US")}%`;
  const matchedActions = auditSearchActionKeys(filters.query);
  const organizationId = actorOrganizationId(actor);
  return and(
    auditOrganizationWhere(actor),
    options.includeDate !== false && filters.dateRange.from ? gte(auditLogs.createdAt, filters.dateRange.from) : undefined,
    options.includeDate !== false && filters.dateRange.toExclusive ? lt(auditLogs.createdAt, filters.dateRange.toExclusive) : undefined,
    filters.actorId ? eq(auditLogs.actorProfileId, filters.actorId) : undefined,
    filters.action ? eq(auditLogs.action, filters.action) : undefined,
    filters.targetType ? eq(auditLogs.entityType, filters.targetType) : undefined,
    filters.category ? categoryPredicate(filters.category) : undefined,
    filters.focus === "today" && filters.dateRange.from ? gte(auditLogs.createdAt, filters.dateRange.from) : undefined,
    filters.focus === "today" && filters.dateRange.toExclusive ? lt(auditLogs.createdAt, filters.dateRange.toExclusive) : undefined,
    filters.focus === "admin-actions" ? administrativePredicate : undefined,
    filters.focus === "import-events" ? importPredicate : undefined,
    filters.query
      ? or(
          like(sql`lower(${profiles.name})`, search),
          like(sql`lower(${auditLogs.action})`, search),
          like(sql`lower(${auditLogs.entityType})`, search),
          like(sql`lower(coalesce(${auditLogs.entityId}, ''))`, search),
          matchedActions.length ? inArray(auditLogs.action, matchedActions) : undefined,
          safeMetadataSearch(search),
          sql`exists (select 1 from profiles audit_target_profile where ${auditLogs.entityType} = 'profile' and audit_target_profile.id = ${auditLogs.entityId} and audit_target_profile.organization_id = ${organizationId} and lower(audit_target_profile.name) like ${search})`,
          sql`exists (select 1 from teams audit_target_team where ${auditLogs.entityType} = 'team' and audit_target_team.id = ${auditLogs.entityId} and audit_target_team.organization_id = ${organizationId} and lower(audit_target_team.name) like ${search})`,
          sql`exists (select 1 from dialer_import_batches audit_target_import inner join profiles audit_target_uploader on audit_target_uploader.id = audit_target_import.uploaded_by_id where ${auditLogs.entityType} = 'dialer_import_batch' and audit_target_import.id = ${auditLogs.entityId} and audit_target_uploader.organization_id = ${organizationId} and lower(audit_target_import.file_name) like ${search})`,
          sql`exists (select 1 from user_import_batches audit_target_user_import inner join profiles audit_target_user_uploader on audit_target_user_uploader.id = audit_target_user_import.uploaded_by_id where ${auditLogs.entityType} = 'user_import_batch' and audit_target_user_import.id = ${auditLogs.entityId} and audit_target_user_uploader.organization_id = ${organizationId} and lower(audit_target_user_import.file_name) like ${search})`,
        )
      : undefined,
  );
}

function auditOrganizationWhere(actor: Actor) {
  const organizationId = actorOrganizationId(actor);
  return or(
    eq(auditLogs.organizationId, organizationId),
    and(
      isNull(auditLogs.organizationId),
      eq(profiles.organizationId, organizationId),
    ),
  )!;
}

function actorJoin() {
  return eq(profiles.id, auditLogs.actorProfileId);
}

type RawAuditRow = {
  id: string;
  actorProfileId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: "admin" | "manager" | "agent" | null;
  actorDeletedAt: Date | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

async function resolveTargets(actor: Actor, rows: RawAuditRow[]) {
  const idsFor = (type: string) => Array.from(new Set(rows.filter((row) => row.entityType === type && row.entityId).map((row) => row.entityId!)));
  const profileIds = idsFor("profile");
  const teamIds = idsFor("team");
  const importIds = idsFor("dialer_import_batch");
  const userImportIds = idsFor("user_import_batch");
  const organizationId = actorOrganizationId(actor);
  const [profileRows, teamRows, importRows, userImportRows] = await Promise.all([
    profileIds.length
      ? getDb().select({ id: profiles.id, name: profiles.name, deletedAt: profiles.deletedAt }).from(profiles).where(and(inArray(profiles.id, profileIds), eq(profiles.organizationId, organizationId)))
      : [],
    teamIds.length
      ? getDb().select({ id: teams.id, name: teams.name, deletedAt: teams.deletedAt }).from(teams).where(and(inArray(teams.id, teamIds), eq(teams.organizationId, organizationId)))
      : [],
    importIds.length
      ? getDb().select({ id: dialerImportBatches.id, name: dialerImportBatches.fileName }).from(dialerImportBatches).where(and(inArray(dialerImportBatches.id, importIds), eq(dialerImportBatches.organizationId, organizationId)))
      : [],
    userImportIds.length
      ? getDb().select({ id: userImportBatches.id, name: userImportBatches.fileName }).from(userImportBatches).where(and(inArray(userImportBatches.id, userImportIds), eq(userImportBatches.organizationId, organizationId)))
      : [],
  ]);
  return {
    profiles: new Map(profileRows.map((row) => [row.id, row])),
    teams: new Map(teamRows.map((row) => [row.id, row])),
    imports: new Map(importRows.map((row) => [row.id, row])),
    userImports: new Map(userImportRows.map((row) => [row.id, row])),
  };
}

function targetFor(row: RawAuditRow, targets: Awaited<ReturnType<typeof resolveTargets>>) {
  const metadataName = auditTargetName(sanitizeAuditMetadata(row.metadata));
  const resolved = row.entityType === "profile" && row.entityId
    ? targets.profiles.get(row.entityId)
    : row.entityType === "team" && row.entityId
      ? targets.teams.get(row.entityId)
      : row.entityType === "dialer_import_batch" && row.entityId
        ? targets.imports.get(row.entityId)
        : row.entityType === "user_import_batch" && row.entityId
          ? targets.userImports.get(row.entityId)
          : undefined;
  const typeLabel = humanizeIdentifier(row.entityType) || "Event target";
  return {
    label: resolved?.name ?? metadataName ?? row.entityId ?? typeLabel,
    typeLabel,
    available: Boolean(resolved && (!("deletedAt" in resolved) || !resolved.deletedAt)),
  };
}

function normalizeRow(row: RawAuditRow, targets: Awaited<ReturnType<typeof resolveTargets>>, todayKey: string, timeZone: string) {
  const formatted = formatAuditEvent(row.action, row.metadata, row.entityType);
  const target = targetFor(row, targets);
  return {
    id: row.id,
    createdAt: row.createdAt,
    actor: {
      id: row.actorProfileId,
      name: row.actorName || "Deleted / unavailable actor",
      email: row.actorEmail,
      role: row.actorRole ?? "admin",
      unavailable: !row.actorProfileId || Boolean(row.actorDeletedAt),
    },
    action: row.action,
    title: formatted.title,
    description: formatted.description,
    entityType: row.entityType,
    entityId: row.entityId,
    target,
    category: formatted.category,
    categoryLabel: formatted.categoryLabel,
    isToday: dateKeyInTimeZone(row.createdAt, timeZone) === todayKey,
    isImportEvent: formatted.category === "import",
    isAdminAction: ["user-management", "team-management", "data-management"].includes(formatted.category),
  };
}

async function filterOptions(actor: Actor, filters: AdminAuditFilters) {
  const organizationDateWhere = and(
    auditOrganizationWhere(actor),
    filters.dateRange.from ? gte(auditLogs.createdAt, filters.dateRange.from) : undefined,
    filters.dateRange.toExclusive ? lt(auditLogs.createdAt, filters.dateRange.toExclusive) : undefined,
  );
  const [actors, actions, targets, categoryRows] = await Promise.all([
    getDb().selectDistinct({ id: profiles.id, name: profiles.name }).from(auditLogs).innerJoin(profiles, actorJoin()).where(organizationDateWhere).orderBy(asc(profiles.name), asc(profiles.id)),
    getDb().selectDistinct({ action: auditLogs.action }).from(auditLogs).leftJoin(profiles, actorJoin()).where(organizationDateWhere).orderBy(asc(auditLogs.action)),
    getDb().selectDistinct({ entityType: auditLogs.entityType }).from(auditLogs).leftJoin(profiles, actorJoin()).where(organizationDateWhere).orderBy(asc(auditLogs.entityType)),
    getDb().selectDistinct({ action: auditLogs.action, entityType: auditLogs.entityType }).from(auditLogs).leftJoin(profiles, actorJoin()).where(organizationDateWhere),
  ]);
  const categories = Array.from(new Set(categoryRows.map((row) => auditCategory(row.action, row.entityType))));
  return {
    actors,
    actions: actions.map((row) => ({ value: row.action, label: auditActionLabel(row.action) })),
    targets: targets.map((row) => ({ value: row.entityType, label: humanizeIdentifier(row.entityType) })),
    categories: categories.map((value) => ({ value, label: auditCategoryLabel(value) })),
  };
}

function baseSelect(where: SQL | undefined) {
  return getDb()
    .select({
      id: auditLogs.id,
      actorProfileId: auditLogs.actorProfileId,
      actorName: sql<string | null>`coalesce(${profiles.name}, ${auditLogs.actorDisplayName})`,
      actorEmail: profiles.email,
      actorRole: profiles.role,
      actorDeletedAt: profiles.deletedAt,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(profiles, actorJoin())
    .where(where);
}

export async function listAdminAuditEvents(
  actor: Actor,
  filters: AdminAuditFilters,
  options: { allRows?: boolean; timeZone?: string; now?: Date } = {},
) {
  assertAdmin(actor);
  const where = auditWhere(actor, filters);
  const [totalResult, optionsResult] = await Promise.all([
    getDb().select({ total: count() }).from(auditLogs).leftJoin(profiles, actorJoin()).where(where),
    filterOptions(actor, filters),
  ]);
  const totalRows = Number(totalResult[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / filters.pageSize));
  const page = options.allRows ? 1 : Math.min(filters.page, totalPages);
  const rawRows = await baseSelect(where)
    .orderBy(filters.direction === "asc" ? asc(auditLogs.createdAt) : desc(auditLogs.createdAt), filters.direction === "asc" ? asc(auditLogs.id) : desc(auditLogs.id))
    .limit(options.allRows ? Math.max(1, totalRows) : filters.pageSize)
    .offset(options.allRows ? 0 : (page - 1) * filters.pageSize);
  const targets = await resolveTargets(actor, rawRows);
  const timeZone = options.timeZone ?? "Africa/Cairo";
  const now = options.now ?? new Date();
  const todayKey = dateKeyInTimeZone(now, timeZone);
  return {
    rows: rawRows.map((row) => normalizeRow(row, targets, todayKey, timeZone)),
    options: optionsResult,
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

export async function getAdminAuditStats(
  actor: Actor,
  filters: AdminAuditFilters,
  options: { timeZone?: string; now?: Date } = {},
) {
  assertAdmin(actor);
  const timeZone = options.timeZone ?? "Africa/Cairo";
  const todayKey = dateKeyInTimeZone(options.now ?? new Date(), timeZone);
  const todayStart = boundary(todayKey, timeZone)!;
  const tomorrowStart = boundary(addDays(todayKey, 1), timeZone)!;
  const [row] = await getDb()
    .select({
      totalEvents: count(),
      eventsToday: sql<number>`sum(case when ${auditLogs.createdAt} >= ${todayStart} and ${auditLogs.createdAt} < ${tomorrowStart} then 1 else 0 end)`,
      adminActions: sql<number>`sum(case when ${administrativePredicate} then 1 else 0 end)`,
      importEvents: sql<number>`sum(case when ${importPredicate} then 1 else 0 end)`,
      uniqueActors: countDistinct(auditLogs.actorProfileId),
    })
    .from(auditLogs)
    .leftJoin(profiles, actorJoin())
    .where(auditWhere(actor, filters));
  return {
    totalEvents: Number(row?.totalEvents ?? 0),
    eventsToday: Number(row?.eventsToday ?? 0),
    adminActions: Number(row?.adminActions ?? 0),
    importEvents: Number(row?.importEvents ?? 0),
    uniqueActors: Number(row?.uniqueActors ?? 0),
    periodLabel: filters.dateRange.label,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() && value !== "[REDACTED]") return value.trim();
  }
  return null;
}

export async function getAdminAuditEvent(actor: Actor, eventId: string) {
  assertAdmin(actor);
  const [row] = await baseSelect(and(eq(auditLogs.id, eventId), auditOrganizationWhere(actor))).limit(1);
  if (!row) return null;
  const targets = await resolveTargets(actor, [row]);
  const target = targetFor(row, targets);
  const formatted = formatAuditEvent(row.action, row.metadata, row.entityType);
  const metadata = formatted.technicalDetails;
  const record = isRecord(metadata) ? metadata : {};
  const request = isRecord(record.request) ? record.request : {};
  const relatedLinks: Array<{ href: string; label: string }> = [];
  if (row.entityType === "profile" && row.entityId && targets.profiles.get(row.entityId) && !targets.profiles.get(row.entityId)?.deletedAt) {
    relatedLinks.push({ href: `/admin/users/${row.entityId}`, label: "View user" });
  }
  if (row.entityType === "team" && row.entityId && targets.teams.get(row.entityId) && !targets.teams.get(row.entityId)?.deletedAt) {
    relatedLinks.push({ href: `/admin/teams?q=${encodeURIComponent(target.label)}`, label: `View team: ${target.label}` });
  }
  if (row.entityType === "dialer_import_batch" && row.entityId && targets.imports.get(row.entityId)) {
    relatedLinks.push({ href: `/admin/imports/${row.entityId}`, label: "View import" });
  }
  return {
    id: row.id,
    action: row.action,
    title: formatted.title,
    description: formatted.description,
    category: formatted.category,
    categoryLabel: formatted.categoryLabel,
    createdAt: row.createdAt,
    actor: {
      id: row.actorProfileId,
      name: row.actorName || "Deleted / unavailable actor",
      email: row.actorEmail,
      role: row.actorRole,
      unavailable: Boolean(row.actorDeletedAt),
    },
    target: {
      ...target,
      id: row.entityId,
      entityType: row.entityType,
    },
    ipAddress: safeString(record, ["ipAddress", "ip"]) ?? safeString(request, ["ipAddress", "ip"]),
    userAgent: safeString(record, ["userAgent"]) ?? safeString(request, ["userAgent"]),
    metadata,
    relatedLinks,
  };
}
