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
  OVERRIDABLE_PERMISSION_GROUPS,
  PERMISSION_PRESENTATION,
} from "@/admin/policy";
import type { Role } from "@/auth/authorization";
import { getCurrentUser } from "@/auth/session";
import { AdminUserTable } from "@/components/admin/admin-user-table";
import { UserImportWizard } from "@/components/admin/user-import-wizard";
import { SubmitButton } from "@/components/dashboard/action-controls";

export const dynamic = "force-dynamic";

const accountStatuses = ["invited", "active", "deactivated", "revoked"];
const invitationStatuses: InvitationStatus[] = [
  "not invited",
  "invitation sent",
  "invitation expired",
  "password created",
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
    <section className="dashboard-page space-y-6">
      <StatusMessage error={params.error} ok={params.ok} warning={params.warning} />

      <section className="rounded-lg border border-border bg-surface p-5" id="create-user">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Admin only</p>
            <h2 className="text-xl font-semibold">Users & Access</h2>
          </div>
          <Link
            className="rounded-md border border-border px-3 py-2 text-sm font-medium"
            href="/admin/teams"
          >
            Manage teams
          </Link>
        </div>

        <form className="mt-5 grid gap-3 md:grid-cols-6">
          <label className="md:col-span-2 text-sm font-medium">
            Search
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              defaultValue={params.q ?? ""}
              name="q"
              placeholder="Name, email, or dialer name"
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
          <label className="text-sm font-medium">
            Team
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
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
          <div className="flex items-end gap-2 md:col-span-6">
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Apply filters
            </button>
            <Link
              className="rounded-md border border-border px-4 py-2 text-sm font-medium"
              href="/admin/users"
            >
              Clear filters
            </Link>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">Accounts</h2>
          <p className="text-sm text-muted">
            Page {pagination.page} of {totalPages}, {pagination.total} total
          </p>
        </div>
        {users.length === 0 ? (
          <p className="p-5 text-sm text-muted">No users match the current filters.</p>
        ) : (
          <AdminUserTable
            activeTeams={referenceData.teams
              .filter((team) => team.active)
              .map((team) => ({ id: team.id, name: team.name }))}
            users={users.map((user) => ({
              id: user.id,
              name: user.name,
              email: user.email,
              dialerAgentName: user.dialerAgentName,
              role: user.role,
              teamId: user.team?.teamId ?? null,
              teamName: user.team?.teamName ?? null,
              accountStatus: user.accountStatus,
              invitationStatus: user.invitationStatus,
              lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
            }))}
          />
        )}
        <div className="flex justify-between border-t border-border px-4 py-3 text-sm">
          <PaginationLink current={page} direction="previous" params={params} totalPages={totalPages} />
          <PaginationLink current={page} direction="next" params={params} totalPages={totalPages} />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Create user</h2>
        <form action={createUserAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <TextField label="Full name" name="name" required />
          <TextField label="Login email" name="email" required type="email" />
          <label className="text-sm font-medium">
            Role
            <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" name="role" required>
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Team
            <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" name="teamId" required>
              <option value="">Select team</option>
              {referenceData.teams.map((team) => (
                <option disabled={!team.active} key={team.id} value={team.id}>
                  {team.name}{team.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>
          <TextField defaultValue={params.dialerName ?? ""} label="Dialer agent name" name="dialerName" required />
          <label className="text-sm font-medium">
            Additional dialer aliases
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-border bg-background px-3 py-2"
              name="dialerAliases"
              placeholder="One alias per line"
            />
          </label>
          <details className="md:col-span-2 rounded-md border border-border p-4">
            <summary className="cursor-pointer font-medium">Optional permission overrides</summary>
            <PermissionOverrideControls />
          </details>
          <div className="md:col-span-2">
            <SubmitButton pendingLabel="Creating user">
              Create user with temporary password
            </SubmitButton>
          </div>
        </form>
      </section>

      <UserImportWizard teams={referenceData.teams} />

      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Unmapped Dialer Names</h2>
        </div>
        {unmappedNames.length === 0 ? (
          <p className="p-5 text-sm text-muted">No unmapped names are present in open import previews.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-4 py-3">Dialer name</th>
                  <th className="px-4 py-3">Normalized</th>
                  <th className="px-4 py-3">Affected rows</th>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Batch status</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3">Actions</th>
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
                          className="min-w-48 rounded-md border border-border bg-background px-2 py-1"
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
                        className="font-medium text-primary hover:underline"
                        href={`/admin/users?dialerName=${encodeURIComponent(name.dialerName)}#create-user`}
                      >
                        Create with name
                      </Link>
                      {name.files[0] ? (
                        <Link
                          className="ml-3 font-medium text-primary hover:underline"
                          href={`/import?preview=${name.files[0].batchId}`}
                        >
                          Re-run preview
                        </Link>
                      ) : null}
                      <form action={ignoreUnknownDialerNameAction} className="mt-2 flex gap-2">
                        <input name="sourceAgentName" type="hidden" value={name.dialerName} />
                        <input
                          className="min-w-48 rounded-md border border-border bg-background px-2 py-1"
                          name="reason"
                          placeholder="Ignore reason"
                          required
                        />
                        <SubmitButton pendingLabel="Ignoring name" variant="danger">
                          Ignore
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
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
      <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
        {adminErrorMessage(error)}
      </p>
    );
  }
  if (warning === "email") {
    return (
      <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
        Invitation delivery could not be completed. Please try again.
      </p>
    );
  }
  if (ok) {
    return (
      <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
        Action completed.
      </p>
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
    <label className="text-sm font-medium">
      {label}
      <select
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
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
  defaultValue,
  label,
  name,
  required,
  type = "text",
}: {
  defaultValue?: string;
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
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
      {OVERRIDABLE_PERMISSION_GROUPS.map((group) => (
        <fieldset className="rounded-md border border-border p-3" key={group.name}>
          <legend className="px-1 text-sm font-semibold">{group.name}</legend>
          <div className="mt-2 space-y-2">
            {group.permissions.map((permission) => (
              <label className="flex items-center justify-between gap-3 text-sm" key={permission}>
                <span>
                  <span className="font-medium">
                    {PERMISSION_PRESENTATION[permission].label}
                  </span>
                  <span className="ml-2 text-muted">
                    {PERMISSION_PRESENTATION[permission].description}
                  </span>
                </span>
                <select
                  className="rounded-md border border-border bg-background px-2 py-1"
                  defaultValue="inherit"
                  name={`permission:${permission}`}
                >
                  <option value="inherit">Use role setting</option>
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
    <span className="text-muted">{direction === "previous" ? "Previous" : "Next"}</span>
  ) : (
    <Link className="font-medium text-primary hover:underline" href={`/admin/users?${search.toString()}`}>
      {direction === "previous" ? "Previous" : "Next"}
    </Link>
  );
}
