# Google Sheets integration

## Transfer source

The LeaderBoard loads the latest transfer rows from the Google Sheet `Xfers`
tab through its existing Google Apps Script web app. The integration is:

```text
Xfers tab
→ Google Apps Script web app
→ server-only dashboard adapter
→ normalization and validation
→ active user matching by American Name
→ LeaderBoard transfer ranking
```

Configure these values only in the server environment:

- `GOOGLE_TRANSFERS_APPS_SCRIPT_URL`
- `LEADERBOARD_API_SECRET`
- `GOOGLE_SHEETS_TIMEZONE` (defaults to `Africa/Cairo`)

Both the URL and secret must be present together. The URL validator accepts an
HTTPS `https://script.google.com/macros/s/.../exec` deployment URL. None of
these variables use the `NEXT_PUBLIC_` prefix.

On every authenticated LeaderBoard request, the dashboard sends a server-side
POST to the web app:

```json
{ "secret": "<LEADERBOARD_API_SECRET>" }
```

The request uses `cache: "no-store"` and a 15-second timeout, so rankings use
the latest endpoint response. It follows the normal Apps Script content-service
redirect. The URL and secret are never returned to the browser, placed in query
parameters, or written to application logs.

The deployed endpoint response must be JSON with `ok: true`,
`worksheet: "Xfers"`, separate string `headers`, and matrix `rows` properties.
Optional `rowCount` must equal the number of rows, and optional `generatedAt`
must be a string. The adapter validates that envelope and prepends `headers` to
`rows` before passing the complete matrix to the shared transfer parser. Legacy
direct arrays and object-row `data` or `transfers` envelopes remain supported.
The required Xfers columns are:

- `Timestamp`
- `Opener`
- `Customer Name`
- `Phone Number`

Header parsing is case-insensitive, trims whitespace and a UTF-8 BOM, permits
any column order, and fails closed when a required header is missing or
duplicated. A valid response with zero rows remains connected and produces an
empty LeaderBoard result. Responses are limited to 100,000 rows and 5 MB.
Duplicate transfer rows and malformed opener values are excluded. Invalid
timestamps are retained as diagnostics but are not counted in the LeaderBoard.

Expected response-contract failures are returned through the LeaderBoard data
layer and rendered as a controlled in-page alert. Unexpected application,
database, and network failures continue to reach the route error boundary.

Timestamp values ending in `Z` remain UTC instants. Values without a timezone
are parsed in `GOOGLE_SHEETS_TIMEZONE`. Date filters compare the resulting
calendar date in that same timezone, independent of the dashboard server's
local timezone.

`Opener` is split at the first hyphen. The Sheet Real Name is diagnostic only.
Matching uses the text after the hyphen against the active primary dialer
mapping stored as the user's American Name. Case, Unicode compatibility,
whitespace, and harmless punctuation are normalized. Similar spellings are
not fuzzy matched. Missing matches remain unmatched, and duplicate normalized
American Names remain ambiguous; neither is counted.

This integration does not use Google Cloud, a service account, the Google
Sheets API, `googleapis`, public CSV publication, or client-side Apps Script
requests.

## Closed-deals source

The separate closed-deals provider contract remains isolated in
`src/sheets/closed-deals.ts`. No closed-deal source, headers, statuses, or
attribution rules have been invented. The current LeaderBoard ranks valid
matched transfers and labels the metric as Transfers.
