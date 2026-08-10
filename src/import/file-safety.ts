const ALLOWED_CSV_TYPES = new Set([
  "",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
]);

export function validateCsvUploadMetadata(
  file: Pick<File, "name" | "size" | "type">,
  maxBytes: number,
) {
  if (
    file.size < 1 ||
    file.size > maxBytes ||
    file.name.length < 1 ||
    file.name.length > 255 ||
    /[\u0000-\u001f\u007f/\\]/.test(file.name) ||
    !file.name.toLocaleLowerCase("en-US").endsWith(".csv") ||
    !ALLOWED_CSV_TYPES.has(file.type.toLocaleLowerCase("en-US"))
  ) {
    throw new Error("Choose a valid CSV file within the size limit.");
  }
}

export function validateCsvContent(content: Uint8Array) {
  if (content.length === 0 || content.includes(0)) {
    throw new Error("The uploaded file is not valid text CSV data.");
  }
  const prefix = Buffer.from(content.subarray(0, 512))
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLocaleLowerCase("en-US");
  if (
    prefix.startsWith("<!doctype html") ||
    prefix.startsWith("<html") ||
    prefix.startsWith("<script")
  ) {
    throw new Error("The uploaded file is not valid text CSV data.");
  }
}
