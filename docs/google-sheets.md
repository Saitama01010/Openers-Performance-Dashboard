# Google Sheets integration

## Server-only source flow

The authenticated dashboard loads both `Xfers` and `Closed` through one POST
to the existing Google Apps Script web app:

```text
Xfers + Closed tabs
→ Google Apps Script web app
→ server-only dashboard adapter
→ source-specific normalization and validation
→ active user matching by American Name
→ transfer summary + closed-deal LeaderBoard ranking
```

Configure only the existing server environment values:

- `GOOGLE_TRANSFERS_APPS_SCRIPT_URL`
- `LEADERBOARD_API_SECRET`
- `GOOGLE_SHEETS_TIMEZONE` (defaults to `Africa/Cairo`)

Both URL and secret must be present together. The URL must be an HTTPS
`https://script.google.com/macros/s/.../exec` deployment URL. None of these
variables uses the `NEXT_PUBLIC_` prefix.

The adapter sends `{ "secret": "<LEADERBOARD_API_SECRET>" }` in the JSON body
of a server-side POST. The underlying fetch uses `cache: "no-store"`, follows
Apps Script redirects, has a 15-second timeout, and never exposes the endpoint
or secret to browser code. Parsed source data is held in a three-minute
server-side cache with concurrent requests coalesced. The LeaderBoard refreshes
automatically about every five minutes, and its authenticated manual Refresh
action invalidates the same combined cache. If a temporary refresh fails after
a complete successful read, the last successful ranking is retained and marked
stale.

## Response contract

The top level remains the backward-compatible Xfers envelope:

```json
{
  "ok": true,
  "worksheet": "Xfers",
  "headers": ["Timestamp", "Opener", "Customer Name", "Phone Number"],
  "rows": [],
  "rowCount": 0,
  "sourceRowNumbers": [],
  "generatedAt": "2026-07-30T10:00:00.000Z",
  "closed": {
    "ok": true,
    "worksheet": "Closed",
    "headers": [
      "Timestamp",
      "Closer",
      "Customer Name",
      "File Number",
      "Debt Amount",
      "Ready For Submission",
      "Opener"
    ],
    "rows": [],
    "rowCount": 0,
    "sourceRowNumbers": [],
    "generatedAt": "2026-07-30T10:00:00.000Z"
  }
}
```

Optional `rowCount` must equal the corresponding rows length. Optional
`sourceRowNumbers` must align with the rows and is used only for diagnostics.
Optional `generatedAt` must be a string. Responses are limited to 100,000 rows
per source and 5 MB overall.

Xfers parsing remains independent from Closed. A nested Closed `ok: false`,
invalid envelope, or header error does not invalidate a successfully parsed
Xfers source. It produces a controlled Closed state and no ranking.

## Headers and rows

Xfers requires:

- `Timestamp`
- `Opener`
- `Customer Name`
- `Phone Number`

Closed requires:

- `Timestamp`
- `Closer`
- `Customer Name`
- `File Number`
- `Debt Amount`
- `Ready For Submission`
- `Opener`

Both parsers match headers case-insensitively, remove a UTF-8 BOM, trim and
collapse whitespace, and map by name in any column order. Extra columns are
ignored. Missing or duplicated required headers fail only that source.

Closed inspects every returned row. Each cell is trimmed, and a row is ignored
only when every cell is empty. There is no row-parity logic, so alternating
blank separators, consecutive submissions, and multiple blank rows all behave
the same. Every valid non-empty Closed row counts once. File Number is not used
for deduplication, and Ready For Submission does not filter the count.

## Timestamp and attribution rules

Timestamps ending in `Z` are preserved as UTC instants. Values such as
`2026-05-01 20:34:33` are interpreted in `GOOGLE_SHEETS_TIMEZONE`, independent
of the deployment server timezone. Invalid or empty Closed timestamps mark only
that row invalid; the row is excluded from date-filtered counts and included in
safe aggregate administrator diagnostics.

Closed `Opener` accepts either a plain American Name (`Gia Monroe`) or a
combined Real Name-American Name value (`Amira Ayman - Gia Monroe`). Matching
uses only the extracted American Name and the existing active primary dialer
mapping. Unicode compatibility, case, conservative punctuation, and repeated
spaces are normalized. There is no fuzzy matching. Zero matches are unmatched;
multiple exact normalized matches are ambiguous; neither outcome is assigned
or counted.

LeaderBoard order is Closed Deals descending, then American Name ascending.
Active agents with zero matched deals remain in the ranking. Date filtering
uses the Closed timestamp. Search and team filters operate on database user
identity and membership; Sheet values never overwrite database names.

## Privacy and diagnostics

The client receives only safe ranking fields and aggregate source state.
Customer names, phone numbers, file numbers, debt amounts, Ready For Submission
values, raw rows, endpoint URLs, secrets, and stack traces remain server-side.
Only administrators receive aggregate Closed diagnostics: connection and header
status, non-empty/valid/matched/unmatched/ambiguous/invalid counts, invalid
timestamp count, worksheet name, and last successful synchronization.

This integration does not use Google Cloud, a service account, the Google
Sheets API, `googleapis`, public CSV publication, or client-side Apps Script
requests.
