const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  agent: "Agent",
  manager: "Team manager",
};

const STATUS_LABELS: Record<string, string> = {
  accepted: "Accepted",
  active: "Active",
  ambiguous: "Needs review",
  changed: "Changed",
  confirmed: "Confirmed",
  deactivated: "Deactivated",
  deleted: "Deleted",
  delivered: "Delivered",
  delivery_failed: "Delivery failed",
  draft: "Draft",
  error: "Error",
  expired: "Expired",
  failed: "Failed",
  invalid: "Invalid",
  invalid_mapping: "Invalid mapping",
  invited: "Invited",
  mapped: "Mapped",
  new: "New",
  out_of_scope: "Outside your view",
  pending: "Pending",
  permanent: "Permanent",
  previewed: "Previewed",
  processing: "Processing",
  ready_to_publish: "Ready to publish",
  rejected: "Rejected",
  revoked: "Revoked",
  rolled_back: "Rolled back",
  sent: "Sent",
  superseded: "Superseded",
  temporary: "Temporary",
  unchanged: "Unchanged",
  unknown: "Unknown",
  unmapped: "Unmatched",
  uploaded: "Uploaded",
  valid: "Valid",
  validation_failed: "Validation failed",
  warning: "Warning",
};

const IMPORT_TYPE_LABELS: Record<string, string> = {
  agent_hours_performance: "Agent activity",
};

export const METRIC_LABELS: Record<string, string> = {
  calls: "Calls",
  calls_per_logged_in_hour: "Calls per logged-in hour",
  idle_time: "Idle time",
  logged_in_hours: "Logged-in hours",
  logged_in_time: "Logged-in time",
  paused_time: "Paused time",
  ready_time: "Ready time",
  ringing_time: "Ringing time",
  talk_percentage: "Talk percentage",
  talk_time: "Talk time",
  untracked_time: "Untracked time",
  wrap_time: "Wrap time",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "dialer_import.deactivated": "Active dialer import deactivated",
  "dialer_import.deleted": "Deleted import audit record",
  "dialer_import.duplicate_overridden": "Duplicate CSV override used",
  "dialer_import.failed": "Dialer CSV processing failed",
  "dialer_import.historical_restored": "Historical dialer version restored",
  "dialer_import.parsed": "Dialer CSV parsed",
  "dialer_import.published": "Dialer dataset version published",
  "dialer_import.rejected": "Dialer CSV draft rejected",
  "dialer_import.revalidated": "Dialer CSV revalidated",
  "dialer_import.rolled_back": "Latest dialer import rolled back",
  "dialer_import.uploaded": "Dialer CSV uploaded",
  "dialer_import.validation_failed": "Dialer CSV validation failed",
  "dialer_import.warning_overridden": "Import warnings overridden",
  "permission.override.updated": "Individual permissions updated",
  "team.membership.created": "Added to a team",
  "team.membership.ended": "Removed from a team",
  "user.access_revoked": "User access revoked",
  "user.activated": "User account activated",
  "user.bulk_import_completed": "Bulk user import completed",
  "user.bulk_invitation_completed": "Bulk invitation completed",
  "user.created": "User account created",
  "user.deactivated": "User account deactivated",
  "user.deleted": "User permanently deleted",
  "user.shift_updated": "User shift updated",
  "user.email_updated": "Login email updated",
  "user.imported": "User imported through CSV",
  "user.invitation_email_failed": "Invitation email failed",
  "user.invitation_resent": "Account invitation resent",
  "user.invitation_revoked": "Account invitation revoked",
  "user.invitation_sent": "Account invitation sent",
  "user.password_created": "Permanent password created",
  "user.password_reset_completed": "Permanent password created",
  "user.password_reset_forced": "Password change required",
  "user.password_reset_requested": "Password reset requested",
  "user.primary_dialer_updated": "Primary dialer name updated",
  "user.sessions_revoked": "User signed out from all devices",
  "user.team_moved": "Team membership changed",
  "user.temporary_password_cleared": "Temporary password cleared",
  "user.temporary_password_regenerated": "Temporary password regenerated",
  "user.temporary_password_viewed": "Temporary password viewed",
  "user.updated": "User details updated",
};

const FIELD_LABELS: Record<string, string> = {
  accountStatus: "Account status",
  active: "Active state",
  email: "Email",
  logged_in_hours: METRIC_LABELS.logged_in_hours,
  name: "Name",
  normalizedAgentName: "Normalized dialer name",
  role: "Role",
  sourceAgentName: "Dialer name",
  teamId: "Team",
  teamName: "Team",
};

export function humanizeIdentifier(value: string) {
  const words = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  return words ? words[0].toUpperCase() + words.slice(1) : "";
}

export function roleLabel(value: string) {
  return ROLE_LABELS[value] ?? humanizeIdentifier(value);
}

export function statusLabel(value: string | null | undefined) {
  if (!value) return "Not available";
  return STATUS_LABELS[value] ?? humanizeIdentifier(value);
}

export function importStatusLabel(value: string) {
  return statusLabel(value);
}

export function importTypeLabel(value: string) {
  return IMPORT_TYPE_LABELS[value] ?? humanizeIdentifier(value);
}

export function matchingStatusLabel(value: string) {
  return statusLabel(value);
}

export function validationStatusLabel(value: string) {
  return statusLabel(value);
}

export function metricLabel(value: string) {
  return METRIC_LABELS[value] ?? humanizeIdentifier(value);
}

export function fieldLabel(value: string) {
  return FIELD_LABELS[value] ?? metricLabel(value);
}

export function auditActionLabel(value: string) {
  return AUDIT_ACTION_LABELS[value] ?? humanizeIdentifier(value);
}
