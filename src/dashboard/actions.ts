"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createTeamAgent } from "@/admin/data";
import { getCurrentUser } from "@/auth/session";
import {
  acknowledgeCoachingReport,
  finalizeCoachingReport,
  publishCoachingReport,
  saveCoachingReport,
} from "@/coaching/reports";
import {
  applyTeamTransferRequest,
  completeShadowingSession,
  createManualFlagCase,
  createShadowingSession,
  createTeamTransferRequest,
  reviewTeamTransferRequest,
  updateManualFlagCase,
} from "@/operations/service";
import {
  createPerformanceTarget,
  createRubricTemplate,
  createTenureThreshold,
  recordEmploymentStatus,
  updateEmploymentStartDate,
} from "@/operations/settings";
const TARGET_METRICS = ["transfers", "closed_deals", "conversion"] as const;
const MANUAL_FLAG_STATUSES = ["open", "under_review", "action_required", "coaching_scheduled", "resolved", "dismissed"] as const;
const EMPLOYMENT_STATUSES = ["active", "deactivated", "terminated"] as const;

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return allowed.some((candidate) => candidate === value);
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string) {
  return text(formData, key) || undefined;
}

function number(formData: FormData, key: string) {
  const value = Number(text(formData, key));
  if (!Number.isFinite(value)) throw new Error(`${key} must be a number.`);
  return value;
}

function optionalNumber(formData: FormData, key: string) {
  const value = text(formData, key);
  return value ? number(formData, key) : null;
}

async function actor() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

function finish(ok: string): never {
  revalidatePath("/dashboard");
  redirect(`/dashboard?ok=${encodeURIComponent(ok)}`);
}

export async function createTargetAction(formData: FormData) {
  const user = await actor();
  const metric = text(formData, "metric");
  if (!isOneOf(metric, TARGET_METRICS)) {
    throw new Error("Target metric is invalid.");
  }
  await createPerformanceTarget(user, {
    teamId: optionalText(formData, "teamId"),
    metric,
    targetValue: number(formData, "targetValue"),
    effectiveFrom: text(formData, "effectiveFrom"),
    effectiveTo: optionalText(formData, "effectiveTo"),
  });
  finish("target-created");
}

export async function createThresholdAction(formData: FormData) {
  const user = await actor();
  await createTenureThreshold(user, {
    teamId: optionalText(formData, "teamId"),
    bandLabel: text(formData, "bandLabel"),
    minimumDays: number(formData, "minimumDays"),
    maximumDays: optionalNumber(formData, "maximumDays"),
    isRamp: formData.get("isRamp") === "on",
    minimumTransfers: optionalNumber(formData, "minimumTransfers"),
    minimumClosedDeals: optionalNumber(formData, "minimumClosedDeals"),
    minimumConversion: optionalNumber(formData, "minimumConversion"),
    minimumShiftCoverage: optionalNumber(formData, "minimumShiftCoverage"),
    effectiveFrom: text(formData, "effectiveFrom"),
    effectiveTo: optionalText(formData, "effectiveTo"),
  });
  finish("threshold-created");
}

export async function createRubricTemplateAction(formData: FormData) {
  const user = await actor();
  const criterionLabel = text(formData, "criterionLabel");
  await createRubricTemplate(user, {
    name: text(formData, "name"),
    description: optionalText(formData, "description"),
    sections: [{
      id: "quality",
      label: text(formData, "sectionLabel") || "Quality",
      criteria: [{
        id: "criterion-1",
        label: criterionLabel,
        maximumScore: number(formData, "maximumScore"),
        required: true,
      }],
    }],
  });
  finish("rubric-created");
}

export async function updateEmploymentStartAction(formData: FormData) {
  await updateEmploymentStartDate(await actor(), {
    profileId: text(formData, "profileId"),
    employmentStartDate: text(formData, "employmentStartDate"),
  });
  finish("employment-start-updated");
}

export async function createShadowingAction(formData: FormData) {
  await createShadowingSession(await actor(), {
    agentProfileId: text(formData, "agentProfileId"),
    scheduledDate: text(formData, "scheduledDate"),
    objective: text(formData, "objective"),
  });
  finish("shadowing-created");
}

export async function completeShadowingAction(formData: FormData) {
  await completeShadowingSession(await actor(), {
    sessionId: text(formData, "sessionId"),
    internalNotes: optionalText(formData, "internalNotes"),
    publishedOutcome: optionalText(formData, "publishedOutcome"),
    followUpAction: optionalText(formData, "followUpAction"),
    publishToAgent: formData.get("publishToAgent") === "on",
  });
  finish("shadowing-completed");
}

export async function createManualFlagAction(formData: FormData) {
  const severity = text(formData, "severity");
  if (!isOneOf(severity, ["low", "medium", "high", "critical"] as const)) throw new Error("Severity is invalid.");
  await createManualFlagCase(await actor(), {
    agentProfileId: text(formData, "agentProfileId"),
    category: text(formData, "category"),
    severity,
    reason: text(formData, "reason"),
    internalNotes: optionalText(formData, "internalNotes"),
    requiredAction: optionalText(formData, "requiredAction"),
    actionDueDate: optionalText(formData, "actionDueDate"),
    publishToAgent: formData.get("publishToAgent") === "on",
  });
  finish("manual-flag-created");
}

export async function updateManualFlagAction(formData: FormData) {
  const status = text(formData, "status");
  if (!isOneOf(status, MANUAL_FLAG_STATUSES)) throw new Error("Manual flag status is invalid.");
  await updateManualFlagCase(await actor(), {
    caseId: text(formData, "caseId"),
    status,
    resolution: optionalText(formData, "resolution"),
    publishToAgent: formData.get("publishToAgent") === "on",
  });
  finish("manual-flag-updated");
}

export async function createTransferRequestAction(formData: FormData) {
  await createTeamTransferRequest(await actor(), {
    agentProfileId: text(formData, "agentProfileId"),
    destinationTeamId: text(formData, "destinationTeamId"),
    reason: text(formData, "reason"),
  });
  finish("transfer-requested");
}

export async function reviewTransferRequestAction(formData: FormData) {
  const decision = text(formData, "decision");
  if (decision !== "approved" && decision !== "rejected") throw new Error("Decision is invalid.");
  await reviewTeamTransferRequest(await actor(), {
    requestId: text(formData, "requestId"),
    decision,
    reviewNote: optionalText(formData, "reviewNote"),
  });
  finish(`transfer-${decision}`);
}

export async function applyTransferRequestAction(formData: FormData) {
  await applyTeamTransferRequest(await actor(), text(formData, "requestId"));
  finish("transfer-applied");
}

export async function createTeamAgentAction(formData: FormData) {
  await createTeamAgent(await actor(), {
    name: text(formData, "name"),
    email: text(formData, "email"),
    teamId: text(formData, "teamId"),
    dialerName: text(formData, "dialerName"),
    shift: optionalText(formData, "shift"),
    employmentStartDate: optionalText(formData, "employmentStartDate"),
  });
  finish("agent-created");
}

export async function employmentAction(formData: FormData) {
  if (formData.get("confirmEmploymentAction") !== "on") {
    throw new Error("Confirm the employment and access change before continuing.");
  }
  const status = text(formData, "status");
  if (!isOneOf(status, EMPLOYMENT_STATUSES)) throw new Error("Employment status is invalid.");
  await recordEmploymentStatus(await actor(), {
    profileId: text(formData, "profileId"),
    status,
    reason: text(formData, "reason"),
    employmentEndDate: optionalText(formData, "employmentEndDate"),
  });
  finish(`employment-${status}`);
}

export async function saveCoachingReportAction(formData: FormData) {
  const criterionIds = formData.getAll("criterionId").map(String);
  const scores = formData.getAll("score").map((value) => Number(String(value)));
  const notes = formData.getAll("criterionNote").map((value) => String(value).trim());
  if (criterionIds.length === 0 || criterionIds.length !== scores.length) {
    throw new Error("Every rubric criterion requires a score.");
  }
  if (scores.some((score) => !Number.isFinite(score))) {
    throw new Error("Rubric scores must be numbers.");
  }
  await saveCoachingReport(await actor(), {
    reportId: optionalText(formData, "reportId"),
    coachingSessionId: text(formData, "coachingSessionId"),
    agentProfileId: text(formData, "agentProfileId"),
    templateId: text(formData, "templateId"),
    criterionScores: criterionIds.map((criterionId, index) => ({
      criterionId,
      score: scores[index],
      note: notes[index] || undefined,
    })),
    strengths: optionalText(formData, "strengths"),
    improvementAreas: optionalText(formData, "improvementAreas"),
    actionItems: text(formData, "actionItems").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    followUpDate: optionalText(formData, "followUpDate"),
  });
  finish("coaching-report-saved");
}

export async function transitionCoachingReportAction(formData: FormData) {
  const user = await actor();
  const reportId = text(formData, "reportId");
  const transition = text(formData, "transition");
  if (transition === "finalize") await finalizeCoachingReport(user, reportId);
  else if (transition === "publish") await publishCoachingReport(user, reportId);
  else if (transition === "acknowledge") await acknowledgeCoachingReport(user, reportId);
  else throw new Error("Report transition is invalid.");
  finish(`coaching-report-${transition}`);
}
