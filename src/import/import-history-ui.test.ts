import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Import History presentation", () => {
  it("keeps the table in the shared horizontal scroller with compact content-sized rows", () => {
    const page = source("src/app/admin/imports/page.tsx");
    const styles = source("src/app/globals.css");
    const importStyles = styles.slice(
      styles.indexOf(".import-history-table"),
      styles.indexOf(".empty-table-cell"),
    );

    expect(page).toContain('<TableScroll label="Import history">');
    expect(page).toContain('className="ui-table import-history-table"');
    expect(importStyles).toContain("height: auto");
    expect(importStyles).not.toContain("min-height:");
    expect(importStyles).toContain("vertical-align: top");
    expect(importStyles).toContain("-webkit-line-clamp: 2");
    expect(styles).toContain(".ui-button--compact");
  });

  it("shows only Permanently delete, Deactivate, and View Details row actions", () => {
    const page = source("src/app/admin/imports/page.tsx");
    const deleteDialog = source(
      "src/app/admin/imports/import-delete-form.tsx",
    );
    const actionCell = page.slice(
      page.indexOf('className="import-history-table__actions"'),
      page.indexOf("</td>", page.indexOf('className="import-history-table__actions"')),
    );

    expect(actionCell).toContain("<ImportDeleteForm");
    expect(actionCell).toContain("<ActiveImportDialog");
    expect(actionCell).toContain('triggerLabel="Deactivate"');
    expect(actionCell).toContain("View Details");
    expect(actionCell.match(/ui-button--compact/g)).toHaveLength(1);
    expect(deleteDialog).toContain("Permanently delete");
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

  it("does not leave a persistent success banner or deleted placeholder", () => {
    const page = source("src/app/admin/imports/page.tsx");

    expect(page).not.toContain("params.deleted");
    expect(page).not.toContain("storageCleanup");
    expect(page).not.toContain("Import deleted");
    expect(page).not.toContain("deleted banner");
  });

  it("states every import-owned record removed by the confirmation", () => {
    const dialog = source("src/app/admin/imports/import-delete-form.tsx");

    for (const record of [
      "CSV file",
      "raw stored content",
      "parsed import rows",
      "validation",
      "import errors",
      "version-owned metrics",
      "dataset version",
    ]) {
      expect(dialog).toContain(record);
    }
  });
});
