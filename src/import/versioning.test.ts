import { describe, expect, it } from "vitest";

import { datasetScopeKey } from "@/import/versioning";

const baseScope = {
  source: "dialer",
  importType: "agent_hours_performance",
  reportingDate: "2026-07-27",
  teamId: "team-east",
  dialerId: "dialer-primary",
};

describe("datasetScopeKey", () => {
  it("isolates versions by date, team, dialer, and import type", () => {
    const keys = [
      datasetScopeKey(baseScope),
      datasetScopeKey({ ...baseScope, reportingDate: "2026-07-28" }),
      datasetScopeKey({ ...baseScope, teamId: "team-west" }),
      datasetScopeKey({ ...baseScope, dialerId: "dialer-secondary" }),
      datasetScopeKey({ ...baseScope, importType: "agent_hours" }),
    ];

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses stable company and default-dialer sentinels", () => {
    expect(
      datasetScopeKey({
        ...baseScope,
        teamId: null,
        dialerId: null,
      }),
    ).toBe(
      "dialer|agent_hours_performance|2026-07-27|team:company|dialer:default",
    );
  });
});
