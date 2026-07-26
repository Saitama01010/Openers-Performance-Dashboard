import { describe, expect, it } from "vitest";

import {
  formatAuditEvent,
  sanitizeAuditMetadata,
} from "@/admin/audit-format";

describe("admin audit formatting", () => {
  it("describes only meaningful user changes in plain English", () => {
    const event = formatAuditEvent("user.updated", {
      before: { name: "Ava", role: "agent", email: "same@example.com" },
      after: { name: "Ava", role: "manager", email: "same@example.com" },
    });

    expect(event.title).toBe("User details updated");
    expect(event.details).toEqual([
      "Role changed from Agent to Team Manager",
    ]);
  });

  it("tolerates malformed and unknown records", () => {
    expect(formatAuditEvent("legacy.odd_event", "broken")).toMatchObject({
      title: "Legacy Odd Event",
      details: [],
    });
  });

  it("recursively removes secrets from technical details", () => {
    expect(
      sanitizeAuditMetadata({
        safe: "value",
        token: "secret",
        nested: { passwordHash: "hash", count: 2 },
        rows: [{ sessionId: "session", status: "ok" }],
      }),
    ).toEqual({
      safe: "value",
      nested: { count: 2 },
      rows: [{ status: "ok" }],
    });
  });
});
