export const MANUAL_FLAG_TRANSITIONS = {
  open: ["under_review", "action_required", "coaching_scheduled", "resolved", "dismissed"],
  under_review: ["action_required", "coaching_scheduled", "resolved", "dismissed"],
  action_required: ["under_review", "coaching_scheduled", "resolved", "dismissed"],
  coaching_scheduled: ["action_required", "resolved", "dismissed"],
  resolved: [],
  dismissed: [],
} as const;

export type ManualFlagStatus = keyof typeof MANUAL_FLAG_TRANSITIONS;

export function assertManualFlagTransition(from: ManualFlagStatus, to: ManualFlagStatus) {
  if (!MANUAL_FLAG_TRANSITIONS[from].some((allowed) => allowed === to)) {
    throw new Error(`Manual flag cannot move from ${from} to ${to}.`);
  }
}

export function shadowingDisplayStatus(input: {
  status: "scheduled" | "completed" | "cancelled";
  scheduledDate: string;
  today: string;
}) {
  if (input.status !== "scheduled") return input.status;
  if (input.scheduledDate < input.today) return "overdue" as const;
  if (input.scheduledDate === input.today) return "due" as const;
  return "scheduled" as const;
}
