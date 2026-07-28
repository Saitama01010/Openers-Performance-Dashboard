import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("simplified admin interface contract", () => {
  it("shows only team creation and the four-column current-members interface", () => {
    const page = source("src/app/admin/teams/page.tsx");
    const tableHeader = page.slice(
      page.indexOf("<thead"),
      page.indexOf("</thead>"),
    );

    expect(page).toContain("Create a team");
    expect(page).toContain("Current members");
    expect(page).not.toContain("Team administration");
    expect(page).not.toContain("Rename");
    expect(page).not.toContain("Assign manager");
    expect(page).not.toContain("Move agent");
    expect(page).not.toContain("Activate");
    expect(page).not.toContain("Deactivate");
    expect(tableHeader.match(/<th /g)).toHaveLength(4);
    expect(tableHeader).toContain("Member");
    expect(tableHeader).toContain("Role");
    expect(tableHeader).toContain("Team");
    expect(tableHeader).toContain("Started");
    expect(page).toContain("<InlineTeamSelect");
  });

  it("renders exactly eight account columns and links the full name", () => {
    const table = source("src/components/admin/admin-user-table.tsx");
    const tableHeader = table.slice(
      table.indexOf("<thead"),
      table.indexOf("</thead>"),
    );

    expect(tableHeader.match(/<th /g)).toHaveLength(8);
    for (const label of [
      "Full name",
      "Email",
      "Dialer name",
      "Role",
      "Team",
      "Account",
      "Invitation",
      "Last login",
    ]) {
      expect(tableHeader).toContain(label);
    }
    expect(tableHeader).not.toContain("Created");
    expect(tableHeader).not.toContain("Actions");
    expect(table).toContain("href={`/admin/users/${user.id}`}");
    expect(table.indexOf(`aria-label={\`Select ${"${user.name}"}\`}`)).toBeLessThan(
      table.indexOf("href={`/admin/users/${user.id}`}"),
    );
    expect(table).toContain("<InlineEmailEditor");
    expect(table).toContain("<InlineDialerNameEditor");
    expect(table).toContain("<InlineTeamSelect");
  });

  it("keeps the user detail page read-only apart from reveal and deletion controls", () => {
    const page = source("src/app/admin/users/[userId]/page.tsx");

    expect(page).toContain("Read-only account details");
    expect(page).toContain("Dialer mapping history");
    expect(page).toContain("Team membership history");
    expect(page).toContain("Audit history");
    expect(page).toContain("allowRegenerate={false}");
    expect(page).toContain("<DeleteUserDialog userId={userId} />");
    expect(page).not.toContain("Edit user");
    expect(page).not.toContain("Save user changes");
    expect(page).not.toContain("<form");
    expect(page).not.toContain("<input");
    expect(page).not.toContain("<select");
    expect(page).not.toContain("updateUserAction");
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
