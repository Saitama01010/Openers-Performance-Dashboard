# Google Sheets integration

## Transfer source

Transfer ingestion is implemented server-side in `src/sheets/transfers.ts`.
Configuration is read only through validated server environment variables:

- `GOOGLE_TRANSFERS_SHEET_ID`
- `GOOGLE_TRANSFERS_SHEET_GID`
- `GOOGLE_TRANSFERS_SHEET_RANGE` (required for authenticated access)
- `GOOGLE_TRANSFERS_SHEET_TIMEZONE` (defaults to `Africa/Cairo`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` and
  `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (both required for a private Sheet)

The configured source must contain `Timestamp`, `Opener`, `Customer Name`, and
`Phone Number`. Header parsing trims whitespace and a UTF-8 BOM, and fails with
a configuration error when a required header is absent. Public Sheets use the
Google CSV export endpoint. Private Sheets use a short-lived, read-only
service-account token and the Google Sheets Values API.

Timestamp values ending in `Z` remain UTC instants. Values without a timezone
are parsed in the configured Sheet timezone rather than the server timezone.
Invalid values are retained as row diagnostics and excluded from date-based
work.

`Opener` is split at the first hyphen. The Sheet Real Name is diagnostic only;
matching uses the normalized American Name. Case, Unicode compatibility,
whitespace, and harmless punctuation are normalized. Similar spellings are
not fuzzy matched. Missing names remain unmatched, and duplicate user American
Names remain ambiguous.

## Closed-deals source

The closed-deals provider contract is isolated in
`src/sheets/closed-deals.ts`. No Sheet ID, headers, statuses, or attribution
rules have been invented. Until the real source is supplied, LeaderBoard
returns:

> Closed-deals data source has not been configured yet.

Transfer count is never presented as Closed Deals.
