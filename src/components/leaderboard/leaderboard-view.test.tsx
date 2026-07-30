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

  it("renders server-provided Closed rankings", () => {
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
              closedDeals: 4,
              rank: 1,
            },
          ],
          teams: [{ id: "team-1", name: "Team One" }],
          filters: { query: "Gia", teamId: "team-1" },
          totalTransfers: 8,
          totalClosedDeals: 4,
          closedSourceEmpty: false,
          transferSourceRecordCount: 8,
          transferDiagnosticCount: 0,
          stale: false,
        }}
        dateRange={dateRange}
      />,
    );

    expect(markup).toContain("Closed-deal ranking");
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
    expect(markup).toContain("50.0%");
    expect(markup).not.toContain("No real closed-deals provider");
    expect(markup).not.toContain("leaderboard-unavailable-value");
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
              closedDeals: 2,
              rank: 1,
            },
          ],
          teams: [{ id: "team-1", name: "Team One" }],
          filters: {},
          totalTransfers: 4,
          totalClosedDeals: 2,
          closedSourceEmpty: false,
          transferSourceRecordCount: 4,
          transferDiagnosticCount: 0,
          stale: false,
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

  it("renders Closed configuration and empty-source states without fake rankings", () => {
    const errorMarkup = renderToStaticMarkup(
      <LeaderboardView
        data={{
          status: "closed_error",
          message:
            "The Closed worksheet does not contain all required headers.",
          rows: [],
          teams: [],
          filters: {},
          transferSourceRecordCount: 3,
          transferDiagnosticCount: 0,
        }}
        dateRange={dateRange}
      />,
    );
    expect(errorMarkup).toContain('role="alert"');
    expect(errorMarkup).toContain("Closed source needs attention");
    expect(errorMarkup).toContain(
      "The Closed worksheet does not contain all required headers.",
    );
    expect(errorMarkup).not.toContain("<tbody>");

    const emptyMarkup = renderToStaticMarkup(
      <LeaderboardView
        data={{
          status: "ready",
          rows: [
            {
              profileId: "profile-1",
              realName: "Amira Ayman",
              americanName: "Gia Monroe",
              teamId: null,
              teamName: null,
              transferCount: 0,
              closedDeals: 0,
              rank: 1,
            },
          ],
          teams: [],
          filters: {},
          totalTransfers: 0,
          totalClosedDeals: 0,
          closedSourceEmpty: true,
          transferSourceRecordCount: 0,
          transferDiagnosticCount: 0,
          stale: false,
        }}
        dateRange={dateRange}
      />,
    );
    expect(emptyMarkup).toContain(
      "The Closed source is connected, but no closed-deal submissions were found.",
    );
    expect(emptyMarkup).toContain("<tbody>");
  });

  it("renders only aggregate administrator diagnostics and stale status", () => {
    const markup = renderToStaticMarkup(
      <LeaderboardView
        data={{
          status: "ready",
          rows: [],
          teams: [],
          filters: {},
          totalTransfers: 0,
          totalClosedDeals: 0,
          closedSourceEmpty: false,
          transferSourceRecordCount: 0,
          transferDiagnosticCount: 0,
          stale: true,
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
            lastSuccessfulSynchronization:
              "2026-07-30T10:00:00.000Z",
          },
        }}
        dateRange={dateRange}
      />,
    );
    expect(markup).toContain("Showing the last successful ranking");
    expect(markup).toContain("Administrator diagnostics");
    expect(markup).not.toContain("Customer");
    expect(markup).not.toContain("File Number");
    expect(markup).not.toContain("Debt Amount");
  });
});
