import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getImportFile: vi.fn(),
}));

vi.mock("@/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/import/service", () => ({
  getImportFile: mocks.getImportFile,
  ImportConfirmationError: class ImportConfirmationError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { GET } from "@/app/api/imports/[batchId]/download/route";

const batchId = "00000000-0000-4000-8000-000000000123";
const actor = {
  id: "admin-id",
  role: "admin" as const,
  teamIds: [],
  organizationId: "org-id",
};

function request() {
  return GET(new Request(`http://localhost/api/imports/${batchId}/download`), {
    params: Promise.resolve({ batchId }),
  });
}

describe("raw import download authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(actor);
    mocks.getImportFile.mockResolvedValue({
      fileName: "hours.csv",
      fileHash: "hash",
      rawFileContent: "Agent,Calls\nExample,1",
    });
  });

  it("allows an administrator to download the retained import", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(mocks.getImportFile).toHaveBeenCalledWith(actor, batchId);
  });

  it.each(["manager", "agent"] as const)(
    "returns 403 to a %s before reading import state",
    async (role) => {
      mocks.getCurrentUser.mockResolvedValue({ ...actor, id: role, role });
      expect((await request()).status).toBe(403);
      expect(mocks.getImportFile).not.toHaveBeenCalled();
    },
  );
});
