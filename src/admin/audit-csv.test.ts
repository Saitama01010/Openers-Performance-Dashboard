import { describe, expect, it } from "vitest";

import { adminAuditCsv } from "@/admin/audit-csv";

describe("admin audit CSV", () => {
  it("exports safe presentation fields and neutralizes spreadsheet formulas", () => {
    const csv = adminAuditCsv([{
      id: "evt-1", createdAt: "2026-08-08T10:00:00.000Z", actor: { name: "=IMPORTXML(1)", role: "admin" },
      title: "User account created", action: "user.created", target: { label: "+Mia", typeLabel: "Profile" },
      category: "user-management", categoryLabel: "User management", description: "Created a new user account.",
    }]);
    expect(csv).toContain("'=IMPORTXML(1)");
    expect(csv).toContain("'+Mia");
    expect(csv).not.toContain("password");
    expect(csv).not.toContain("metadata");
  });
});
