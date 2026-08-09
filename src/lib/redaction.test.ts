import { describe, expect, it } from "vitest";

import { redactSecrets, redactText } from "@/lib/redaction";

describe("secret redaction", () => {
  it("redacts nested secret fields without mutating safe diagnostics", () => {
    expect(
      redactSecrets({
        action: "login.failed",
        password: "plain",
        nested: { resetToken: "raw", entityId: "safe-id" },
      }),
    ).toEqual({
      action: "login.failed",
      password: "[REDACTED]",
      nested: { resetToken: "[REDACTED]", entityId: "safe-id" },
    });
  });

  it("redacts bearer values and token-bearing URLs", () => {
    const result = redactText(
      "Bearer abc.def https://example.test/reset?token=raw-value&next=/",
    );
    expect(result).not.toContain("abc.def");
    expect(result).not.toContain("raw-value");
  });
});
