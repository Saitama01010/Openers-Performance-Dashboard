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
  "src/components/dashboard/role-dashboard-modern.tsx",
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
    const modernComponent = readFileSync(
      "src/components/dashboard/role-dashboard-modern.tsx",
      "utf8",
    );

    expect(agentData).toContain("wasTopPerformerLastMonth:");
    expect(agentData).not.toContain("topPerformerLastMonth:");
    expect(component).not.toContain("performer.realName");
    expect(component).not.toContain("performer.americanName");
    expect(component).toContain("Another employee&apos;s identity and outcomes are not exposed");
    expect(modernComponent).not.toContain("performer.realName");
    expect(modernComponent).not.toContain("performer.americanName");
    expect(modernComponent).toContain("without exposing another employee's private records");
  });

  it("removes employee transfer-request controls while preserving sales-transfer reporting", () => {
    const workflowFiles = [
      "src/db/schema.ts",
      "src/operations/domain.ts",
      "src/operations/service.ts",
      "src/dashboard/actions.ts",
      "src/dashboard/role-data.ts",
      "src/components/dashboard/role-dashboard.tsx",
      "src/components/dashboard/role-dashboard-modern.tsx",
      "src/admin/policy.ts",
    ];
    for (const file of workflowFiles) {
      const contents = readFileSync(file, "utf8");
      expect(contents, file).not.toContain("teamTransferRequests");
      expect(contents.toLocaleLowerCase("en-US"), file).not.toContain("transfer request");
      expect(contents, file).not.toContain("transfers.request_team");
      expect(contents, file).not.toContain("transfers.approve_company");
    }

    const component = readFileSync("src/components/dashboard/role-dashboard.tsx", "utf8");
    const roleData = readFileSync("src/dashboard/role-data.ts", "utf8");
    expect(component).toContain('Metric label="Transfers"');
    expect(component).toContain('Metric label="Transfers today"');
    expect(component).toContain('Metric label="Transfer flags"');
    const modernComponent = readFileSync("src/components/dashboard/role-dashboard-modern.tsx", "utf8");
    expect(modernComponent).toContain('label="Transfers"');
    expect(modernComponent).toContain('label="Transfers today"');
    expect(modernComponent).toContain("Transfer flags");
    expect(roleData).toContain("getTransferFlagsData");
    expect(roleData).toContain("transferCount");
  });

  it("does not render Team Manager user deactivation or termination controls", () => {
    const component = readFileSync(
      "src/components/dashboard/role-dashboard.tsx",
      "utf8",
    );

    expect(component).not.toContain("Deactivate or terminate agent");
    expect(component).not.toContain("Deactivate access");
    expect(component).not.toContain("Terminate employment");
    expect(component).not.toContain("employmentAction");
    expect(component).not.toContain("Add team agent");
    expect(component).toContain("Schedule shadowing");
    expect(component).toContain("Raise manual flag");
  });
});
