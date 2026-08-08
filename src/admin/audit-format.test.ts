import { describe, expect, it } from "vitest";

import {
  auditCategory,
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
      "Role changed from Agent to Team manager",
    ]);
  });

  it("tolerates malformed and unknown records", () => {
    expect(formatAuditEvent("legacy.odd_event", "broken")).toMatchObject({
      title: "Legacy odd event",
      details: [],
    });
  });

  it("recursively redacts secrets from technical details", () => {
    expect(
      sanitizeAuditMetadata({
        safe: "value",
        token: "secret",
        temporaryPassword: "temporary",
        nested: { passwordHash: "hash", invitationToken: "invite", count: 2 },
        rows: [{ sessionId: "session", authorization: "bearer", status: "ok" }],
        sessionDate: "2026-08-08",
      }),
    ).toEqual({
      safe: "value",
      token: "[REDACTED]",
      temporaryPassword: "[REDACTED]",
      nested: { passwordHash: "[REDACTED]", invitationToken: "[REDACTED]", count: 2 },
      rows: [{ sessionId: "[REDACTED]", authorization: "[REDACTED]", status: "ok" }],
      sessionDate: "2026-08-08",
    });
  });

  it("derives the five presentation categories without changing stored events", () => {
    expect(auditCategory("user.created", "profile")).toBe("user-management");
    expect(auditCategory("team.created", "team")).toBe("team-management");
    expect(auditCategory("dialer_import.uploaded", "dialer_import_batch")).toBe("import");
    expect(auditCategory("permission.updated", "permission")).toBe("user-management");
    expect(auditCategory("employment.updated", "employment")).toBe("data-management");
    expect(auditCategory("legacy.odd_event", "legacy")).toBe("other");
  });

  it("uses truthful descriptions derived from stored action metadata", () => {
    expect(formatAuditEvent("dialer_import.uploaded", { fileName: "agents.csv" }).description).toBe("Uploaded agents.csv for dialer import.");
    expect(formatAuditEvent("legacy.odd_event", {}).description).toBe("Legacy odd event was recorded.");
  });
});
