import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  recordEmploymentStatus: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/admin/data", () => ({ createTeamAgent: vi.fn() }));
vi.mock("@/coaching/reports", () => ({
  acknowledgeCoachingReport: vi.fn(),
  finalizeCoachingReport: vi.fn(),
  publishCoachingReport: vi.fn(),
  saveCoachingReport: vi.fn(),
}));
vi.mock("@/operations/service", () => ({
  completeShadowingSession: vi.fn(),
  createManualFlagCase: vi.fn(),
  createShadowingSession: vi.fn(),
  updateManualFlagCase: vi.fn(),
}));
vi.mock("@/operations/settings", () => ({
  createPerformanceTarget: vi.fn(),
  createRubricTemplate: vi.fn(),
  createTenureThreshold: vi.fn(),
  recordEmploymentStatus: mocks.recordEmploymentStatus,
  updateEmploymentStartDate: vi.fn(),
}));

import { employmentAction } from "@/dashboard/actions";

describe("dashboard employment server action", () => {
  beforeEach(() => {
    mocks.currentUser.mockReset();
    mocks.recordEmploymentStatus.mockReset();
  });

  it.each(["deactivated", "terminated"] as const)(
    "rejects a forged Team Manager %s request before the lifecycle service is called",
    async (status) => {
      mocks.currentUser.mockResolvedValue({
        id: "manager",
        role: "manager",
        organizationId: "organization",
        teamIds: ["assigned-team"],
      });
      const formData = new FormData();
      formData.set("confirmEmploymentAction", "on");
      formData.set("profileId", "assigned-agent");
      formData.set("status", status);
      formData.set("reason", "Forged direct request");

      await expect(employmentAction(formData)).rejects.toThrow("Forbidden");
      expect(mocks.recordEmploymentStatus).not.toHaveBeenCalled();
    },
  );
});
