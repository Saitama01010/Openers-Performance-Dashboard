import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LeaderboardView } from "@/components/leaderboard/leaderboard-view";

describe("LeaderBoard view", () => {
  it("shows filters and no invented ranking rows", () => {
    const markup = renderToStaticMarkup(
      <LeaderboardView
        data={{
          status: "unconfigured",
          message: "Google Apps Script has not been configured yet.",
          rows: [],
          teams: [{ id: "team-1", name: "Team One" }],
          filters: {},
        }}
      />,
    );

    expect(markup).toContain("Google Apps Script has not been configured");
    expect(markup).toContain("Real Name or American Name");
    expect(markup).toContain("All teams");
    expect(markup).toContain('type="date"');
    expect(markup).not.toContain("<tbody>");
    expect(markup).not.toContain(">0<");
  });

  it("renders server-provided transfer rankings", () => {
    const markup = renderToStaticMarkup(
      <LeaderboardView
        data={{
          status: "ready",
          rows: [
            {
              profileId: "profile-1",
              realName: "Amira Ayman",
              americanName: "Gia Monroe",
              teamId: "team-1",
              teamName: "Team One",
              transferCount: 4,
              rank: 1,
            },
          ],
          teams: [{ id: "team-1", name: "Team One" }],
          filters: {},
          sourceRecordCount: 4,
          diagnosticCount: 0,
        }}
      />,
    );

    expect(markup).toContain("Transfer ranking");
    expect(markup).toContain("Gia Monroe");
    expect(markup).toContain("Transfers");
    expect(markup).not.toContain("Closed Deals");
  });

  it("renders an expected transfer-source error as a controlled alert", () => {
    const markup = renderToStaticMarkup(
      <LeaderboardView
        data={{
          status: "source_error",
          message: "Transfer source is missing required headers: Opener.",
          rows: [],
          teams: [],
          filters: {},
        }}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Transfer source needs attention");
    expect(markup).toContain("missing required headers: Opener");
    expect(markup).not.toContain("<tbody>");
  });
});
