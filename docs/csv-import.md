# Dialer CSV Import

The importer accepts the exact dialer headers documented in `fixtures/dialer-sample.csv`, including UTF-8 BOM, case-insensitive aliases, and surrounding whitespace. Agent identities are trimmed, internal whitespace is collapsed, and comparisons are case-insensitive while display text is retained.

Preview content is stored in a database batch tied to uploader, SHA-256 file hash, creation time, and expiry. Validation failures are retained in `import_errors` when the preview batch is created. Confirmation reloads the raw server-side content, verifies ownership and permissions, recalculates mappings and scope, checks the hash and duplicate status, and inserts or updates hourly rows in one transaction. Unchanged rows are skipped.

Confirmation is blocked for missing headers, exact duplicate files, unknown or out-of-scope agents, invalid rows or mappings, expired/foreign previews, and previews with no new or changed rows.
