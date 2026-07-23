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
