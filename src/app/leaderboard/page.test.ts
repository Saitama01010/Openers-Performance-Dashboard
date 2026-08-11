import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("LeaderBoard route contract", () => {
  it("requires authentication without role-restricting the route", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/leaderboard/page.tsx"),
      "utf8",
    );

    expect(page).toContain("await getCurrentUser()");
    expect(page).toContain('if (!user) redirect("/login")');
    expect(page).not.toContain('user.role === "agent"');
    expect(page).not.toContain('user.role !== "admin"');
    expect(page).toContain("<DashboardShell user={user}>");
    expect(page).toContain("resolveLeaderboardView(params)");
    expect(page).toContain("comparison: dateRange.comparison ?? undefined");
    expect(page).toContain("initialView={view}");
    expect(page).not.toContain("preservedParams");
  });

  it("keeps refresh authenticated and Apps Script credentials server-only", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/leaderboard/page.tsx"),
      "utf8",
    );
    const action = readFileSync(
      resolve(process.cwd(), "src/app/leaderboard/actions.ts"),
      "utf8",
    );
    const controls = readFileSync(
      resolve(
        process.cwd(),
        "src/components/leaderboard/leaderboard-refresh-controls.tsx",
      ),
      "utf8",
    );

    expect(page).toContain("<LeaderboardRefreshControls />");
    expect(action).toContain('"use server"');
    expect(action).toContain("await getCurrentUser()");
    expect(action).toContain('if (!user) redirect("/login")');
    expect(controls).toContain("router.refresh()");
    expect(controls).not.toContain("GOOGLE_TRANSFERS_APPS_SCRIPT_URL");
    expect(controls).not.toContain("LEADERBOARD_API_SECRET");
    expect(controls).not.toContain("fetch(");
  });

  it("keeps KPI detail popovers above the podium section", () => {
    const styles = readFileSync(
      resolve(
        process.cwd(),
        "src/components/leaderboard/leaderboard-page.module.css",
      ),
      "utf8",
    );
    const kpiGrid = styles.slice(
      styles.indexOf(".kpiGrid {"),
      styles.indexOf(".kpiCard {"),
    );

    expect(kpiGrid).toContain("position: relative");
    expect(kpiGrid).toContain("z-index: 2");
    expect(styles).toContain("z-index: 30");
  });
});
