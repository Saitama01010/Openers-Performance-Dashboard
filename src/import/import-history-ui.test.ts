import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Import History redesign contract", () => {
  it("keeps the route administrator-only and uses the approved heading and upload action", () => {
    const page = source("src/app/admin/imports/page.tsx");

    expect(page).toContain('if (!actor) redirect("/login")');
    expect(page).toContain('if (actor.role !== "admin") redirect("/dashboard")');
    expect(page).toContain('eyebrow="Data operations"');
    expect(page).toContain('title="Import history"');
    expect(page).toContain(
      'description="Review all past imports, their status, and manage active datasets."',
    );
    expect(page).toContain('href="/import"');
    expect(page).toContain("Upload CSV");
  });

  it("renders truthful KPI cards, server filters, sorting, and pagination", () => {
    const component = source(
      "src/app/admin/imports/import-history-workspace.tsx",
    );
    const service = source("src/import/service.ts");

    for (const label of [
      "Total imports",
      "Active dataset",
      "Published",
      "Failed",
      "Drafts",
    ]) {
      expect(component).toContain(label);
    }
    for (const field of [
      'name="q"',
      'name="status"',
      'name="type"',
      'name="uploader"',
      'name="range"',
      'name="pageSize"',
    ]) {
      expect(component).toContain(field);
    }
    expect(component).toContain("SortHeading");
    expect(component).toContain('method="get"');
    expect(service).toContain("historyWhere(input)");
    expect(service).toContain(".limit(pageSize)");
    expect(service).toContain(".offset(offset)");
    expect(service).toContain("selectDistinct");
  });

  it("renders the approved eight-column semantic table in an internal scroller", () => {
    const component = source(
      "src/app/admin/imports/import-history-workspace.tsx",
    );
    const table = component.slice(
      component.indexOf("<table"),
      component.indexOf("</table>"),
    );

    for (const label of [
      "Import date",
      "File name",
      "Reporting period",
      "File type",
      "Status",
      "Rows",
      "Uploaded by",
      "Actions",
    ]) {
      expect(table).toContain(label);
    }
    expect(table).toContain('scope="col"');
    expect(table).toContain('scope="row"');
    expect(component).toContain("Scroll horizontally to view all columns");
    expect(component).toContain("rowMatchesHighlight");
    expect(component).toContain("rowSelected");
  });

  it("provides a focus-managed details drawer with real metadata and copy feedback", () => {
    const component = source(
      "src/app/admin/imports/import-history-workspace.tsx",
    );
    const drawer = component.slice(
      component.indexOf("function DetailsDrawer"),
      component.indexOf("function SortHeading"),
    );

    expect(drawer).toContain('role="dialog"');
    expect(drawer).toContain('aria-modal="true"');
    expect(drawer).toContain('event.key === "Escape"');
    expect(drawer).toContain('event.key !== "Tab"');
    expect(drawer).toContain("trigger?.focus()");
    expect(drawer).toContain("navigator.clipboard.writeText(row.fileHash)");
    expect(drawer).toContain('aria-live="polite"');
    expect(drawer).toContain('?? "N/A"');
    for (const label of [
      "Batch ID",
      "Reporting period",
      "File size",
      "SHA-256",
      "Rows in file",
      "Mapped rows",
      "Unmatched rows",
      "Unauthorized rows",
      "Invalid rows",
      "Unchanged rows",
      "Dataset status",
    ]) {
      expect(drawer).toContain(label);
    }
  });

  it("keeps menus and lifecycle actions keyboard accessible and backend-driven", () => {
    const workspace = source(
      "src/app/admin/imports/import-history-workspace.tsx",
    );
    const restore = source(
      "src/app/admin/imports/restore-import-dialog.tsx",
    );
    const deactivate = source(
      "src/app/admin/imports/active-import-dialog.tsx",
    );
    const deletion = source(
      "src/app/admin/imports/import-delete-form.tsx",
    );

    expect(workspace).toContain('aria-haspopup="menu"');
    expect(workspace).toContain('role="menu"');
    expect(workspace).toContain('role="menuitem"');
    expect(workspace).toContain('event.key === "ArrowDown"');
    expect(workspace).toContain('event.key === "ArrowUp"');
    expect(workspace).toContain("requestAnimationFrame");
    expect(workspace).toContain("onIntent(intent, persistentTrigger)");
    expect(workspace).toContain("canRestore(row)");
    expect(restore).toContain("restoreImportAction");
    expect(restore).toContain('name="returnQuery"');
    expect(deactivate).toContain("deactivateImportAction");
    expect(deactivate).toContain("it is not permanent deletion");
    expect(deletion).toContain("deleteImportAction");
    expect(deletion).toContain("assessment.requiresActiveResolution");
    expect(deletion).toContain("previous valid");
    expect(deletion).toContain('required type="checkbox"');
    expect(deletion).toContain("Permanently delete");
  });

  it("contains mobile, focus, reduced-motion, and no-page-overflow contracts", () => {
    const styles = source(
      "src/app/admin/imports/import-history.module.css",
    );

    expect(styles).toContain("@media (max-width: 560px)");
    expect(styles).toContain("width: 100vw");
    expect(styles).toContain("min-height: 44px");
    expect(styles).toContain("overflow-x: auto");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain(":focus-visible");
  });

  it("does not alter the completed Imports upload and review components", () => {
    const page = source("src/app/import/page.tsx");
    const review = source("src/app/import/import-preview-summary.tsx");

    expect(page).toContain("<ImportUploadForm />");
    expect(page).toContain("<ImportGuide />");
    expect(page).toContain("<ImportStepper />");
    expect(review).toContain("Review and publish");
    expect(review).toContain("Preview data");
    expect(review).toContain("Confirm and publish");
  });
});
