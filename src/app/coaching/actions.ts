"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/auth/session";
import {
  COACHING_CATEGORIES,
  COACHING_NOTE_MAX_LENGTH,
} from "@/coaching/domain";
import { createCoachingSession } from "@/coaching/service";

const coachingSessionSchema = z.object({
  agentProfileIds: z.array(z.string().uuid()).min(1),
  coachProfileId: z.string().uuid(),
  category: z.enum(COACHING_CATEGORIES),
  note: z.string().trim().max(COACHING_NOTE_MAX_LENGTH).optional(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CoachingSessionActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

export async function createCoachingSessionAction(
  _previousState: CoachingSessionActionState,
  formData: FormData,
): Promise<CoachingSessionActionState> {
  const actor = await getCurrentUser();
  if (!actor) {
    return { status: "error", message: "Your session expired. Sign in again." };
  }
  const parsed = coachingSessionSchema.safeParse({
    agentProfileIds: formData.getAll("agentProfileIds"),
    coachProfileId: formData.get("coachProfileId"),
    category: formData.get("category"),
    note: formData.get("note"),
    sessionDate: formData.get("sessionDate"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the required fields and select at least one agent.",
    };
  }

  try {
    const result = await createCoachingSession(actor, parsed.data);
    revalidatePath("/coaching");
    revalidatePath("/coaching/room");
    revalidatePath("/coaching/leaderboard");
    revalidatePath("/coaching/improvement");
    return {
      status: "success",
      message: `Coaching session saved for ${result.participantCount} ${
        result.participantCount === 1 ? "agent" : "agents"
      }.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const expected = [
      "Select at least one agent.",
      "Coaching date cannot be in the future.",
      "Enter a valid coaching date.",
      "The coach selection is not available.",
      "One or more selected agents are not available for coaching.",
    ];
    return {
      status: "error",
      message: expected.includes(message)
        ? message
        : "The coaching session could not be saved.",
    };
  }
}
