import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const forbiddenMetric = ["reve", "nue"].join("");
const featureFiles = [
  "src/dashboard/role-data.ts",
  "src/dashboard/outcome-source.ts",
  "src/dashboard/target-evaluation.ts",
  "src/dashboard/low-performance.ts",
  "src/dashboard/shift-coverage.ts",
  "src/dashboard/csv.ts",
  "src/components/dashboard/role-dashboard.tsx",
  "src/components/dashboard/coaching-rubric-entry.tsx",
  "src/app/api/dashboard/export/route.ts",
];

describe("role dashboard feature boundary", () => {
  it("does not add the excluded financial metric to modules, UI, or exports", () => {
    for (const file of featureFiles) {
      expect(readFileSync(file, "utf8").toLocaleLowerCase("en-US"), file).not.toContain(forbiddenMetric);
    }
  });

  it("keeps another agent's top-performer identity out of the personal dashboard", () => {
    const roleData = readFileSync("src/dashboard/role-data.ts", "utf8");
    const agentData = roleData.slice(
      roleData.indexOf("async function agentDashboardData"),
      roleData.indexOf("async function managerDashboardData"),
    );
    const component = readFileSync(
      "src/components/dashboard/role-dashboard.tsx",
      "utf8",
    );

    expect(agentData).toContain("wasTopPerformerLastMonth:");
    expect(agentData).not.toContain("topPerformerLastMonth:");
    expect(component).not.toContain("performer.realName");
    expect(component).not.toContain("performer.americanName");
    expect(component).toContain("Another employee&apos;s identity and outcomes are not exposed");
  });
});
