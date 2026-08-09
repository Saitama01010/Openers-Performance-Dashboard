import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

describe("request correlation proxy", () => {
  it("replaces a browser-supplied correlation ID with a server-generated ID", () => {
    const response = proxy(new NextRequest("http://localhost/dashboard", {
      headers: { "x-request-id": "attacker-controlled" },
    }));
    const value = response.headers.get("x-request-id");
    expect(value).toMatch(/^[0-9a-f-]{36}$/);
    expect(value).not.toBe("attacker-controlled");
  });
});
