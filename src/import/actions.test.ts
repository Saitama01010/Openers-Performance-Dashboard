import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  deactivateDialerImportBatch: vi.fn(),
  deleteDialerImportBatch: vi.fn(),
  getCurrentUser: vi.fn(),
  listImportHistory: vi.fn(),
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
  confirmDialerImportBatch: vi.fn(),
  createDialerPreviewBatch: vi.fn(),
  ImportConfirmationError: class ImportConfirmationError extends Error {},
  rejectDialerImportBatch: vi.fn(),
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
  deactivateImportAction,
  deleteImportAction,
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
      const batchId = `batch-${suffix}`;

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
    const batchId = "batch-delete";
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
    const batchId = "batch-last-row";
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
    const batchId = "batch-deactivate";
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
    const formData = mutationFormData("batch-restore-filtered");
    formData.set(
      "returnQuery",
      "q=agent-hours&status=superseded&page=2&pageSize=10&sort=fileName&order=asc",
    );

    await expect(restoreImportAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/imports?q=agent-hours&status=superseded&page=2&pageSize=10&sort=fileName&order=asc&restored=true",
    );
  });

  it("reports the authoritative fallback after deleting an active import", async () => {
    const formData = mutationFormData("batch-active-delete");
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
