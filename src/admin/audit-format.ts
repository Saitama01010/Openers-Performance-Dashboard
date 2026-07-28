import {
  auditActionLabel,
  fieldLabel,
  roleLabel,
  statusLabel,
} from "@/presentation/labels";

const SECRET_KEY_PATTERN =
  /password|cipher|encrypted|hash|token|secret|session|credential|api.?key/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
    if (SECRET_KEY_PATTERN.test(key) || key === "id") continue;
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
    Object.entries(value)
      .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
      .map(([key, item]) => [key, sanitizeAuditMetadata(item)]),
  );
}

export function formatAuditEvent(action: string, metadata: unknown) {
  const title = auditActionLabel(action);
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
