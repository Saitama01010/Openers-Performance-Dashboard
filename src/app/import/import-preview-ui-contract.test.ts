import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("compact import preview interface contract", () => {
  it("renders final agent metrics in one accessible table", () => {
    const component = source(
      "src/app/import/import-preview-summary.tsx",
    );
    const agentTable = component.slice(
      component.indexOf('aria-label="Agent import preview"'),
      component.indexOf("</table>", component.indexOf('aria-label="Agent import preview"')),
    );

    for (const label of [
      "Agent name",
      "Mapping status",
      "Matched user",
      "Team",
      "Reporting date range",
      "Included rows",
      "Calls",
      "Talk %",
      "Ready %",
      "Paused %",
      "Idle %",
      "Import status",
    ]) {
      expect(agentTable).toContain(label);
    }
    for (const label of [
      "Login time",
      "Ready time",
      "Talk time",
      "Wrap time",
      "Paused time",
      "Idle time",
    ]) {
      expect(component).toContain(label);
    }
    expect(agentTable).toContain('scope="col"');
    expect(agentTable).toContain('scope="row"');
    expect(agentTable).toContain("DurationCell");
    expect(component).toContain("formatDurationSeconds");
    expect(agentTable).toContain("formatPercentage");
  });

  it("does not expose the removed calculation interface anywhere in the preview", () => {
    const component = source(
      "src/app/import/import-preview-summary.tsx",
    );

    for (const removedText of [
      "Calculation details",
      "Formulas Used",
      "Hourly drill-down",
      "Hourly rows included",
      "Invalid rows excluded",
      "total seconds",
      "View details",
      "<details",
      "<summary",
    ]) {
      expect(component).not.toContain(removedText);
    }
  });

  it("provides search, status and team filters, empty states, and bounded pagination", () => {
    const component = source(
      "src/app/import/import-preview-summary.tsx",
    );

    expect(component).toContain('id="agent-search"');
    expect(component).toContain('id="status-filter"');
    expect(component).toContain('id="team-filter"');
    expect(component).toContain("No agents were found in this preview.");
    expect(component).toContain("No agents match your search and filters.");
    expect(component).toContain('id="page-size"');
    expect(component).toContain("previewPageSizes");
    expect(component).toContain("pagination.rows.map");
    expect(component).not.toContain("preview.agents.map");
    expect(component).toContain("pagination.rows.length");
    expect(component).toContain(" total agents");
  });

  it("renders the daily reporting date and aggregate-only metric columns without hourly detail", () => {
    const component = source(
      "src/app/import/import-preview-summary.tsx",
    );
    const uploadPage = source("src/app/import/page.tsx");

    expect(uploadPage).toContain("File reporting date");
    expect(uploadPage).toContain(
      "Choose the date represented by the totals in this CSV.",
    );
    expect(component).toContain("Daily Agent Hours report for");
    expect(component).toContain('"Reporting date"');
    expect(component).toContain('"System Pause"');
    expect(component).toContain('"Net"');
    expect(component).toContain(
      "const durationColumns = isDaily",
    );
  });

  it("places one loading-aware publish action before the agent table", () => {
    const component = source(
      "src/app/import/import-preview-summary.tsx",
    );

    expect(component.match(/action=\{confirmImportAction\}/g)).toHaveLength(1);
    expect(component.match(/Confirm and publish/g)).toHaveLength(1);
    expect(component.indexOf("Confirm and publish")).toBeLessThan(
      component.indexOf('aria-label="Agent import preview"'),
    );
    expect(component).toContain("useFormStatus");
    expect(component).toContain("disabled={disabled || pending}");
    expect(component).toContain("Publishing…");
    expect(component).toContain("Cancel preview");
  });

  it("contains no warning override reason field or request value", () => {
    const files = [
      source("src/app/import/import-preview-summary.tsx"),
      source("src/import/actions.ts"),
      source("src/import/service.ts"),
      source("src/db/schema.ts"),
    ].join("\n");

    expect(files.toLowerCase()).not.toContain("warning override reason");
    expect(files).not.toContain("overrideReason");
    expect(files).not.toContain("override_reason");
  });
});
