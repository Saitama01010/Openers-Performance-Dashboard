import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  getDb: () => {
    throw new Error("Database access must occur after import authorization.");
  },
}));

import type { Actor } from "@/auth/authorization";
import {
  confirmDialerImportBatch,
  createDialerPreviewBatch,
  enqueueDialerPreviewBatch,
  getImportDetails,
  getImportFile,
  getImportProcessingStatus,
  getStoredImportPreview,
  listImportHistory,
  processDialerBatch,
  publishDialerImportBatch,
  rejectDialerImportBatch,
} from "@/import/service";

const batchId = "00000000-0000-4000-8000-000000000234";

function attempts(actor: Actor) {
  const upload = {
    actor,
    source: "dialer",
    fileName: "hours.csv",
    fileContent: "Agent,Calls\nExample,1",
    selectedReportingDate: "2026-08-18",
  };
  return [
    () => createDialerPreviewBatch(upload),
    () => enqueueDialerPreviewBatch(upload),
    () => processDialerBatch({ actor, batchId }),
    () => getStoredImportPreview({ actor, batchId }),
    () => getImportProcessingStatus({ actor, batchId }),
    () => publishDialerImportBatch({ actor, batchId }),
    () => confirmDialerImportBatch({ actor, batchId }),
    () => rejectDialerImportBatch({ actor, batchId, reason: "Reject invalid draft" }),
    () => listImportHistory(actor),
    () => getImportDetails(actor, batchId),
    () => getImportFile(actor, batchId),
  ];
}

describe("operational import service authorization", () => {
  it.each(["manager", "agent"] as const)(
    "rejects every authenticated %s service entry before database access",
    async (role) => {
      const actor: Actor = {
        id: `${role}-id`,
        role,
        teamIds: role === "manager" ? ["team-id"] : [],
        organizationId: "org-id",
      };

      for (const attempt of attempts(actor)) {
        await expect(attempt()).rejects.toMatchObject({ code: "forbidden" });
      }
    },
  );
});
