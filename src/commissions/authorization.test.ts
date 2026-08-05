import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertPermission } = vi.hoisted(() => ({ assertPermission: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/permissions", () => ({ assertPermission }));

import {
  assertCommissionsExportAccess,
  assertCommissionsViewAccess,
} from "@/auth/feature-access";

describe("commission permissions", () => {
  beforeEach(() => assertPermission.mockReset());

  it.each([
    ["admin", "commissions.view_company"],
    ["manager", "commissions.view_team"],
    ["agent", "commissions.view_own"],
  ] as const)("uses the narrow %s view permission", async (role, permission) => {
    await assertCommissionsViewAccess({ id: "actor", role, teamIds: [] });
    expect(assertPermission).toHaveBeenCalledWith(expect.objectContaining({ role }), permission);
  });

  it("denies agent export before any permission lookup", async () => {
    await expect(
      assertCommissionsExportAccess({ id: "agent", role: "agent", teamIds: [] }),
    ).rejects.toThrow("Forbidden");
    expect(assertPermission).not.toHaveBeenCalled();
  });

  it.each([
    ["admin", "commissions.export_company"],
    ["manager", "commissions.export_team"],
  ] as const)("uses the narrow %s export permission", async (role, permission) => {
    await assertCommissionsExportAccess({ id: "actor", role, teamIds: [] });
    expect(assertPermission).toHaveBeenCalledWith(expect.objectContaining({ role }), permission);
  });
});
