import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LeaderboardView } from "@/components/leaderboard/leaderboard-view";

describe("LeaderBoard unconfigured state", () => {
  it("shows filters and no invented ranking rows", () => {
    const markup = renderToStaticMarkup(
      <LeaderboardView
        data={{
          status: "unconfigured",
          message: "Closed-deals data source has not been configured yet.",
          rows: [],
          teams: [{ id: "team-1", name: "Team One" }],
          filters: {},
        }}
      />,
    );

    expect(markup).toContain("Closed-deals data source has not been configured");
    expect(markup).toContain("Real Name or American Name");
    expect(markup).toContain("All teams");
    expect(markup).toContain('type="date"');
    expect(markup).not.toContain("<tbody>");
    expect(markup).not.toContain(">0<");
  });
});
