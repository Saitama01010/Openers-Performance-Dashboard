const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_BULK_USER_DELETION = 100;

export function parseUserIds(value: unknown, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Select at least one user.");
  }
  if (value.length > maximum) {
    throw new Error(
      `Select no more than ${maximum} users at a time.`,
    );
  }

  const ids = value.map((id) => {
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
      throw new Error("One or more selected user IDs are invalid.");
    }
    return id.toLowerCase();
  });

  return Array.from(new Set(ids));
}

export function parseBulkUserIds(value: unknown) {
  return parseUserIds(value, MAX_BULK_USER_DELETION);
}
