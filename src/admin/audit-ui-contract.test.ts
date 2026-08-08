import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) { return readFileSync(resolve(process.cwd(), path), "utf8"); }

describe("audit log interface contract", () => {
  it("renders the approved evidence workspace with semantic, server-paginated controls", () => {
    const page = source("src/app/admin/audit/page.tsx");
    const workspace = source("src/components/admin/admin-audit-workspace.tsx");
    const header = workspace.slice(workspace.indexOf("<thead"), workspace.indexOf("</thead>"));
    expect(page).toContain("getAdminAuditStats");
    expect(page).toContain("listAdminAuditEvents");
    for (const label of ["Total events", "Events today", "Admin actions", "Import events", "Unique actors"]) expect(workspace).toContain(label);
    for (const label of ["When", "Actor", "Action", "Target", "Category", "Description"]) expect(header).toContain(label);
    expect(workspace).toContain('aria-label="Audit log pages"');
    expect(workspace).toContain("Rows per page");
  });

  it("loads redacted details on demand and preserves accessible copy and drawer behavior", () => {
    const workspace = source("src/components/admin/admin-audit-workspace.tsx");
    expect(workspace).toContain("fetch(`/api/admin/audit/");
    expect(workspace).toContain('aria-labelledby="audit-drawer-title"');
    expect(workspace).toContain("showModal()");
    expect(workspace).toContain("returnFocusRef.current?.focus()");
    expect(workspace).toContain("Copy safe JSON");
    expect(workspace).toContain('aria-live="polite"');
    expect(workspace).toContain("Technical details");
  });

  it("keeps saved views non-sensitive and export metadata-free", () => {
    const workspace = source("src/components/admin/admin-audit-workspace.tsx");
    const csv = source("src/admin/audit-csv.ts");
    expect(workspace).toContain('const SAVED_KEYS = ["q", "range", "from", "to", "actor", "action", "target", "category", "pageSize", "direction"]');
    expect(workspace).not.toContain('SAVED_KEYS = ["metadata"');
    expect(csv).not.toContain("row.metadata");
    expect(csv).toContain("neutralize");
  });
});
