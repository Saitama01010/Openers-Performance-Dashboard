import { describe, expect, it } from "vitest";

import { performancePageCsv } from "@/performance/csv";

describe("performance export", () => {
  it("exports only the already-authorized normalized series and preserves unavailable values", () => {
    const csv = performancePageCsv({
      series: [
        {
          rangeStart: "2026-05-01",
          rangeEnd: "2026-05-01",
          transfers: 4,
          closedDeals: null,
          loggedInSeconds: 3600,
          closedDealRate: null,
          sourceRows: 6,
        },
      ],
    } as Parameters<typeof performancePageCsv>[0]);
    expect(csv).toContain("2026-05-01,2026-05-01,4,Unavailable,3600,Unavailable,6");
    expect(csv).not.toContain("agent");
  });
});
