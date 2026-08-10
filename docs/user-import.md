# User CSV import

The user importer accepts exactly these required columns, in any order:

```csv
Real Name,American Name,Shift,Email
```

Header matching is case-insensitive and ignores surrounding whitespace and a
UTF-8 BOM. Unknown columns are rejected. Every non-empty row must provide all
four values; email addresses are normalized to lowercase and checked for
format, duplicates in the file, and existing account conflicts.

`Real Name` maps to the profile name, `American Name` maps to the existing
dialer name, `Shift` maps to the existing profile shift field, and `Email` maps
to the account email. Role and Team remain administrator assignments in the
third step of the import wizard.

The legacy `Username,Dialer name,Email` format is not supported. It cannot
supply the required Shift value, so accepting it would create incomplete users
or require fabricated data.

Confirmation is intentionally partial-success: each selected row is validated
and checkpointed as created, skipped, or failed, and the final summary reports
all three counts. The batch is bound to the uploading administrator and
organization. A concurrent confirmation cannot claim an active processing
batch. The same confirmed assignment payload replays its durable result without
creating another user, and an identical claim left processing for more than ten
minutes can resume from row checkpoints. Different assignments cannot reuse a
confirmed or stale batch. Client-facing failures are generic and never include
SQL/provider details.
