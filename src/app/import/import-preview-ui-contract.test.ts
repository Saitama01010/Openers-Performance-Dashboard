import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("imports redesign interface contract", () => {
  it("keeps upload and review as distinct route states", () => {
    const page = source("src/app/import/page.tsx");

    expect(page).toContain("{storedPreview ? (");
    expect(page).toContain("<ImportPreviewSummary");
    expect(page).toContain("<ImportUploadForm />");
    expect(page).toContain("<ImportGuide />");
    expect(page).toContain("<ImportStepper />");
  });

  it("keeps import route authorization and warning scope server-derived", () => {
    const page = source("src/app/import/page.tsx");

    expect(page).toContain('if (user.role === "agent")');
    expect(page).toContain('redirect("/dashboard")');
    expect(page).toContain('isAdmin={user.role === "admin"}');
  });

  it("provides an accessible drag and drop CSV uploader with real parser guidance", () => {
    const upload = source("src/app/import/import-upload-form.tsx");
    const page = source("src/app/import/page.tsx");

    for (const interaction of [
      "onDragEnter",
      "onDragLeave",
      "onDragOver",
      "onDrop",
      "Choose CSV file",
      "Replace",
      "Remove",
      'aria-live="polite"',
      'name="reportingDate"',
      'name="file"',
    ]) {
      expect(upload).toContain(interaction);
    }
    expect(page).toContain("AGENT_HOURS_DAILY_HEADERS");
    expect(page).toContain("HOURLY_DIALER_HEADERS");
    expect(page).not.toContain("Agent name</");
    expect(upload).toContain("authorized dashboard workflows");
    expect(upload).not.toContain("encrypted in transit and at rest");
  });

  it("renders final agent metrics in one accessible internally scrolling table", () => {
    const component = source("src/app/import/import-preview-summary.tsx");
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
    expect(component).toContain("formatDurationSeconds");
    expect(agentTable).toContain("formatPercentage");
    expect(component).toContain("Scroll horizontally to view all columns");
  });

  it("provides the four keyboard-accessible review tabs using only real preview data", () => {
    const component = source("src/app/import/import-preview-summary.tsx");

    for (const label of ["Preview data", "Summary", "File details", "Mapping"]) {
      expect(component).toContain(label);
    }
    expect(component).toContain('role="tablist"');
    expect(component).toContain('role="tab"');
    expect(component).toContain('role="tabpanel"');
    expect(component).toContain('role="alert"');
    expect(component).toContain('event.key === "ArrowRight"');
    expect(component).toContain('event.key === "ArrowLeft"');
    expect(component).not.toContain("Mapping version");
  });

  it("keeps mobile action targets at least 44 pixels tall", () => {
    const styles = source("src/app/import/import-page.module.css");
    const mobileRules = styles.slice(styles.indexOf("@media (max-width: 768px)"));

    for (const selector of [
      ".primaryButton",
      ".secondaryButton",
      ".fileActions button",
      ".tab",
      ".pageButton",
    ]) {
      expect(mobileRules).toContain(selector);
    }
    expect(mobileRules).toContain("min-height: 44px");
  });

  it("keeps search, mapping, team, include, sorting, pagination, and large-import bounds", () => {
    const component = source("src/app/import/import-preview-summary.tsx");

    for (const id of [
      'id="agent-search"',
      'id="status-filter"',
      'id="team-filter"',
      'id="include-filter"',
      'id="sort-agents"',
      'id="page-size"',
    ]) {
      expect(component).toContain(id);
    }
    expect(component).toContain("No agents were found in this preview.");
    expect(component).toContain("No agents match your search and filters.");
    expect(component).toContain("previewPageSizes");
    expect(component).toContain("pagination.rows.map");
    expect(component).toContain("preview.agents.map");
  });

  it("connects KPI and warning focus to local table highlighting without remote work", () => {
    const component = source("src/app/import/import-preview-summary.tsx");

    for (const label of [
      "Total CSV rows",
      "Mapped rows / eligible",
      "Unmatched rows",
      "Invalid rows",
      "Unauthorized rows",
      "Mapped agents",
    ]) {
      expect(component).toContain(label);
    }
    expect(component).toContain("setHoverHighlight");
    expect(component).toContain("setPinnedHighlight");
    expect(component).toContain("rowMatchesHighlight");
    expect(component).toContain("aria-pressed={active}");
    expect(component).not.toContain("fetch(");
  });

  it("preserves daily metrics, one loading-aware publish action, and required acknowledgement", () => {
    const component = source("src/app/import/import-preview-summary.tsx");
    const uploadPage = source("src/app/import/import-upload-form.tsx");

    expect(uploadPage).toContain("File reporting date");
    expect(uploadPage).toContain("Choose the date represented by the totals in this CSV.");
    expect(component).toContain('"Reporting date"');
    expect(component).toContain('"System Pause"');
    expect(component).toContain('"Net"');
    expect(component.match(/action=\{confirmImportAction\}/g)).toHaveLength(1);
    expect(component.match(/Confirm and publish/g)).toHaveLength(1);
    expect(component).toContain("useFormStatus");
    expect(component).toContain("disabled={disabled || pending}");
    expect(component).toContain("Publishing…");
    expect(component).toContain("Cancel preview");
    expect(component).toContain('name="allowPartialImport"');
    expect(component).toContain("required type=\"checkbox\"");
  });

  it("does not expose removed calculation details or a warning override reason", () => {
    const files = [
      source("src/app/import/import-preview-summary.tsx"),
      source("src/import/actions.ts"),
      source("src/import/service.ts"),
      source("src/db/schema.ts"),
    ].join("\n");

    for (const removedText of [
      "Calculation details",
      "Formulas Used",
      "Hourly drill-down",
      "View details",
      "warning override reason",
      "overrideReason",
      "override_reason",
    ]) {
      expect(files).not.toContain(removedText);
    }
  });
});
