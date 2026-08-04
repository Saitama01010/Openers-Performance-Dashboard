import { describe, expect, it } from "vitest";

import { dashboardFilterHref } from "@/components/dashboard/dashboard-filter-toolbar";

describe("dashboardFilterHref", () => {
  it("changes one select immediately while preserving the active date range and other filters", () => {
    const href = dashboardFilterHref(
      "/flags/performance",
      "range=last-month&from=2026-07-01&to=2026-07-31&team=team-1&wrap=flagged&page=3",
      "manager",
      "manager-2",
    );

    expect(href).toBe(
      "/flags/performance?range=last-month&from=2026-07-01&to=2026-07-31&team=team-1&wrap=flagged&manager=manager-2",
    );
  });

  it("resets only the selected filter when All is chosen", () => {
    const href = dashboardFilterHref(
      "/flags/performance",
      "range=all-time&manager=manager-1&profile=agent-1&pause=flagged",
      "profile",
      "",
    );

    expect(href).toBe(
      "/flags/performance?range=all-time&manager=manager-1&pause=flagged",
    );
  });
});
