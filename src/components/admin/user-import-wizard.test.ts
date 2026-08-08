import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const wizard = readFileSync(
  resolve(process.cwd(), "src/components/admin/user-import-wizard.tsx"),
  "utf8",
);
const normalizedWizard = wizard.replace(/\r\n/g, "\n");

describe("user import wizard contract", () => {
  it("advertises only the new required headers", () => {
    expect(normalizedWizard).toContain("<h3>Required CSV headers</h3>");
    expect(normalizedWizard).toContain(
      "<ul><li>Real Name</li><li>American Name</li><li>Shift</li><li>Email</li></ul>",
    );
    expect(wizard).not.toContain("Required headers: Username");
    expect(wizard).not.toContain("Required headers: Dialer name");
  });

  it("shows the header guidance persistently and provides a template", () => {
    expect(wizard).toContain("Header names are case-insensitive.");
    expect(wizard).toContain("Download CSV template");
    expect(wizard).toContain("openers-user-import-template.csv");
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
      "Upload CSV",
      "Validate users",
      "Assign roles & teams",
      "Review & publish",
      "Results",
    ]) {
      expect(wizard).toContain(`"${step}"`);
    }
    expect(wizard).toContain("Assign role to selected");
    expect(wizard).toContain("Assign team to selected");
    expect(wizard).toContain("Publish valid users");
    expect(wizard).toContain("Invitation emails are not sent automatically.");
  });
});
