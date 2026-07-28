# UI audit before redesign

Audit date: 2026-07-28

Branch: `feature/full-dashboard-ui-system-redesign`

Reference: the attached compact enterprise performance dashboard screenshot
Application baseline: Next.js 16.2.11, React 19.2.4, Tailwind CSS 4

## Baseline verification

| Check | Result | Notes |
| --- | --- | --- |
| Dependency install | Passed with warning | `npm install` completed. Windows retained one stale temporary Next.js SWC directory because an older local server held the native file open. |
| Lint | Passed | `npm run lint` completed without findings. |
| Tests | Pre-existing failure | 157 of 158 tests passed. `src/dashboard/data.integration.test.ts` expected its isolated fixture total of 30 calls but read 28,005 calls from the shared seeded database. No source files had been changed when this was recorded. |
| Production build | Passed | `npm run build` compiled, typechecked, and generated all routes successfully. |

## Product and role model

- Administrators see company-wide performance, imports, permanent import history, users, teams, permissions, and audit records.
- Managers see performance and imports restricted to their active team assignments.
- Agents see only their own active-version performance and cannot access imports or administration.
- Server-side route guards, permission checks, team scope, active import versioning, CSV validation, authentication, and audit logging are authoritative and must remain unchanged.
- Current data is real local database data. No screenshot values or identities may be copied into the product.

## Route inventory

### User-facing pages

| Route | Current purpose | Controls and links | Current state |
| --- | --- | --- | --- |
| `/` | Redirect to the signed-in dashboard flow. | None. | Functional redirect. |
| `/login` | Authenticate an existing account. | Email, password, submit, forgot-password link. | Functional. Generic centered card; submit has no visible pending state; local-development copy is exposed to every environment. |
| `/forgot-password` | Request a password reset without disclosing account eligibility. | Email, submit, return link. | Functional. Same generic card; no visible pending state. |
| `/reset-password` | Validate a reset token and create a new password. | New password, confirmation, submit, return link. | Functional. Error copy is safe but the form lacks shared password guidance and pending treatment. |
| `/accept-invitation` | Validate an invitation token and create the first permanent password. | Password, confirmation, submit, return link. | Functional. Duplicates reset-password presentation and field markup. |
| `/dashboard` | Show role-scoped active-version totals, hourly activity, time allocation, freshness, reconciliation, and agent rows. | Show/hide no-data agents, navigation, sign out, horizontally scrollable agent table. | Functional and truthful. Hierarchy is a wall of nine equal metric cards; charts are basic progress rows; all agent rows render at once; table rows do not drill into detail. |
| `/import` | Upload an agent-hours CSV, review a saved draft preview, publish it, or reject it. | Reporting date, file upload, preview submit, publish/reject controls, search, status/team filters, sort, direction, page size, pagination. | Functional. The preview is very long and mixes bespoke Tailwind styling with shared primitives. Copy exposes internal workflow terms in several places. |
| `/admin` | Redirect administrators to user management. | None. | Functional redirect. |
| `/admin/users` | Search, filter, create, import, invite, map, ignore, and manage accounts. | Query and role/status/invitation/team filters, apply/clear, pagination, row selection, invitation action, create form, permission overrides, CSV user import wizard, unmatched-name actions, detail links. | Functional and feature-rich. Dense one-off layout, inconsistent controls, raw status presentation, and several operations without the shared pending button. |
| `/admin/users/[userId]` | Edit one account and inspect credentials, mappings, memberships, tokens, and audit history. | Back link, inline fields, temporary-password controls, invitation/reset/session actions, status actions, deletion dialog, expandable history sections. | Functional. Information hierarchy is fragmented across unrelated card styles; technical details compete with primary account work. |
| `/admin/teams` | Create teams and reassign active members. | Team-name form and inline team selects. | Functional. Success message says only “Action completed”; reassignment has local feedback but the page does not use the shared page header/table system. |
| `/admin/permissions` | Display seeded role permission defaults. | Read-only tables. | Truthful read-only view. Raw permission keys are exposed directly and require internal knowledge. |
| `/admin/audit` | Display humanized administrative and import events. | Technical-details disclosure per row. | Functional. Main event titles are humanized, but targets still appear as `entityType:id`, technical JSON is visually prominent, and no useful filters exist. |
| `/admin/imports` | Review permanent import history and navigate to preview, download, comparison, rollback, restore, deactivation, or deletion. | Import link, detail/preview/download/action links, pagination. | Functional. Very wide table and crowded action column; status and history concepts need clearer grouping. |
| `/admin/imports/[batchId]` | Inspect immutable validation, comparison, dataset versions, and available lifecycle actions for one upload. | Back, download, preview, deactivate, rollback, restore, permanent deletion. | Functional. Long page with repeated cards and competing destructive actions; lifecycle terminology needs progressive disclosure. |

### Routes requested by the brief but absent from the current application

The repository does not currently contain dedicated routes for:

- Performance analysis
- Agent directory
- Agent detail
- Team performance

The underlying role-scoped dashboard data already contains truthful agent, team, hourly, duration, and rate data. The redesign may add read-only drill-down routes only through the existing scoped data boundary; it must not create unsupported metrics, permissions, or operational claims.

### API and download routes

| Route | Purpose |
| --- | --- |
| `/api/admin/users/[userId]` | Update a user record. |
| `/api/admin/users/[userId]/temporary-password` | Retrieve or regenerate an audited temporary password. |
| `/api/admin/users/import/preview` | Validate an administrator user CSV. |
| `/api/admin/users/import/confirm` | Confirm an administrator user CSV. |
| `/api/admin/users/invitations` | Send selected invitations. |
| `/api/imports/[batchId]/download` | Download the original authorized CSV. |

### Layout, loading, and error boundaries

- `src/app/layout.tsx` owns global metadata, Geist, Geist Mono, and global CSS.
- `src/app/admin/layout.tsx` enforces administrator access and mounts the dashboard shell.
- Dashboard, import, admin, users, and teams have route-level loading or error UI.
- Loading geometry is generic and does not always resemble the destination page.
- Error pages share a functional retry component and safe recovery copy.
- There is no custom root `not-found.tsx` or `global-error.tsx`.

## Global shell findings

### What works

- The active route is conveyed with `aria-current`.
- Role visibility is derived from the signed-in role and server authorization remains independent.
- A skip link and visible focus ring are present.
- Sign out uses a server action and pending state.
- Desktop navigation, content, and profile areas have stable semantic landmarks.

### What needs redesign

- The dark navy shell is close to the target but uses a 240px sidebar rather than the screenshot’s compact 176–184px rail.
- Navigation is one undifferentiated list; Workspace and Administration groups are not labeled.
- On narrow screens the entire sidebar moves above the page and the navigation becomes a horizontal scroller. It is not an accessible drawer, does not trap focus, and consumes significant first-viewport space.
- The top bar repeats generic security copy on every page instead of showing useful scope, freshness, or page actions.
- The profile block is visually heavy and the sign-out action competes with navigation.
- The sidebar mark is a generic letter tile rather than a resolved Openers identity.

## Design-system findings

### Existing strengths

- Global semantic tokens already cover background, foreground, surface, border, primary, danger, success, warning, sidebar, focus, radii, shadows, motion, and z-index.
- Shared primitives exist for page headers, status messages, badges, table scrolling, empty table rows, loading skeletons, pending submit buttons, confirmation dialogs, and error states.
- Tables use captions, scope attributes, tabular numerals, and controlled horizontal scrolling.
- Motion is restrained and reduced-motion handling exists in global CSS.

### Inconsistencies

- Many pages bypass shared primitives and repeat long Tailwind class strings.
- The existing generated `design-system/openers-performance-dashboard/MASTER.md` conflicts with the screenshot and current implementation: it recommends Fira, amber CTAs, gradients, pill buttons, large shadows, mobile-first app conventions, and 400–600ms page transitions.
- Geist Mono is overused for large metric values, creating a code-console character rather than the screenshot’s polished operational tone.
- Cards, tables, form fields, headings, and status badges vary by route.
- Radii are generally larger and page spacing looser than the compact reference.
- Accent colors are not yet assigned stable semantic chart roles.
- Auth pages are visually disconnected from the authenticated product.

## Control audit

### Confirmed functional patterns

- No `href="#"`, empty `onClick`, console-only handler, or obvious placeholder button pattern was found.
- Native selects have real values and state changes.
- Server-action forms preserve backend behavior.
- Destructive import and account actions use confirmation dialogs or explicit confirmation fields.
- Import preview search, filtering, sorting, page size, and pagination update real client state.
- Users pagination and filters update real URL-backed server queries.
- Row and detail links point to real destinations.

### Repair and consistency work

- Replace remaining plain submit buttons with the pending-aware shared button where server latency is possible.
- Ensure every async mutation announces success or failure near the action and blocks duplicate submission.
- Consolidate dialog focus restoration, Escape handling, backdrop behavior, and motion.
- Make native select fields visually consistent and keep them usable inside tables and narrow layouts.
- Give icon-only controls explicit names and a minimum 44px target where any are introduced.
- Keep destructive actions separated from routine actions and describe their exact effect.
- Do not add sort indicators or date controls unless they change real query or client state.

## Copy findings

- “Dialer CSV workflow” should become “Import agent activity.”
- “Unmapped Dialer Names” should become “Unmatched dialer names.”
- “Batch status” should become “Import status.”
- “Scoped agent metrics” should become “Agent performance in your view.”
- “Active-version operational totals” needs a user-facing explanation while preserving the active-version truth.
- Account, invitation, mapping, import, and permission enums need centralized presentation labels.
- Permissions should not display raw keys as the primary label.
- Audit targets should not lead with internal entity identifiers.
- Generic success text such as “Action completed” should name what changed.
- Technical details should remain available on demand but not dominate routine workflows.

## Responsive findings

- No page-level horizontal overflow was observed at the tested narrow viewport.
- The sidebar is not a drawer on mobile and the navigation itself overflows horizontally.
- Wide tables correctly create labeled horizontal scroll regions, but table density and column priority are not adapted for phones.
- The dashboard metric grid stacks cleanly but the oversized mobile header delays primary data.
- Import preview contains a controlled 70vh nested scroll region with many columns; it is functional but difficult to orient within.
- Touch targets are inconsistent on compact links, select fields, disclosure summaries, and table actions.

## Accessibility findings

### Existing strengths

- Skip link, focus-visible treatment, semantic landmarks, table captions, scoped headers, labels, live regions, loading states, and safe server-side authorization are present.
- Status banners include both text and a marker, so color is not the only signal.
- Destructive shared dialogs restore focus and handle Escape.

### Gaps

- The mobile navigation needs a labeled trigger, focus trap, Escape close, overlay close, and focus restoration.
- Several one-off success and error messages do not consistently use `role="status"` or `role="alert"`.
- Read-only permission names are internal codes rather than understandable accessible labels.
- Chart regions expose every data row but lack concise text summaries of the overall result.
- The simple bar-chart tracks rely heavily on color and do not expose visible scale or units.
- Repeated auth markup does not provide persistent password requirements.
- Small supporting text and muted text need contrast revalidation against the target palette.
- Loading skeletons should match destination geometry to reduce perceived layout shift.

## Shared components to extract or strengthen

- `AppShell`, grouped `Sidebar`, `MobileNavigation`, `TopBar`, and `UserMenu`
- `PageHeader`, `PageSection`, and compact section overline
- `Button`, `IconButton`, `Input`, `SearchInput`, `Select`, `Textarea`, `FileUpload`, and `Checkbox`
- `Alert`, `InlineMessage`, `LoadingIndicator`, `Skeleton`, `EmptyState`, `ErrorState`, and `ConfirmationDialog`
- `Card`, `MetricCard`, `StatusBadge`, `DataTable`, `TableToolbar`, `Pagination`, `DescriptionList`, and compact progress/chart primitives
- Shared authentication shell, password fields, and pending submit treatment
- Central presentation helpers for roles, account states, invitations, import states, mapping states, permissions, and audit labels

## Primary risks

- Converting broad server-rendered routes into client components would increase bundle size and risk server-only data leakage.
- Replacing existing forms or action names could change server-action semantics.
- New drill-down routes could accidentally broaden manager or agent scope unless they reuse `getDashboardData` and the existing authorization boundary.
- Chart rework could introduce fabricated values or misleading comparisons.
- Styling long import and administration pages without testing every lifecycle state could hide critical actions.
- A global CSS rewrite could regress the already functional loading, error, dialog, and table behavior.
- Database-backed integration tests currently share seeded state; design verification must not mistake that baseline problem for a UI regression.

## Redesign priorities

1. Preserve product truth and server boundaries.
2. Replace the shell and global tokens with the compact screenshot-aligned system.
3. Strengthen shared controls and feedback before restyling individual pages.
4. Rebuild dashboard hierarchy around decisions, not equal card weight.
5. Apply the shared system to every existing route and state.
6. Add truthful read-only performance, agent, agent-detail, and team drill-down routes only through the existing scoped data layer.
7. Humanize all visible copy at the presentation layer.
8. Validate desktop, tablet, and mobile behavior plus admin, manager, and agent visibility.
