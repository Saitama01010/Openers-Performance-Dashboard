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

  it.each(["manager", "agent"] as const)(
    "denies %s export before any permission lookup",
    async (role) => {
      await expect(
        assertCommissionsExportAccess({ id: role, role, teamIds: [] }),
      ).rejects.toThrow("Forbidden");
      expect(assertPermission).not.toHaveBeenCalled();
    },
  );

  it("uses the company export permission for an administrator", async () => {
    await assertCommissionsExportAccess({ id: "admin", role: "admin", teamIds: [] });
    expect(assertPermission).toHaveBeenCalledWith(
      expect.objectContaining({ role: "admin" }),
      "commissions.export_company",
    );
  });
});
