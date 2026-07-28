export const ADMIN_ERROR_MESSAGES = {
  "account-status-invalid": "Invalid account status.",
  "agent-move": "Agent move could not be completed. Please try again.",
  "confirm-status-change": "Confirm the account access change before submitting.",
  "confirm-team-status": "Confirm team deactivation before submitting.",
  "ignore-action": "Ignore action could not be completed. Please try again.",
  "invitation-delivery": "Invitation delivery could not be completed. Please try again.",
  "mapping-update": "Mapping update could not be completed. Please try again.",
  "manager-assignment": "Manager assignment could not be completed. Please try again.",
  "membership-removal": "Membership removal could not be completed. Please try again.",
  "password-reset": "Password reset could not be completed. Please try again.",
  "session-revocation": "Session revocation could not be completed. Please try again.",
  "status-update": "Status update could not be completed. Please try again.",
  "final-admin": "The final active admin cannot be changed.",
  "manager-team-required": "Select a team before changing this user to manager.",
  "agent-team-required": "Select a team before changing this user to agent.",
  "agent-dialer-required": "Assign a dialer name before changing this user to agent.",
  "self-demotion": "You cannot demote your own admin role.",
  "team-create": "Team creation could not be completed. Please try again.",
  "team-rename": "Team rename could not be completed. Please try again.",
  "team-status": "Team status update could not be completed. Please try again.",
  "user-create": "User creation could not be completed. Please try again.",
  "user-update": "User update could not be completed. Please try again.",
} as const;

export type AdminErrorCode = keyof typeof ADMIN_ERROR_MESSAGES;

export function adminErrorMessage(code?: string) {
  if (code && code in ADMIN_ERROR_MESSAGES) {
    return ADMIN_ERROR_MESSAGES[code as AdminErrorCode];
  }

  return "The action could not be completed. Please try again.";
}

export const ADMIN_SUCCESS_MESSAGES = {
  "agent-moved": "The agent was moved to the selected team.",
  "invitation-updated": "The invitation state was updated.",
  "manager-assigned": "The team manager was updated.",
  "mapping-added": "The dialer mapping was added.",
  "mapping-deactivated": "The dialer mapping was deactivated.",
  "mapping-edited": "The dialer mapping was updated.",
  "membership-removed": "The team membership was removed.",
  "password-reset-forced": "A password reset is now required for this account.",
  "primary-mapping-updated": "The primary dialer mapping was updated.",
  "sessions-revoked": "Active sessions were revoked.",
  "status-updated": "The account access state was updated.",
  "team-created": "The team was created.",
  "team-renamed": "The team was renamed.",
  "team-status-updated": "The team status was updated.",
  "unknown-ignored": "The unmatched dialer name was ignored.",
  "unknown-mapped": "The unmatched dialer name was mapped to an agent.",
  "user-created": "The user account was created.",
  "user-updated": "The user account was updated.",
} as const;

export type AdminSuccessCode = keyof typeof ADMIN_SUCCESS_MESSAGES;

export function adminSuccessMessage(code?: string) {
  if (code && code in ADMIN_SUCCESS_MESSAGES) {
    return ADMIN_SUCCESS_MESSAGES[code as AdminSuccessCode];
  }

  return "The requested change was completed.";
}
