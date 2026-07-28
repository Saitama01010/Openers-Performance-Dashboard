import { describe, expect, it } from "vitest";

import {
  toggleAllUserSelection,
  toggleUserSelection,
} from "@/admin/user-selection";

describe("admin user selection", () => {
  it("selects every selectable user and clears them on the next toggle", () => {
    const selected = toggleAllUserSelection(new Set(), ["a", "b", "c"]);
    expect(Array.from(selected)).toEqual(["a", "b", "c"]);
    expect(toggleAllUserSelection(selected, ["a", "b", "c"]).size).toBe(0);
  });

  it("supports individual deselection after select-all", () => {
    const selected = toggleAllUserSelection(new Set(), ["a", "b"]);
    const next = toggleUserSelection(selected, "b");
    expect(Array.from(next)).toEqual(["a"]);
  });
});
