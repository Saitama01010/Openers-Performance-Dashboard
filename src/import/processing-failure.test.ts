import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ImportConfirmationError,
  safeImportProcessingFailure,
} from "@/import/service";

describe("import processing failure redaction", () => {
  it("does not persist unexpected provider or database details", () => {
    const failure = safeImportProcessingFailure(
      new Error("mysql://private-user:private-password@internal-db/imports"),
    );

    expect(failure).toEqual({
      code: "processing_failure",
      message: "The import could not be processed. Review the file and try again.",
    });
    expect(JSON.stringify(failure)).not.toContain("private-password");
    expect(JSON.stringify(failure)).not.toContain("internal-db");
  });

  it("keeps only a bounded code for invalid user input", () => {
    const failure = safeImportProcessingFailure(
      new ImportConfirmationError("raw parser implementation details", "invalid_file"),
    );

    expect(failure).toEqual({
      code: "invalid_file",
      message: "The import input or state is invalid.",
    });
  });
});
