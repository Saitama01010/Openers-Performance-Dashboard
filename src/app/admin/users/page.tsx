import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createUserAction,
  ignoreUnknownDialerNameAction,
  mapUnknownDialerNameAction,
} from "@/admin/actions";
import {
  getAdminReferenceData,
  getUnmappedDialerNames,
  listAdminUsers,
  type InvitationStatus,
} from "@/admin/data";
import { adminErrorMessage } from "@/admin/messages";
import {
  PERMISSION_GROUPS,
  ROLE_DEFAULT_PERMISSIONS,
} from "@/admin/policy";
import type { Role } from "@/auth/authorization";
import { getCurrentUser } from "@/auth/session";
import {
  ConfirmSubmitButton,
  SubmitButton,
} from "@/components/dashboard/action-controls";
import {
  EmptyTableRow,
  PageHeader,
  StatusBadge,
  StatusBanner,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";

export const dynamic = "force-dynamic";

const accountStatuses = ["invited", "active", "deactivated", "revoked"];
const invitationStatuses: InvitationStatus[] = [
  "not sent",
  "pending",
  "accepted",
  "expired",
  "revoked",
  "delivery failed",
];

function fmt(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-US") : "Never";
}

function parseRole(value?: string): Role | undefined {
  return value === "admin" || value === "manager" || value === "agent"
    ? value
    : undefined;
}

function parseInvitationStatus(value?: string): InvitationStatus | undefined {
  return invitationStatuses.includes(value as InvitationStatus)
    ? (value as InvitationStatus)
    : undefined;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentUser();
  const params = await searchParams;

  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/dashboard");

  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const [{ users, teams, pagination }, referenceData, unmappedNames] =
    await Promise.all([
      listAdminUsers(actor, {
        query: params.q?.trim() || undefined,
        role: parseRole(params.role),
        teamId: params.teamId || undefined,
        accountStatus: accountStatuses.includes(params.status ?? "")
          ? (params.status as "invited" | "active" | "deactivated" | "revoked")
          : undefined,
        invitationStatus: parseInvitationStatus(params.invitation),
        page,
        pageSize: 20,
      }),
      getAdminReferenceData(actor),
      getUnmappedDialerNames(actor),
    ]);
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));

  return (
    <div className="dashboard-page">
      <PageHeader
        actions={
          <Link className="ui-button ui-button--secondary" href="/admin/teams">
            Manage teams
          </Link>
        }
        description="Search accounts, review access, invite new users, and resolve dialer identity mappings."
        eyebrow="Admin only"
        title="Users and access"
      />
      <StatusMessage error={params.error} ok={params.ok} warning={params.warning} />

      <section
        aria-labelledby="account-filters-heading"
        className="ui-card ui-card--padded"
      >
        <div className="ui-card__header">
          <div>
            <h2 className="ui-card__title" id="account-filters-heading">
              Account filters
            </h2>
            <p className="ui-card__subtitle">
              Narrow the account list without changing any records.
            </p>
          </div>
        </div>

        <form className="admin-filter-grid">
          <label className="ui-label admin-filter-grid__search">
            Search
            <input
              className="ui-input"
              defaultValue={params.q ?? ""}
              name="q"
              placeholder="Name, email, or dialer name"
              type="search"
            />
          </label>
          <FilterSelect defaultValue={params.role} label="Role" name="role" options={["admin", "manager", "agent"]} />
          <FilterSelect defaultValue={params.status} label="Status" name="status" options={accountStatuses} />
          <FilterSelect
            defaultValue={params.invitation}
            label="Invitation"
            name="invitation"
            options={invitationStatuses}
          />
          <label className="ui-label">
            Team
            <select
              className="ui-select"
              defaultValue={params.teamId ?? ""}
              name="teamId"
            >
              <option value="">All teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <div className="admin-filter-grid__actions">
            <button className="ui-button ui-button--primary">
              Apply filters
            </button>
            <Link
              className="ui-button ui-button--secondary"
              href="/admin/users"
            >
              Clear filters
            </Link>
          </div>
        </form>
      </section>

      <section aria-labelledby="accounts-heading" className="ui-card">
        <div className="ui-card__header">
          <h2 className="ui-card__title" id="accounts-heading">
            Accounts
          </h2>
          <p className="text-sm text-muted">
            Page {pagination.page} of {totalPages}, {pagination.total} total
          </p>
        </div>
        <TableScroll label="User accounts">
            <table className="ui-table">
              <caption>Dashboard user accounts and access status</caption>
              <thead>
                <tr>
                  <th scope="col">Full name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Dialer agent name</th>
                  <th scope="col">Role</th>
                  <th scope="col">Team</th>
                  <th scope="col">Account status</th>
                  <th scope="col">Invitation</th>
                  <th scope="col">Last login</th>
                  <th scope="col">Created</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr className="border-t border-border" key={user.id}>
                    <td className="px-4 py-3 font-medium">{user.name}</td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">{user.dialerAgentName ?? "-"}</td>
                    <td className="px-4 py-3 capitalize">{user.role}</td>
                    <td className="px-4 py-3">{user.team?.teamName ?? "-"}</td>
                    <td className="px-4 py-3 capitalize">
                      <StatusBadge
                        tone={
                          user.accountStatus === "active"
                            ? "success"
                            : user.accountStatus === "deactivated" ||
                                user.accountStatus === "revoked"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {user.accountStatus}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <StatusBadge
                        tone={
                          user.invitationStatus === "accepted"
                            ? "success"
                            : user.invitationStatus === "delivery failed" ||
                                user.invitationStatus === "expired"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {user.invitationStatus}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">{fmt(user.lastLoginAt)}</td>
                    <td className="px-4 py-3">{fmt(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link
                        className="ui-link"
                        href={`/admin/users/${user.id}`}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
                {users.length === 0 ? (
                  <EmptyTableRow
                    colSpan={10}
                    description="Clear or adjust the current filters to see more accounts."
                    title="No matching users"
                  />
                ) : null}
              </tbody>
            </table>
        </TableScroll>
        <div className="pagination">
          <PaginationLink current={page} direction="previous" params={params} totalPages={totalPages} />
          <PaginationLink current={page} direction="next" params={params} totalPages={totalPages} />
        </div>
      </section>

      <section
        aria-labelledby="create-user-heading"
        className="ui-card ui-card--padded"
        id="create-user"
      >
        <h2 className="ui-card__title" id="create-user-heading">
          Create user
        </h2>
        <form action={createUserAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <TextField autoComplete="name" label="Full name" name="name" required />
          <TextField autoComplete="email" label="Login email" name="email" required type="email" />
          <label className="ui-label">
            Role
            <select className="ui-select" name="role" required>
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="ui-label">
            Team
            <select className="ui-select" name="teamId">
              <option value="">No team</option>
              {referenceData.teams.map((team) => (
                <option disabled={!team.active} key={team.id} value={team.id}>
                  {team.name}{team.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>
          <TextField defaultValue={params.dialerName ?? ""} label="Dialer agent name" name="dialerName" />
          <label className="ui-label">
            Additional dialer aliases
            <textarea
              className="ui-textarea"
              name="dialerAliases"
              placeholder="One alias per line"
            />
          </label>
          <label className="ui-checkbox-label md:col-span-2">
            <input name="sendInvitation" type="checkbox" defaultChecked />
            Send invitation immediately
          </label>
          <details className="ui-details md:col-span-2">
            <summary>Optional permission overrides</summary>
            <PermissionOverrideControls />
          </details>
          <div className="md:col-span-2">
            <SubmitButton pendingLabel="Creating invited user">
              Create invited user
            </SubmitButton>
          </div>
        </form>
      </section>

      <section aria-labelledby="unmapped-heading" className="ui-card">
        <div className="ui-card__header">
          <div>
            <h2 className="ui-card__title" id="unmapped-heading">
              Unmapped dialer names
            </h2>
            <p className="ui-card__subtitle">
              Resolve identities from open import previews.
            </p>
          </div>
        </div>
        <TableScroll label="Unmapped dialer names">
            <table className="ui-table">
              <caption>Dialer identities awaiting an admin decision</caption>
              <thead>
                <tr>
                  <th scope="col">Dialer name</th>
                  <th scope="col">Normalized</th>
                  <th scope="col">Affected rows</th>
                  <th scope="col">File</th>
                  <th scope="col">Batch status</th>
                  <th scope="col">Uploaded</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {unmappedNames.map((name) => (
                  <tr className="border-t border-border" key={name.normalizedName}>
                    <td className="px-4 py-3 font-medium">{name.dialerName}</td>
                    <td className="px-4 py-3">{name.normalizedName}</td>
                    <td className="px-4 py-3">{name.affectedRowCount}</td>
                    <td className="px-4 py-3">{name.files[0]?.fileName ?? "-"}</td>
                    <td className="px-4 py-3">
                      {name.files[0]?.batchStatus.replaceAll("_", " ") ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      {name.files[0] ? fmt(name.files[0].uploadedAt) : "-"}
                    </td>
                    <td className="px-4 py-3 min-w-96">
                      <form action={mapUnknownDialerNameAction} className="mb-2 flex gap-2">
                        <input name="sourceAgentName" type="hidden" value={name.dialerName} />
                        <select
                          aria-label={`Map ${name.dialerName} to dashboard user`}
                          className="ui-select min-w-48"
                          name="userId"
                          required
                        >
                          <option value="">Map to agent</option>
                          {referenceData.agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name}
                            </option>
                          ))}
                        </select>
                        <SubmitButton pendingLabel="Saving mapping" variant="secondary">
                          Save
                        </SubmitButton>
                      </form>
                      <Link
                        className="ui-link"
                        href={`/admin/users?dialerName=${encodeURIComponent(name.dialerName)}#create-user`}
                      >
                        Create with name
                      </Link>
                      {name.files[0] ? (
                        <Link
                          className="ml-3 ui-link"
                          href={`/import?preview=${name.files[0].batchId}`}
                        >
                          Re-run preview
                        </Link>
                      ) : null}
                      <form action={ignoreUnknownDialerNameAction} className="mt-2 flex gap-2">
                        <input name="sourceAgentName" type="hidden" value={name.dialerName} />
                        <input
                          aria-label={`Reason for ignoring ${name.dialerName}`}
                          className="ui-input min-w-48"
                          name="reason"
                          placeholder="Ignore reason"
                          required
                        />
                        <ConfirmSubmitButton
                          confirmLabel="Ignore name"
                          description={`Future rows for ${name.dialerName} will remain unmapped until an admin creates or changes a mapping.`}
                          pendingLabel="Ignoring dialer name"
                          title="Ignore this dialer name?"
                        >
                          Ignore
                        </ConfirmSubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
                {unmappedNames.length === 0 ? (
                  <EmptyTableRow
                    colSpan={7}
                    description="New unresolved identities will appear here after a preview."
                    title="No unmapped names"
                  />
                ) : null}
              </tbody>
            </table>
        </TableScroll>
      </section>
    </div>
  );
}

function StatusMessage({
  error,
  ok,
  warning,
}: {
  error?: string;
  ok?: string;
  warning?: string;
}) {
  if (error) {
    return (
      <StatusBanner tone="danger">
        {adminErrorMessage(error)}
      </StatusBanner>
    );
  }
  if (warning === "email") {
    return (
      <StatusBanner tone="warning">
        Invitation delivery could not be completed. Please try again.
      </StatusBanner>
    );
  }
  if (ok) {
    return (
      <StatusBanner tone="success">Action completed.</StatusBanner>
    );
  }
  return null;
}

function FilterSelect({
  defaultValue,
  label,
  name,
  options,
}: {
  defaultValue?: string;
  label: string;
  name: string;
  options: readonly string[];
}) {
  return (
    <label className="ui-label">
      {label}
      <select
        className="ui-select"
        defaultValue={defaultValue ?? ""}
        name={name}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  autoComplete,
  defaultValue,
  label,
  name,
  required,
  type = "text",
}: {
  autoComplete?: string;
  defaultValue?: string;
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="ui-label">
      {label}{" "}
      {required ? <span className="ui-required">(required)</span> : null}
      <input
        autoComplete={autoComplete}
        className="ui-input"
        defaultValue={defaultValue}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

function PermissionOverrideControls() {
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {PERMISSION_GROUPS.map((group) => (
        <fieldset className="ui-fieldset" key={group.name}>
          <legend className="px-1 text-sm font-semibold">{group.name}</legend>
          <div className="mt-2 space-y-2">
            {group.permissions.map((permission) => (
              <label className="flex items-center justify-between gap-3 text-sm" key={permission}>
                <span>
                  {permission}
                  <span className="ml-2 text-muted">
                    default {ROLE_DEFAULT_PERMISSIONS.agent.includes(permission) ? "agent" : "role"}
                  </span>
                </span>
                <select
                  aria-label={`${permission} override`}
                  className="ui-select"
                  defaultValue="inherit"
                  name={`permission:${permission}`}
                >
                  <option value="inherit">Inherit</option>
                  <option value="allow">Allow</option>
                  <option value="deny">Deny</option>
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function PaginationLink({
  current,
  direction,
  params,
  totalPages,
}: {
  current: number;
  direction: "previous" | "next";
  params: Record<string, string | undefined>;
  totalPages: number;
}) {
  const nextPage = direction === "previous" ? current - 1 : current + 1;
  const disabled = nextPage < 1 || nextPage > totalPages;
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") search.set(key, value);
  }
  search.set("page", String(nextPage));

  return disabled ? (
    <span aria-disabled="true" className="ui-button ui-button--secondary pagination__disabled">
      {direction === "previous" ? "Previous" : "Next"}
    </span>
  ) : (
    <Link className="ui-button ui-button--secondary" href={`/admin/users?${search.toString()}`}>
      {direction === "previous" ? "Previous" : "Next"}
    </Link>
  );
}
