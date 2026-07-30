export function normalizeSheetHeader(value: unknown) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

export function sheetCellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }
  return null;
}

export function normalizeAmericanName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[.’'`]/gu, "")
    .replace(/[\p{Pd},;:()[\]{}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ExtractedOpener = {
  sheetRealName: string | null;
  sheetAmericanName: string;
};

export function extractOpenerAmericanName(
  value: string,
): ExtractedOpener | null {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  const separator = trimmed.indexOf("-");
  if (separator === -1) {
    return {
      sheetRealName: null,
      sheetAmericanName: trimmed,
    };
  }

  const sheetRealName = trimmed.slice(0, separator).trim();
  const sheetAmericanName = trimmed.slice(separator + 1).trim();
  if (!sheetRealName || !sheetAmericanName) return null;

  return { sheetRealName, sheetAmericanName };
}
