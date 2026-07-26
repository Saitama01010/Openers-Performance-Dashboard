import { describe, expect, it } from "vitest";

import {
  MAX_USER_CSV_ROWS,
  parseUserImportCsv,
} from "@/admin/user-import-csv";

const teams = [
  { id: "east", name: "East Openers", active: true },
  { id: "old", name: "Old Team", active: false },
];

describe("user provisioning CSV", () => {
  it("accepts the minimum headers case-insensitively and leaves assignments open", () => {
    const preview = parseUserImportCsv({
      content:
        " user NAME , DIALER username , EMAIL Address \n Ava Rivera , Ava Dialer , AVA@EXAMPLE.COM\n",
      teams,
    });

    expect(preview.fatalErrors).toEqual([]);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({
      username: "Ava Rivera",
      dialerName: "Ava Dialer",
      email: "ava@example.com",
      role: null,
      teamId: null,
      validForAssignment: true,
    });
  });

  it("preselects valid optional role and team values", () => {
    const preview = parseUserImportCsv({
      content:
        "Username,Dialer name,Email,User role,Team name\nAva,Ava Dialer,ava@example.com,Team Manager,East Openers",
      teams,
    });
    expect(preview.rows[0]).toMatchObject({
      role: "manager",
      teamId: "east",
      teamName: "East Openers",
      errors: [],
    });
  });

  it("blocks duplicates, database conflicts, inactive assignments, and formula injection", () => {
    const preview = parseUserImportCsv({
      content: [
        "Username,Dialer name,Email,Role,Team",
        "Ava,Ava Dialer,ava@example.com,Agent,Old Team",
        "=Ava,Ava Dialer,ava@example.com,Unknown,Missing Team",
      ].join("\n"),
      existingEmails: ["ava@example.com"],
      existingDialerNames: ["ava dialer"],
      teams,
    });
    const messages = preview.rows.flatMap((row) => row.errors).join(" ");

    expect(messages).toContain("Email is duplicated");
    expect(messages).toContain("Dialer name is duplicated");
    expect(messages).toContain("already exists");
    expect(messages).toContain("already assigned");
    expect(messages).toContain("inactive");
    expect(messages).toContain("Unknown role");
    expect(messages).toContain("Unknown team");
    expect(messages).toContain("beginning with");
  });

  it("ignores empty rows and rejects malformed, unsupported, and oversized CSVs", () => {
    const empty = parseUserImportCsv({
      content:
        "Username,Dialer name,Email\nAva,Ava Dialer,ava@example.com\n,,\n",
      teams,
    });
    expect(empty.rows).toHaveLength(1);
    expect(empty.ignoredEmptyRows).toBe(1);

    expect(
      parseUserImportCsv({
        content: "Username,Dialer name,Email,Surprise\nA,B,a@example.com,x",
      }).fatalErrors,
    ).toContain("Unsupported CSV header: Surprise.");
    expect(
      parseUserImportCsv({
        content: 'Username,Dialer name,Email\n"unclosed',
      }).fatalErrors[0],
    ).toContain("malformed");

    const rows = Array.from(
      { length: MAX_USER_CSV_ROWS + 1 },
      (_, index) => `User ${index},Dialer ${index},user${index}@example.com`,
    );
    expect(
      parseUserImportCsv({
        content: ["Username,Dialer name,Email", ...rows].join("\n"),
      }).fatalErrors[0],
    ).toContain(`${MAX_USER_CSV_ROWS}-row limit`);
  });
});
