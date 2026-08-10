import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonBody } from "@/http/input";

const schema = z.object({ id: z.string().uuid() }).strict();

describe("bounded strict JSON input", () => {
  it("accepts a valid strict object", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }),
    });
    await expect(parseJsonBody(request, schema)).resolves.toEqual({
      id: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("rejects unknown properties, malformed JSON, and oversized bodies", async () => {
    const extra = new Request("https://example.test/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", admin: true }),
    });
    await expect(parseJsonBody(extra, schema)).rejects.toThrow();
    const malformed = new Request("https://example.test/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    await expect(parseJsonBody(malformed, schema)).rejects.toThrow("Invalid JSON");
    const oversized = new Request("https://example.test/api", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "1000" },
      body: "{}",
    });
    await expect(parseJsonBody(oversized, schema, 10)).rejects.toThrow("too large");
  });
});
