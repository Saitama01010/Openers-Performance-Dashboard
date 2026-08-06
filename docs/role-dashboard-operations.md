# Role dashboard operations

## Architecture and scope

`/dashboard` authenticates once, resolves the requested date range, and invokes one server-only role data composer. The composer returns a discriminated agent, manager, or admin payload; client code never removes unauthorized records. Agents receive self-only operational records plus company rank and aggregate team competition. Managers receive current assigned-team person rows and company team aggregates. Admins receive company scope.

Transfers and Closed outcomes come from the existing combined leaderboard ingestion. Ranking uses the existing leaderboard ranking function, commissions use the existing commission service, and automatic flags remain calculated by the existing flag domain. Dialer queries join through the active dataset-version pointer. Missing sources retain an unavailable or incomplete state instead of becoming zero or absence.

Targets and tenure thresholds are effective-dated. Team targets override company targets only when their effective range applies. Employment tenure uses `profiles.employment_start_date`, never team-membership start. Coaching reports, shadowing records, manual cases, and transfer requests recheck organization and role scope for every mutation.

## Request cost and scale

A diagnostic run against the disposable QA database measured conservative uncached ceilings of 31 SQL statements for an agent dashboard, 51 for a manager dashboard, and 44 for an admin dashboard. These are bounded per request and do not grow per employee. In the Next.js server render, repeated ORM roster reads use `React.cache` request memoization, so identical actor-scoped calls in flags, operations, and dashboard composition are deduplicated within the render pass. No authorization result or matched employee payload is cached across users.

The external Transfers/Closed provider performs zero network reads on a cache hit and one combined `listSources` read on a cache miss. Transfers and Closed are fetched together, concurrent misses share the same in-flight promise, and commission/dashboard matching reuse the same three-minute raw-source cache. Matching remains actor-specific after the raw source is loaded.

The main in-memory work is `O(E + R + F + H + E log E)`: active employees, coaching/workflow records, flag rows, hourly rows, and leaderboard sorting. There is no query or source request per employee. Independent sources are loaded in parallel and source-specific errors remain separate.

The manager operating table renders 50 rows per page while totals, attention counts, and protected CSV exports cover the full authorized scope. Coaching-room source selection is capped at 30 recent sessions on the dashboard; the existing Coaching room provides its own paginated history. Admin talent preview is capped at 12 rows, with existing agent/team drill-down routes for detail.

## Protected exports

Agents have no dashboard export permission. Managers export only the server-resolved current assigned-team roster for the selected period; URL team filters are rejected outside their active assignments. Admins can export aggregate company team comparison or a selected team. General exports omit coaching notes, investigation notes, credentials, and other private case content.

## Operational history

Employment changes soft-deactivate access, revoke active sessions, and append employment/audit events. Coaching report revisions are immutable snapshots. Manual case status/ownership changes append case events. Team transfers close the old membership and create the new membership transactionally after management approval. Historical records retain team snapshots, while manager dashboard lists also require the subject to remain in the manager's current active-team roster.
