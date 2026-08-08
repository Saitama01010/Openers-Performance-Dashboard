import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveAdminAuditFilters } from "@/admin/audit";

describe("admin audit filters", () => {
  it("defaults to the last seven configured-timezone dates", () => {
    const filters = resolveAdminAuditFilters({}, new Date("2026-08-08T21:30:00.000Z"), "Africa/Cairo");
    expect(filters.range).toBe("last-7");
    expect(filters.dateRange.fromKey).toBe("2026-08-03");
    expect(filters.dateRange.toKey).toBe("2026-08-09");
  });

  it("accepts bounded custom dates and sanitizes pagination values", () => {
    const filters = resolveAdminAuditFilters({ range: "custom", from: "2026-08-01", to: "2026-08-08", page: "3", pageSize: "25", direction: "asc", q: "  Mia   Ford  " }, new Date("2026-08-08T10:00:00.000Z"), "UTC");
    expect(filters).toMatchObject({ range: "custom", from: "2026-08-01", to: "2026-08-08", page: 3, pageSize: 25, direction: "asc", query: "Mia Ford" });
    expect(filters.dateRange.toExclusive?.toISOString()).toBe("2026-08-09T00:00:00.000Z");
  });

  it("falls back from invalid custom ranges", () => {
    const filters = resolveAdminAuditFilters({ range: "custom", from: "2026-08-09", to: "2026-08-01" }, new Date("2026-08-08T10:00:00.000Z"), "UTC");
    expect(filters.range).toBe("last-7");
    expect(filters.dateRange.label).toBe("Last 7 days");
  });
});
