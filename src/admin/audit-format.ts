const EVENT_LABELS: Record<string, string> = {
  "user.created": "User account created",
  "user.imported": "User imported through CSV",
  "user.updated": "User details updated",
  "user.email_updated": "Login email updated",
  "user.primary_dialer_updated": "Primary dialer name updated",
  "user.team_moved": "Team membership changed",
  "user.activated": "User account activated",
  "user.deactivated": "User account deactivated",
  "user.access_revoked": "User access revoked",
  "user.password_reset_forced": "Password change required",
  "user.password_reset_requested": "Password reset requested",
  "user.password_reset_completed": "Permanent password created",
  "user.password_created": "Permanent password created",
  "user.temporary_password_viewed": "Temporary password viewed",
  "user.temporary_password_regenerated": "Temporary password regenerated",
  "user.temporary_password_cleared": "Temporary password cleared",
  "user.invitation_sent": "Account invitation sent",
  "user.invitation_resent": "Account invitation resent",
  "user.invitation_revoked": "Account invitation revoked",
  "user.invitation_email_failed": "Invitation email failed",
  "user.sessions_revoked": "User signed out from all devices",
  "user.deleted": "User permanently deleted",
  "team.membership.created": "Added to a team",
  "team.membership.ended": "Removed from a team",
  "permission.override.updated": "Individual permissions updated",
  "user.bulk_import_completed": "Bulk user import completed",
  "user.bulk_invitation_completed": "Bulk invitation completed",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  role: "Role",
  teamId: "Team",
  teamName: "Team",
  accountStatus: "Account status",
  active: "Active state",
  sourceAgentName: "Dialer name",
  normalizedAgentName: "Normalized dialer name",
};

const SECRET_KEY_PATTERN =
  /password|cipher|encrypted|hash|token|secret|session|credential|api.?key/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    if (value === "manager") return "Team Manager";
    if (value === "agent") return "Agent";
    if (value === "admin") return "Administrator";
    return value.replaceAll("_", " ");
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
    if (SECRET_KEY_PATTERN.test(key) || key === "id") continue;
    const previous = before[key];
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    descriptions.push(
      `${FIELD_LABELS[key] ?? key.replaceAll("_", " ")} changed from ${displayValue(previous)} to ${displayValue(next)}`,
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
    Object.entries(value)
      .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
      .map(([key, item]) => [key, sanitizeAuditMetadata(item)]),
  );
}

export function formatAuditEvent(action: string, metadata: unknown) {
  const title =
    EVENT_LABELS[action] ??
    action
      .replaceAll(".", " ")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const details = [
    "user.updated",
    "user.email_updated",
    "user.primary_dialer_updated",
    "user.team_moved",
  ].includes(action)
    ? changedFields(metadata)
    : [];

  return {
    title: title || "Administrative event",
    details:
      details.length > 0
        ? details
        : action === "user.updated"
          ? ["User record updated"]
          : [],
    technicalDetails: sanitizeAuditMetadata(metadata),
  };
}
