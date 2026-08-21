import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LeaderboardView } from "@/components/leaderboard/leaderboard-view";
import { DEFAULT_LEADERBOARD_VIEW } from "@/leaderboard/analytics";
import type { LeaderboardData } from "@/leaderboard/data";

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

const readyData: LeaderboardData = {
  status: "ready",
  rows: [
    {
      profileId: "profile-1",
      realName: "Amira Ayman",
      americanName: "Gia Monroe",
      teamId: "team-1",
      teamName: "Team One",
      transferCount: 4,
      closedDeals: 2,
      rank: 1,
      comparison: { transferCount: 3, closedDeals: 1 },
      trend: [
        { date: "2026-07-01", transferCount: 2, closedDeals: 1 },
        { date: "2026-07-02", transferCount: 2, closedDeals: 1 },
      ],
    },
  ],
  teams: [{ id: "team-1", name: "Team One" }],
  filters: {},
  totalTransfers: 4,
  totalClosedDeals: 2,
  closedMetricsAvailable: true,
  closedSourceEmpty: false,
  transferSourceRecordCount: 4,
  transferDiagnosticCount: 0,
  closedDiagnosticCount: 0,
  latestSynchronization: "2026-07-30T10:00:00.000Z",
  stale: false,
};

describe("LeaderBoard view", () => {
  it("shows all controls without inventing unavailable rankings", () => {
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
        initialView={DEFAULT_LEADERBOARD_VIEW}
      />,
    );

    expect(markup).toContain("Google Apps Script has not been configured");
    expect(markup).toContain("All teams");
    expect(markup).toContain("Ranking metric");
    expect(markup).toContain("Top performers only");
    expect(markup).toContain("Export");
    expect(markup).not.toContain("<tbody>");
  });

  it("renders authoritative KPI, podium, table, and dated-trend data", () => {
    const markup = renderToStaticMarkup(
      <LeaderboardView
        data={readyData}
        dateRange={dateRange}
        initialView={DEFAULT_LEADERBOARD_VIEW}
      />,
    );

    expect(markup).toContain("Active Agent Performance");
    expect(markup).toContain("Active Agents Transfers");
    expect(markup).toContain("Active Agents Closed Deals");
    expect(markup).toContain("Active Agents Conversion Rate");
    expect(markup).not.toContain("Overall Reported Performance");
    expect(markup).toContain("Top performer");
    expect(markup).toContain("Gia Monroe");
    expect(markup).toContain("Amira Ayman");
    expect(markup).toContain("50.0%");
    expect(markup).toContain("Jul 1, 2026: 1");
    expect(markup).toContain('aria-sort="descending"');
    expect(markup).toContain("/api/leaderboard/export?range=this-month");
  });

  it("renders six grouped cards only when the server contract includes overall totals", () => {
    const markup = renderToStaticMarkup(
      <LeaderboardView
        data={{
          ...readyData,
          overall: {
            transfers: 9,
            closedDeals: 6,
            conversion: 66.666,
            trend: [
              { date: "2026-07-01", transferCount: 5, closedDeals: 3 },
              { date: "2026-07-02", transferCount: 4, closedDeals: 3 },
            ],
            comparison: {
              transfers: 8,
              closedDeals: 4,
              conversion: 50,
            },
          },
        }}
        dateRange={dateRange}
        initialView={DEFAULT_LEADERBOARD_VIEW}
      />,
    );

    expect(markup).toContain("Active Agent Performance");
    expect(markup).toContain("Overall Reported Performance");
    expect(markup).toContain("Overall Transfers");
    expect(markup).toContain("Overall Closed Deals");
    expect(markup).toContain("Overall Conversion Rate");
    expect(markup).toContain("Overall Transfers dated trend");
    expect(markup).toContain("Overall Closed Deals dated trend");
    expect(markup).toContain("Overall Conversion Rate dated trend");
    expect(markup.match(/metric-color-card/g)).toHaveLength(6);
  });

  it("keeps overall totals present when active-agent filters remove every row", () => {
    const markup = renderToStaticMarkup(
      <LeaderboardView
        data={{
          ...readyData,
          overall: {
            transfers: 99,
            closedDeals: 33,
            conversion: 33.333,
            trend: [
              { date: "2026-07-01", transferCount: 50, closedDeals: 17 },
              { date: "2026-07-02", transferCount: 49, closedDeals: 16 },
            ],
            comparison: null,
          },
        }}
        dateRange={dateRange}
        initialView={{
          ...DEFAULT_LEADERBOARD_VIEW,
          query: "missing",
          teamId: "another-team",
          sortBy: "conversion",
          topOnly: true,
        }}
      />,
    );

    expect(markup).toContain("No ranking data found");
    expect(markup).toContain("Overall Reported Performance");
    expect(markup).toContain('metric-card-value">99</strong>');
  });

  it("applies the initial metric and filters to podium and table output", () => {
    const markup = renderToStaticMarkup(
      <LeaderboardView
        data={readyData}
        dateRange={dateRange}
        initialView={{
          ...DEFAULT_LEADERBOARD_VIEW,
          query: "missing",
          metric: "conversion",
          sortBy: "conversion",
          topOnly: true,
        }}
      />,
    );

    expect(markup).toContain('value="missing"');
    expect(markup).toContain('aria-pressed="true" type="button">Conversion');
    expect(markup).toContain("No ranking data found");
    expect(markup).not.toContain("<tbody>");
  });

  it("renders source failures as controlled empty states", () => {
    const transferMarkup = renderToStaticMarkup(
      <LeaderboardView
        data={{
          status: "source_error",
          message: "Transfer source is missing required headers: Opener.",
          rows: [],
          teams: [],
          filters: {},
        }}
        dateRange={dateRange}
        initialView={DEFAULT_LEADERBOARD_VIEW}
      />,
    );
    expect(transferMarkup).toContain("Transfer source needs attention");
    expect(transferMarkup).toContain("missing required headers: Opener");
  });

  it("keeps transfer rankings visible when Closed rows cannot be attributed", () => {
    const markup = renderToStaticMarkup(
      <LeaderboardView
        data={{
          ...readyData,
          totalClosedDeals: null,
          closedMetricsAvailable: false,
          closedMessage:
            "Closed worksheet rows cannot be attributed. Transfer rankings remain available.",
          closedDiagnosticCount: 151,
        }}
        dateRange={dateRange}
        initialView={DEFAULT_LEADERBOARD_VIEW}
      />,
    );

    expect(markup).toContain("Closed attribution needs attention");
    expect(markup).toContain("Transfer rankings remain available");
    expect(markup).toContain('aria-pressed="true" type="button">Transfers');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain("Amira Ayman");
    expect(markup).toContain("N/A");
    expect(markup).toContain("<tbody>");
  });

  it("exposes only aggregate source diagnostics and the empty Closed status", () => {
    const data: LeaderboardData = {
      ...readyData,
      rows: [],
      closedSourceEmpty: true,
      stale: true,
      closedDiagnosticCount: 2,
      closedDiagnostics: {
        connectionStatus: "connected",
        worksheet: "Closed",
        headerValidationStatus: "valid",
        totalNonEmptyRows: 4,
        validRows: 3,
        matchedRows: 1,
        unmatchedRows: 1,
        ambiguousRows: 1,
        invalidRows: 1,
        invalidTimestampRows: 1,
        lastSuccessfulSynchronization: "2026-07-30T10:00:00.000Z",
      },
    };
    const markup = renderToStaticMarkup(
      <LeaderboardView data={data} dateRange={dateRange} initialView={DEFAULT_LEADERBOARD_VIEW} />,
    );

    expect(markup).toContain("Some source rows need attention");
    expect(markup).toContain("Administrator source diagnostics");
    expect(markup).toContain("no closed-deal submissions were found");
    expect(markup).not.toContain("Customer");
    expect(markup).not.toContain("File Number");
  });
});
