import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { performanceFilter } from "@/flags/data";

describe("performance flag filtering", () => {
  const rows = [
    { id: "flagged", wrapFlag: true, pauseFlag: false },
    { id: "clear", wrapFlag: false, pauseFlag: false },
  ];

  it("removes unflagged rows when flaggedOnly is enabled", () => {
    expect(performanceFilter(rows, { flaggedOnly: true }).map((row) => row.id)).toEqual(["flagged"]);
  });

  it("preserves unflagged rows when flaggedOnly is disabled", () => {
    expect(performanceFilter(rows, { flaggedOnly: false }).map((row) => row.id)).toEqual(["flagged", "clear"]);
  });
});
