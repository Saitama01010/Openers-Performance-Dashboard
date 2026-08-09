import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { singleTenantInvariantError } from "@/tenancy/safety";

describe("single-tenant production invariant", () => {
  it("accepts exactly one active organization", () => {
    expect(singleTenantInvariantError(1)).toBeNull();
  });

  it.each([0, 2, 10])("rejects %s active organizations", (count) => {
    expect(singleTenantInvariantError(count)).toContain("exactly one");
  });
});
