import { describe, expect, it } from "vitest";

import { parseBulkUserIds } from "@/admin/bulk-user-deletion";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";

describe("bulk user deletion validation", () => {
  it("deduplicates valid submitted UUIDs", () => {
    expect(parseBulkUserIds([first, second, first])).toEqual([first, second]);
  });

  it("rejects missing, empty, and invalid IDs", () => {
    expect(() => parseBulkUserIds(undefined)).toThrow(
      "Select at least one user.",
    );
    expect(() => parseBulkUserIds([])).toThrow("Select at least one user.");
    expect(() => parseBulkUserIds([first, "not-an-id"])).toThrow(
      "One or more selected user IDs are invalid.",
    );
  });
});
