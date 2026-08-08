import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  fieldLabel,
  roleLabel,
  statusLabel,
} from "@/presentation/labels";

export type AuditCategory =
  | "user-management"
  | "team-management"
  | "import"
  | "data-management"
  | "other";

const REDACTED = "[REDACTED]";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedKey(key: string) {
  return key.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string) {
  const value = normalizedKey(key);
  return [
    "password",
    "token",
    "secret",
    "credential",
    "authorization",
    "cookie",
    "cipher",
    "encrypted",
    "hash",
    "apikey",
    "databaseurl",
    "connectionstring",
  ].some((part) => value.includes(part)) || value === "session" || value.endsWith("sessionid");
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    if (["admin", "agent", "manager"].includes(value)) {
      return roleLabel(value);
    }
    return value.includes("_") ? statusLabel(value) : value;
  }
  if (typeof value === "number") return String(value);
  return "Updated";
}

function changedFields(metadata: unknown) {
  if (!isRecord(metadata)) return [];
  const before = isRecord(metadata.before) ? metadata.before : {};
  const after = isRecord(metadata.after) ? metadata.after : {};
  const descriptions: string[] = [];

  for (const [key, next] of Object.entries(after)) {
    if (isSensitiveKey(key) || key === "id") continue;
    const previous = before[key];
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    descriptions.push(
      `${fieldLabel(key)} changed from ${displayValue(previous)} to ${displayValue(next)}`,
    );
  }

  return descriptions;
}

export function sanitizeAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeAuditMetadata);
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? REDACTED : sanitizeAuditMetadata(item),
    ]),
  );
}

export function auditCategory(action: string, entityType = ""): AuditCategory {
  if (
    action.startsWith("dialer_import.") ||
    action === "user.imported" ||
    action === "user.bulk_import_completed" ||
    entityType === "user_import_batch" ||
    entityType.startsWith("dialer_import")
  ) return "import";
  if (action.startsWith("team.") || action === "user.team_moved" || entityType === "team") {
    return "team-management";
  }
  if (action.startsWith("user.") || action.startsWith("permission.") || entityType === "profile") {
    return "user-management";
  }
  if (
    action.startsWith("dialer_mapping.") ||
    action.startsWith("performance_target.") ||
    action.startsWith("tenure_threshold.") ||
    action.startsWith("employment.") ||
    action === "local.users_reset"
  ) return "data-management";
  return "other";
}

export function auditCategoryLabel(category: AuditCategory) {
  return {
    "user-management": "User management",
    "team-management": "Team management",
    import: "Import",
    "data-management": "Data management",
    other: "Other",
  }[category];
}

export function isImportAuditEvent(action: string, entityType = "") {
  return auditCategory(action, entityType) === "import";
}

export function isAdministrativeAuditEvent(action: string, entityType = "") {
  return ["user-management", "team-management", "data-management"].includes(
    auditCategory(action, entityType),
  );
}

function stringValue(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function auditTargetName(metadata: unknown) {
  if (!isRecord(metadata)) return null;
  const after = isRecord(metadata.after) ? metadata.after : {};
  for (const [record, keys] of [
    [after, ["name", "teamName"]],
    [metadata, ["name", "userName", "teamName", "fileName", "originalFileName", "sourceAgentName"]],
  ] as const) {
    for (const key of keys) {
      const value = stringValue(record, key);
      if (value) return value;
    }
  }
  return null;
}

function descriptionFor(action: string, metadata: Record<string, unknown>, title: string) {
  const fileName = stringValue(metadata, "fileName") ?? stringValue(metadata, "originalFileName");
  const errorCount = numberValue(metadata, "errorCount");
  const descriptions: Record<string, string> = {
    "user.created": "Created a new user account.",
    "user.imported": "Created a user account from an authorized CSV import.",
    "user.invitation_sent": "Sent an account invitation.",
    "user.invitation_resent": "Resent an account invitation.",
    "user.invitation_revoked": "Revoked an account invitation.",
    "user.password_reset_forced": "Required a password change for the user account.",
    "user.sessions_revoked": "Revoked the user's active sessions.",
    "user.deactivated": "Deactivated the user account.",
    "user.activated": "Reactivated the user account.",
    "team.created": "Created a reporting team.",
    "team.activated": "Reactivated the reporting team.",
    "team.deactivated": "Deactivated the reporting team.",
    "team.manager_changed": "Updated the team's current manager assignment.",
    "team.agent_removed": "Removed the agent's current team assignment.",
    "team.manager_removed": "Removed the manager's current team assignment.",
    "dialer_import.uploaded": fileName ? `Uploaded ${fileName} for dialer import.` : "Uploaded a CSV file for dialer import.",
    "dialer_import.validation_failed": errorCount === null ? "Dialer CSV validation failed." : `Dialer CSV validation failed with ${errorCount} error${errorCount === 1 ? "" : "s"}.`,
    "dialer_import.parsed": "Parsed the uploaded dialer CSV.",
    "dialer_import.revalidated": "Revalidated the dialer CSV draft.",
    "dialer_import.published": "Published the validated dialer dataset version.",
    "dialer_import.rejected": "Rejected the dialer CSV draft.",
    "dialer_import.deactivated": "Deactivated the active dialer dataset.",
    "dialer_import.deleted": "Permanently deleted an authorized import record.",
    "user.bulk_import_completed": "Completed a user CSV import.",
  };
  return descriptions[action] ?? `${title} was recorded.`;
}

export function auditSearchActionKeys(query: string) {
  const normalized = query.normalize("NFKC").toLocaleLowerCase("en-US").trim();
  if (!normalized) return [];
  return Object.keys(AUDIT_ACTION_LABELS).filter((action) => {
    const title = auditActionLabel(action);
    const description = descriptionFor(action, {}, title);
    return `${action} ${title} ${description}`.toLocaleLowerCase("en-US").includes(normalized);
  });
}

export function formatAuditEvent(action: string, metadata: unknown, entityType = "") {
  const technicalDetails = sanitizeAuditMetadata(metadata);
  const safeMetadata = isRecord(technicalDetails) ? technicalDetails : {};
  const title = auditActionLabel(action);
  const details = [
    "user.updated",
    "user.email_updated",
    "user.primary_dialer_updated",
    "user.team_moved",
  ].includes(action)
    ? changedFields(safeMetadata)
    : [];

  const category = auditCategory(action, entityType);

  return {
    title: title || "Administrative event",
    details:
      details.length > 0
        ? details
        : action === "user.updated"
          ? ["User record updated"]
          : [],
    description: details.length > 0
      ? `${details.join(". ")}.`
      : descriptionFor(action, safeMetadata, title || "Administrative event"),
    category,
    categoryLabel: auditCategoryLabel(category),
    targetName: auditTargetName(safeMetadata),
    technicalDetails,
  };
}
