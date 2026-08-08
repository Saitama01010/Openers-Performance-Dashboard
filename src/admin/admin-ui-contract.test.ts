import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("admin interface contract", () => {
  it("renders the redesigned teams directory and authoritative workspace", () => {
    const page = source("src/app/admin/teams/page.tsx");
    const workspace = source("src/components/admin/admin-teams-workspace.tsx");
    const tableHeader = workspace.slice(workspace.indexOf("<thead"), workspace.indexOf("</thead>"));

    expect(workspace).toContain("Create a team");
    expect(page).toContain("Create reporting teams and maintain active manager and agent assignments.");
    expect(page).toContain("listAdminTeamsDirectory");
    expect(tableHeader.match(/<SortableHeader/g)).toHaveLength(5);
    expect(tableHeader.match(/<th scope="col">/g)).toHaveLength(2);
    for (const label of ["Team name", "Team manager", "Members", "Agents", "Status", "Created", "Actions"]) {
      expect(tableHeader).toContain(label);
    }
    expect(workspace).toContain('aria-labelledby="team-drawer-title"');
    expect(workspace).toContain('action: "move-member"');
    expect(workspace).toContain('action: "remove-member"');
    expect(workspace).toContain("Team performance (last 7 days)");
    expect(workspace).toContain("Overview");
    expect(workspace).toContain("Members");
    expect(workspace).toContain("Settings");
    expect(workspace).toContain("Activity");
  });

  it("renders the redesigned directory columns and authoritative controls", () => {
    const table = source("src/components/admin/admin-user-table.tsx");
    const tableHeader = table.slice(table.indexOf("<thead"), table.indexOf("</thead>"));

    expect(tableHeader.match(/<th /g)).toHaveLength(9);
    for (const label of ["User", "Email", "Role", "Team", "Shift", "Status", "Override access", "Actions"]) {
      expect(tableHeader).toContain(label);
    }
    expect(tableHeader).not.toContain("Invitation");
    expect(table).toContain("href={`/admin/users/${user.id}`}");
    expect(table).toContain("<InlineTeamSelect");
    expect(table).toContain("<InlineShiftEditor");
    expect(table).toContain('aria-labelledby="user-preview-title"');
    expect(table).toContain('aria-describedby="bulk-delete-description"');
    expect(table).toContain("<details className={styles.inlineDetails}>");
    expect(table).toContain("permissionLabel(override.permissionKey)");
    expect(table).toContain(">Delete user</Link>");
    expect(table).toContain('field: "role"');
    expect(table).toContain("openPreview(user.id)");
    expect(table).toContain("Permanently delete selected users?");
    expect(table).toContain("current.filter((user) => !deleted.has(user.id))");
    expect(table).toContain("router.refresh()");
  });

  it("keeps invitation and override filtering outside visible account columns", () => {
    const page = source("src/app/admin/users/page.tsx");
    const table = source("src/components/admin/admin-user-table.tsx");
    const tableHeader = table.slice(table.indexOf("<thead"), table.indexOf("</thead>"));

    expect(page).toContain('label="Invitation"');
    expect(page).toContain('label="Override access"');
    expect(page).toContain("invitationStatuses");
    expect(tableHeader).not.toContain("Invitation");
    expect(tableHeader).not.toContain("Last login");
  });

  it("keeps server filters across paginated directory links", () => {
    const page = source("src/app/admin/users/page.tsx");
    const table = source("src/components/admin/admin-user-table.tsx");

    expect(page).toContain("Page {pagination.page} of {totalPages} · {pagination.total} users");
    expect(page).toContain('key !== "page"');
    expect(page).toContain('search.set("page", String(page))');
    expect(page).toContain('name="override"');
    expect(table).toContain("const [rows, setRows] = useState(users)");
  });

  it("keeps full details and exposes audited management controls", () => {
    const page = source("src/app/admin/users/[userId]/page.tsx");

    expect(page).toContain("Read-only account details");
    expect(page).toContain("Dialer mapping history");
    expect(page).toContain("Team membership history");
    expect(page).toContain("Audit history");
    expect(page).toContain("allowRegenerate={false}");
    expect(page).toContain("<DeleteUserDialog userId={userId} />");
    expect(page).toContain("Edit user");
    expect(page).toContain("Save user and access");
    expect(page).toContain("updateUserAction");
    expect(page).toContain("invitationAction");
    expect(page).toContain("forcePasswordResetAction");
    expect(page).toContain("userStatusAction");
    expect(page).toContain("Role default");
    expect(page).toContain("Effective:");
    expect(page).toContain("<InlineDialerNameEditor");
  });

  it("keeps the five-stage CSV workflow usable for drag-and-drop and large files", () => {
    const wizard = source("src/components/admin/user-import-wizard.tsx");

    expect(wizard).toContain("onDrop={(event) =>");
    expect(wizard).toContain("event.dataTransfer.files[0]");
    expect(wizard).toContain("TABLE_PAGE_SIZE = 25");
    expect(wizard).toContain("<TablePagination");
    expect(wizard).toContain("aria-pressed={active}");
    expect(wizard).toContain("setValidationFilter");
    expect(wizard).toContain("Invitation emails are not sent automatically.");
  });

  it("uses a one-click warning dialog without typed-email confirmation", () => {
    const dialog = source("src/components/admin/delete-user-dialog.tsx");

    expect(dialog).toContain("Confirm permanent deletion");
    expect(dialog).toContain("cannot be undone");
    expect(dialog).not.toContain("confirmationEmail");
    expect(dialog).not.toContain("Type ");
    expect(dialog).not.toContain("<input");
  });
});
