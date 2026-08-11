import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("shared badge adoption", () => {
  it("routes common status badges through the shared primitive", () => {
    const primitives = source("src/components/dashboard/dashboard-primitives.tsx");

    expect(primitives).toContain('import { Badge } from "@/components/ui/base-badge"');
    expect(primitives).toContain('<Badge appearance="light" shape="circle" size="sm"');
    expect(primitives).not.toContain("status-badge--${tone}");
  });

  it("uses Base Badge across administration and dashboard surfaces", () => {
    const files = [
      "src/components/admin/admin-audit-workspace.tsx",
      "src/components/admin/admin-teams-workspace.tsx",
      "src/components/admin/admin-user-table.tsx",
      "src/components/admin/user-import-wizard.tsx",
      "src/components/dashboard/admin-overview/admin-overview-client.tsx",
      "src/components/dashboard/agents/agents-page-client.tsx",
      "src/components/dashboard/coaching/coaching-session-composer.tsx",
      "src/app/coaching/room/page.tsx",
      "src/app/coaching/improvement/page.tsx",
      "src/app/import/import-preview-summary.tsx",
      "src/app/admin/imports/import-history-workspace.tsx",
    ];

    for (const file of files) {
      expect(source(file), file).toContain("@/components/ui/base-badge");
    }
  });

  it("keeps dense legacy report badges on the same sizing and weight contract", () => {
    const styles = [
      source("src/components/leaderboard/leaderboard-page.module.css"),
      source("src/components/dashboard/team-performance/team-performance.module.css"),
      source("src/components/dashboard/flags/flags-page.module.css"),
      source("src/components/dashboard/commissions/commissions-page.module.css"),
      source("src/app/import/import-page.module.css"),
    ].join("\n");

    expect(styles).toContain("min-width: 1.25rem");
    expect(styles).toContain("min-width: 20px");
    expect(styles).toContain("font-weight: 600");
  });
});
