import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  confirmDialerImportBatch: vi.fn(),
  deactivateDialerImportBatch: vi.fn(),
  deleteDialerImportBatch: vi.fn(),
  enqueueDialerPreviewBatch: vi.fn(),
  getCurrentUser: vi.fn(),
  listImportHistory: vi.fn(),
  rejectDialerImportBatch: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`REDIRECT:${location}`);
  }),
  restoreDialerImportBatch: vi.fn(),
  rollbackDialerImportBatch: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/auth/permissions", () => ({
  assertPermission: mocks.assertPermission,
}));

vi.mock("@/import/service", () => ({
  confirmDialerImportBatch: mocks.confirmDialerImportBatch,
  createDialerPreviewBatch: vi.fn(),
  enqueueDialerPreviewBatch: mocks.enqueueDialerPreviewBatch,
  ImportConfirmationError: class ImportConfirmationError extends Error {},
  rejectDialerImportBatch: mocks.rejectDialerImportBatch,
  restoreDialerImportBatch: mocks.restoreDialerImportBatch,
  rollbackDialerImportBatch: mocks.rollbackDialerImportBatch,
  listImportHistory: mocks.listImportHistory,
}));

vi.mock("@/import/delete-service", () => ({
  deleteDialerImportBatch: mocks.deleteDialerImportBatch,
  ImportDeletionError: class ImportDeletionError extends Error {},
}));

vi.mock("@/import/active-lifecycle", () => ({
  ActiveImportLifecycleError: class ActiveImportLifecycleError extends Error {},
  deactivateDialerImportBatch: mocks.deactivateDialerImportBatch,
}));

import {
  confirmImportAction,
  deactivateImportAction,
  deleteImportAction,
  previewImportAction,
  rejectImportAction,
  restoreImportAction,
  rollbackImportAction,
} from "@/import/actions";

const admin = {
  id: "admin-id",
  email: "admin@example.test",
  name: "Import Admin",
  role: "admin" as const,
};

function mutationFormData(batchId: string) {
  const formData = new FormData();
  formData.set("batchId", batchId);
  formData.set("reason", "Confirmed bad dialer export");
  return formData;
}

const BATCH_IDS = {
  rolledBack: "00000000-0000-4000-8000-000000000401",
  restored: "00000000-0000-4000-8000-000000000402",
  delete: "00000000-0000-4000-8000-000000000403",
  lastRow: "00000000-0000-4000-8000-000000000404",
  deactivate: "00000000-0000-4000-8000-000000000405",
  restoreFiltered: "00000000-0000-4000-8000-000000000406",
  activeDelete: "00000000-0000-4000-8000-000000000407",
} as const;

function operationalFormData() {
  const formData = new FormData();
  formData.set(
    "file",
    new File(["Agent,Date,Calls\nExample,2026-08-18,1"], "import.csv", {
      type: "text/csv",
    }),
  );
  formData.set("reportingDate", "2026-08-18");
  formData.set("batchId", BATCH_IDS.deactivate);
  formData.set("reason", "Invalid import preview");
  return formData;
}

describe("operational import authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(admin);
    mocks.assertPermission.mockResolvedValue(undefined);
    mocks.enqueueDialerPreviewBatch.mockResolvedValue({
      batchId: BATCH_IDS.deactivate,
      status: "queued",
    });
    mocks.confirmDialerImportBatch.mockResolvedValue({});
    mocks.rejectDialerImportBatch.mockResolvedValue({});
  });

  it("allows an administrator through upload, publish, and reject actions", async () => {
    await expect(previewImportAction(operationalFormData())).rejects.toThrow(
      `REDIRECT:/import?preview=${BATCH_IDS.deactivate}`,
    );
    await expect(confirmImportAction(operationalFormData())).rejects.toThrow(
      `REDIRECT:/import?confirmed=${BATCH_IDS.deactivate}`,
    );
    await expect(rejectImportAction(operationalFormData())).rejects.toThrow(
      "REDIRECT:/import?rejected=true",
    );

    expect(mocks.assertPermission).toHaveBeenCalledTimes(3);
    expect(mocks.assertPermission).toHaveBeenNthCalledWith(
      1,
      admin,
      "imports.company",
    );
    expect(mocks.enqueueDialerPreviewBatch).toHaveBeenCalledWith(
      expect.objectContaining({ actor: admin, source: "dialer" }),
    );
    expect(mocks.confirmDialerImportBatch).toHaveBeenCalledWith({
      actor: admin,
      batchId: BATCH_IDS.deactivate,
    });
    expect(mocks.rejectDialerImportBatch).toHaveBeenCalledWith({
      actor: admin,
      batchId: BATCH_IDS.deactivate,
      reason: "Invalid import preview",
    });
  });

  it.each(["manager", "agent"] as const)(
    "denies %s upload, publish, and reject actions before service access",
    async (role) => {
      mocks.getCurrentUser.mockResolvedValue({ ...admin, id: role, role });

      for (const action of [
        previewImportAction,
        confirmImportAction,
        rejectImportAction,
      ]) {
        await expect(action(operationalFormData())).rejects.toThrow(
          "REDIRECT:/dashboard",
        );
      }

      expect(mocks.assertPermission).not.toHaveBeenCalled();
      expect(mocks.enqueueDialerPreviewBatch).not.toHaveBeenCalled();
      expect(mocks.confirmDialerImportBatch).not.toHaveBeenCalled();
      expect(mocks.rejectDialerImportBatch).not.toHaveBeenCalled();
    },
  );
});

describe("import history cache revalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(admin);
    mocks.assertPermission.mockResolvedValue(undefined);
    mocks.deleteDialerImportBatch.mockResolvedValue({
      automaticallyActivatedFallbacks: [],
      deletedFileName: "deleted-import.csv",
      noActiveVersionSelected: false,
    });
    mocks.listImportHistory.mockResolvedValue({
      page: 1,
      pageSize: 25,
      total: 0,
      rows: [],
    });
    mocks.restoreDialerImportBatch.mockResolvedValue({});
    mocks.rollbackDialerImportBatch.mockResolvedValue({});
  });

  it.each([
    {
      action: rollbackImportAction,
      service: mocks.rollbackDialerImportBatch,
      suffix: "rolledBack",
    },
    {
      action: restoreImportAction,
      service: mocks.restoreDialerImportBatch,
      suffix: "restored",
    },
  ])(
    "revalidates the dashboard and affected import pages after a historical mutation",
    async ({ action, service, suffix }) => {
      const batchId = BATCH_IDS[suffix as keyof Pick<typeof BATCH_IDS, "rolledBack" | "restored">];

      await expect(action(mutationFormData(batchId))).rejects.toThrow(
        `REDIRECT:/admin/imports/${batchId}?${suffix}=true`,
      );

      expect(service).toHaveBeenCalledWith({
        actor: admin,
        batchId,
        reason: "Confirmed bad dialer export",
      });
      expect(mocks.revalidatePath.mock.calls).toEqual([
        ["/dashboard"],
        ["/admin/imports"],
        [`/admin/imports/${batchId}`],
      ]);
    },
  );

  it("revalidates history only after permanent deletion succeeds", async () => {
    const batchId = BATCH_IDS.delete;
    const formData = mutationFormData(batchId);
    formData.set("confirmation", "DELETE IMPORT");

    await expect(deleteImportAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/imports",
    );

    expect(mocks.deleteDialerImportBatch).toHaveBeenCalledWith({
      actor: admin,
      batchId,
      confirmation: "DELETE IMPORT",
      reason: "Confirmed bad dialer export",
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/admin/imports"],
      [`/admin/imports/${batchId}`],
      ["/dashboard"],
    ]);
  });

  it("returns to the previous valid page when the final row is deleted", async () => {
    const batchId = BATCH_IDS.lastRow;
    const formData = mutationFormData(batchId);
    formData.set("confirmation", "DELETE IMPORT");
    formData.set("returnPage", "3");
    mocks.listImportHistory.mockResolvedValue({
      page: 3,
      pageSize: 25,
      total: 50,
      rows: [],
    });

    await expect(deleteImportAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/imports?page=2",
    );

    expect(mocks.listImportHistory).toHaveBeenCalledWith(admin, { page: 3 });
  });

  it("returns list-page deactivation to the same filtered page", async () => {
    const batchId = BATCH_IDS.deactivate;
    const formData = mutationFormData(batchId);
    formData.set("resolutionMode", "none");
    formData.set("returnPage", "2");

    await expect(deactivateImportAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/imports?page=2",
    );

    expect(mocks.deactivateDialerImportBatch).toHaveBeenCalledWith({
      actor: admin,
      batchId,
      reason: "Confirmed bad dialer export",
      resolution: { mode: "none", fallbackBatchId: null },
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/dashboard"],
      ["/admin/imports"],
      [`/admin/imports/${batchId}`],
    ]);
  });

  it("preserves search, filters, pagination, and sorting after restoration", async () => {
    const formData = mutationFormData(BATCH_IDS.restoreFiltered);
    formData.set(
      "returnQuery",
      "q=agent-hours&status=superseded&page=2&pageSize=10&sort=fileName&order=asc",
    );

    await expect(restoreImportAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/imports?q=agent-hours&status=superseded&page=2&pageSize=10&sort=fileName&order=asc&restored=true",
    );
  });

  it("reports the authoritative fallback after deleting an active import", async () => {
    const formData = mutationFormData(BATCH_IDS.activeDelete);
    formData.set("confirmation", "DELETE ACTIVE IMPORT");
    formData.set("returnQuery", "q=hours&page=2&pageSize=10");
    mocks.deleteDialerImportBatch.mockResolvedValue({
      automaticallyActivatedFallbacks: [
        {
          fileName: "previous-valid.csv",
          importBatchId: "batch-previous",
          publishedAt: new Date("2026-08-01T08:00:00Z"),
        },
      ],
      deletedFileName: "active-import.csv",
      noActiveVersionSelected: false,
    });
    mocks.listImportHistory.mockResolvedValue({
      page: 2,
      pageSize: 10,
      total: 20,
      rows: [],
    });

    await expect(deleteImportAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/imports?q=hours&page=2&pageSize=10&deleted=active-import.csv&fallback=previous-valid.csv",
    );

    expect(mocks.listImportHistory).toHaveBeenCalledWith(admin, {
      dateRange: "all",
      importType: undefined,
      order: "desc",
      page: 2,
      pageSize: 10,
      search: "hours",
      sort: "uploadedAt",
      status: undefined,
      uploadedById: undefined,
    });
  });
});
