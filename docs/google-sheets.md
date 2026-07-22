# Google Sheets Integration

The real spreadsheets and column headers have not been provided, so the integration is not verified.

`src/sheets/contracts.ts` currently defines source-neutral transfer and closed-deal contracts. The production integration will store configurable spreadsheet IDs, tab names, source type, and column mappings; ingest immutable source IDs idempotently; retain row hashes for edits; and combine event ingestion with scheduled reconciliation.

No customer fields, credentials, spreadsheet IDs, or guessed headers are hard-coded.
