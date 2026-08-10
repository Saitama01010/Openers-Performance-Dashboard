import { describe, expect, it } from "vitest";

import { validateCsvContent, validateCsvUploadMetadata } from "@/import/file-safety";

describe("CSV upload safety", () => {
  it("accepts ordinary CSV metadata and content", () => {
    expect(() => validateCsvUploadMetadata({ name: "agents.csv", size: 20, type: "text/csv" }, 100)).not.toThrow();
    expect(() => validateCsvContent(Buffer.from("Agent,Date\nAva,2026-08-09"))).not.toThrow();
  });

  it.each(["agents.csv\r\nX-Evil: yes", "../agents.csv", "agents.html", "a\\agents.csv"])("rejects unsafe filename %s", (name) => {
    expect(() => validateCsvUploadMetadata({ name, size: 20, type: "text/csv" }, 100)).toThrow();
  });

  it("rejects HTML, NUL bytes, invalid MIME types, and oversize files", () => {
    expect(() => validateCsvContent(Buffer.from("<html><script>alert(1)</script>"))).toThrow();
    expect(() => validateCsvContent(Buffer.from([65, 0, 66]))).toThrow();
    expect(() => validateCsvUploadMetadata({ name: "a.csv", size: 20, type: "text/html" }, 100)).toThrow();
    expect(() => validateCsvUploadMetadata({ name: "a.csv", size: 101, type: "text/csv" }, 100)).toThrow();
  });
});
