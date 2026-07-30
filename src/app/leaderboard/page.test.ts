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
    expect(page).toContain("resolveLeaderboardSort(params)");
    expect(page).toContain("sort={sort}");
    expect(page).toContain("sort: sort?.column");
    expect(page).toContain("direction: sort?.direction");
  });
});
