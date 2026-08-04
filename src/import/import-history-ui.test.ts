import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Import History presentation", () => {
  it("renders exactly the seven requested headers in order", () => {
    const page = source("src/app/admin/imports/page.tsx");
    const header = page.slice(page.indexOf("<thead>"), page.indexOf("</thead>"));
    const labels = [...header.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(
      (match) => match[1],
    );

    expect(labels).toEqual([
      "Uploaded Date",
      "Type",
      "Reporting Period",
      "Uploaded By",
      "Status",
      "Published",
      "Actions",
    ]);
    expect(page).toContain("colSpan={7}");
  });

  it("keeps the compact table in the shared horizontal scroller", () => {
    const page = source("src/app/admin/imports/page.tsx");
    const styles = source("src/app/globals.css");
    const importStyles = styles.slice(
      styles.indexOf(".import-history-table"),
      styles.indexOf(".empty-table-cell"),
    );

    expect(page).toContain('<TableScroll label="Import history">');
    expect(page).toContain('className="ui-table import-history-table"');
    expect(importStyles).toContain("min-width: 54rem");
    expect(importStyles).toContain("height: auto");
    expect(importStyles).not.toContain("min-height:");
    expect(styles).toContain(".ui-button--compact");
  });

  it("shows only View Details, Deactivate, and Permanently Delete row actions", () => {
    const page = source("src/app/admin/imports/page.tsx");
    const actionCell = page.slice(
      page.indexOf('className="import-history-table__actions"'),
      page.indexOf("</td>", page.indexOf('className="import-history-table__actions"')),
    );

    expect(actionCell).toContain("View Details");
    expect(actionCell).toContain('triggerLabel="Deactivate"');
    expect(actionCell).toContain("<ImportDeleteForm");
    expect(actionCell.indexOf("View Details")).toBeLessThan(
      actionCell.indexOf('triggerLabel="Deactivate"'),
    );
    expect(actionCell.indexOf('triggerLabel="Deactivate"')).toBeLessThan(
      actionCell.indexOf("<ImportDeleteForm"),
    );
    for (const removedAction of [
      "Download",
      "Compare",
      "Replace active version",
      "Restore",
      "Review draft",
      ">Activate<",
    ]) {
      expect(actionCell).not.toContain(removedAction);
    }
  });

  it("renders only the small permanent-delete confirmation content", () => {
    const component = source("src/app/admin/imports/import-delete-form.tsx");
    const dialog = component.slice(
      component.indexOf("<dialog"),
      component.indexOf("</dialog>"),
    );

    expect(dialog).toContain("Delete this import?");
    expect(dialog).toContain(
      "Are you sure you want to permanently delete this import? This action",
    );
    expect(dialog).toContain("cannot be undone.");
    expect(dialog).toContain("Cancel");
    expect(dialog).toContain("<PermanentDeleteButton />");
    expect(component).toContain('pending ? "Deleting" : "Yes, delete"');
    expect(component).toContain("disabled={pending}");
    expect(component).toContain("assessment.requiresActiveResolution");
    expect(component).toContain('name="confirmation" type="hidden"');
    expect(component).toContain('name="reason"');
    expect(component).toContain('type="hidden"');
    expect(dialog).not.toContain("<textarea");
    expect(dialog).not.toContain('name="confirmation"');
    expect(dialog).not.toContain('name="reason"');
    expect(dialog).not.toContain("Automatic fallback");
    expect(dialog).not.toContain("Estimated records removed");
    expect(dialog).not.toContain("Reporting period");
  });

  it("does not leave a persistent deletion banner or placeholder", () => {
    const page = source("src/app/admin/imports/page.tsx");

    expect(page).not.toContain("params.deleted");
    expect(page).not.toContain("storageCleanup");
    expect(page).not.toContain("Import deleted");
  });
});
