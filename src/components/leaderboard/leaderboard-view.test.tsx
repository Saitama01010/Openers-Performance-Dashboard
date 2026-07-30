import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LeaderboardView } from "@/components/leaderboard/leaderboard-view";

const dateRange = {
  key: "this-month" as const,
  label: "This Month",
  from: "2026-07-01",
  to: "2026-07-30",
  comparison: {
    from: "2026-06-01",
    to: "2026-06-30",
    label: "previous month to date",
  },
};

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
        dateRange={dateRange}
      />,
    );

    expect(markup).toContain("Google Apps Script has not been configured");
    expect(markup).toContain("Real Name or American Name");
    expect(markup).toContain("All teams");
    expect(markup).toContain("leaderboard-toolbar__control--search");
    expect(markup).toContain("leaderboard-toolbar__control--team");
    expect(markup).toContain('name="range"');
    expect(markup).toContain("Closed Deals");
    expect(markup).toContain("Conversion Rate %");
    expect(markup).toContain("Unavailable");
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
          filters: { query: "Gia", teamId: "team-1" },
          sourceRecordCount: 4,
          diagnosticCount: 0,
        }}
        dateRange={dateRange}
      />,
    );

    expect(markup).toContain("Transfer ranking");
    expect(markup).toContain("Gia Monroe");
    expect(markup).toContain("Transfers");
    expect(markup).toContain("Closed Deals");
    expect(markup).toContain('aria-sort="none"');
    expect(markup).toContain(
      "/leaderboard?range=this-month&amp;q=Gia&amp;teamId=team-1&amp;sort=transfers&amp;direction=desc",
    );
    expect(markup).toContain(
      "/leaderboard?range=this-month&amp;q=Gia&amp;teamId=team-1&amp;sort=closed-deals&amp;direction=desc",
    );
    expect(markup).toContain("Total transfers");
    expect(markup).toContain('aria-label="4"');
    expect(markup).toContain("Closed Deals");
    expect(markup).toContain("No real closed-deals provider");
    expect(markup).toContain("leaderboard-unavailable-value");
  });

  it("exposes active sort state and the next tri-state action accessibly", () => {
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
        dateRange={dateRange}
        sort={{ column: "transfers", direction: "asc" }}
      />,
    );

    expect(markup).toContain('aria-sort="ascending"');
    expect(markup).toContain(
      'aria-label="Transfers sorted ascending. Clear sorting."',
    );
    expect(markup).toContain('data-state="asc"');
    expect(markup).toContain('href="/leaderboard?range=this-month"');
    expect(markup).toContain('aria-label="Leaderboard sorting"');
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
        dateRange={dateRange}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Transfer source needs attention");
    expect(markup).toContain("missing required headers: Opener");
    expect(markup).not.toContain("<tbody>");
  });
});
