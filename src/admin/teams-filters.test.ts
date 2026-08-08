import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveAdminTeamDirectoryFilters } from "@/admin/teams";

describe("admin team directory filters", () => {
  it("normalizes supported server filters", () => {
    expect(resolveAdminTeamDirectoryFilters({
      q: "  East   Openers  ",
      status: "inactive",
      manager: " manager-1 ",
      sort: "agents",
      direction: "desc",
      page: "3",
      pageSize: "25",
    })).toEqual({
      query: "East Openers",
      status: "inactive",
      managerId: "manager-1",
      sortBy: "agents",
      direction: "desc",
      page: 3,
      pageSize: 25,
    });
  });

  it("falls back safely for unsupported values", () => {
    expect(resolveAdminTeamDirectoryFilters({
      status: "deleted",
      sort: "secret",
      direction: "sideways",
      page: "-4",
      pageSize: "1000",
    })).toMatchObject({ status: "", sortBy: "name", direction: "asc", page: 1, pageSize: 10 });
  });
});
