import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getImportProcessingStatus: vi.fn(),
  getStoredImportPreview: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`REDIRECT:${location}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/import/service", () => ({
  getImportProcessingStatus: mocks.getImportProcessingStatus,
  getStoredImportPreview: mocks.getStoredImportPreview,
}));
vi.mock("@/app/import/import-preview-summary", () => ({
  ImportPreviewSummary: () => null,
}));
vi.mock("@/app/import/import-processing-status", () => ({
  ImportProcessingStatus: () => null,
}));
vi.mock("@/app/import/import-upload-form", () => ({
  ImportUploadForm: () => null,
}));
vi.mock("@/components/dashboard/dashboard-icons", () => ({
  DashboardIcon: () => null,
}));
vi.mock("@/components/dashboard/dashboard-shell", () => ({
  DashboardShell: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/dashboard/dashboard-primitives", () => ({
  PageHeader: () => null,
  StatusBanner: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/import/dialer", () => ({
  AGENT_HOURS_DAILY_HEADERS: [],
  HOURLY_DIALER_HEADERS: [],
}));

import ImportPage from "@/app/import/page";

const actor = {
  id: "actor-id",
  email: "actor@example.test",
  name: "Import Actor",
  role: "admin" as const,
  teamIds: [],
  organizationId: "org-id",
};

describe("operational import page authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(actor);
  });

  it("allows an administrator to render the import route", async () => {
    const result = await ImportPage({ searchParams: Promise.resolve({}) });
    expect(result).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["manager", "agent"] as const)(
    "redirects a %s who enters /import directly",
    async (role) => {
      mocks.getCurrentUser.mockResolvedValue({ ...actor, id: role, role });
      await expect(
        ImportPage({ searchParams: Promise.resolve({}) }),
      ).rejects.toThrow("REDIRECT:/dashboard");
      expect(mocks.getStoredImportPreview).not.toHaveBeenCalled();
      expect(mocks.getImportProcessingStatus).not.toHaveBeenCalled();
    },
  );
});
