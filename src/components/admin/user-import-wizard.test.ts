import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const wizard = readFileSync(
  resolve(process.cwd(), "src/components/admin/user-import-wizard.tsx"),
  "utf8",
);

describe("user import wizard contract", () => {
  it("advertises only the new required headers", () => {
    expect(wizard).toContain(
      "Required headers: Real Name, American Name,\n            Shift, Email.",
    );
    expect(wizard).not.toContain("Required headers: Username");
    expect(wizard).not.toContain("Required headers: Dialer name");
  });

  it("shows the accessible header tooltip on hover and keyboard focus", () => {
    expect(wizard).toContain('aria-label="CSV header requirements"');
    expect(wizard).toContain('role="tooltip"');
    expect(wizard).toContain("group-hover:visible");
    expect(wizard).toContain("group-hover:opacity-100");
    expect(wizard).toContain("group-focus-within:visible");
    expect(wizard).toContain("group-focus-within:opacity-100");
    expect(wizard).toContain(
      "Required CSV headers: Real Name, American Name, Shift, Email.",
    );
    expect(wizard).toContain(
      "The header names are not case-sensitive, but all four columns",
    );
    expect(wizard).toContain(
      "Example: Real Name,American Name,Shift,Email",
    );
  });

  it("renders the seven requested validation preview columns", () => {
    const previewTable = wizard.slice(
      wizard.indexOf("function ValidationPreviewTable"),
      wizard.indexOf("function AssignmentTable"),
    );
    const header = previewTable.slice(
      previewTable.indexOf("<thead"),
      previewTable.indexOf("</thead>"),
    );

    expect(header.match(/<th /g)).toHaveLength(7);
    for (const label of [
      "Row number",
      "Real Name",
      "American Name",
      "Shift",
      "Email",
      "Validation status",
      "Validation message",
    ]) {
      expect(header).toContain(label);
    }
    expect(previewTable).toContain("row.realName");
    expect(previewTable).toContain("row.americanName");
    expect(previewTable).toContain("row.shift");
  });

  it("preserves role and team assignment, confirmation, and invitation behavior", () => {
    for (const step of [
      "Upload",
      "Validate users",
      "Assign roles and teams",
      "Confirm import",
      "Results",
    ]) {
      expect(wizard).toContain(`"${step}"`);
    }
    expect(wizard).toContain("Assign role to selected");
    expect(wizard).toContain("Assign team to selected");
    expect(wizard).toContain("Confirm import");
    expect(wizard).toContain("No invitation emails will be");
  });
});
