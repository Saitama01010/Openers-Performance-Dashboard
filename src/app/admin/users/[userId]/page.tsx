import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  addDialerMappingAction,
  deactivateDialerMappingAction,
  editDialerMappingAction,
  forcePasswordResetAction,
  invitationAction,
  revokeSessionsAction,
  setPrimaryDialerMappingAction,
  updateUserAction,
  userStatusAction,
} from "@/admin/actions";
import { getAdminUserDetails } from "@/admin/data";
import { adminErrorMessage } from "@/admin/messages";
import {
  PERMISSION_GROUPS,
  ROLE_DEFAULT_PERMISSIONS,
} from "@/admin/policy";
import { getCurrentUser } from "@/auth/session";

export const dynamic = "force-dynamic";

function fmt(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-US") : "Never";
}

function jsonPreview(value: unknown) {
  if (!value) return "-";
  return JSON.stringify(value).slice(0, 260);
}

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ ok?: string; error?: string; warning?: string }>;
}) {
  const actor = await getCurrentUser();
  const { userId } = await params;
  const query = await searchParams;

  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/dashboard");

  const details = await getAdminUserDetails(actor, userId);

  if (!details) notFound();

  const updateAction = updateUserAction.bind(null, userId);
  const statusAction = userStatusAction.bind(null, userId);
  const inviteAction = invitationAction.bind(null, userId);
  const resetAction = forcePasswordResetAction.bind(null, userId);
  const sessionsAction = revokeSessionsAction.bind(null, userId);
  const addMappingAction = addDialerMappingAction.bind(null, userId);
  const editMappingAction = editDialerMappingAction.bind(null, userId);
  const deactivateMappingAction = deactivateDialerMappingAction.bind(null, userId);
  const primaryMappingAction = setPrimaryDialerMappingAction.bind(null, userId);
  const overrides = new Map(
    details.overrides.map((override) => [override.permissionKey, override.allowed]),
  );
  const roleDefaults = new Set(ROLE_DEFAULT_PERMISSIONS[details.profile.role]);

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <Link className="text-sm font-medium text-primary hover:underline" href="/admin/users">
        Back to Users & Access
      </Link>
      <StatusMessage error={query.error} ok={query.ok} warning={query.warning} />

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Account details</p>
            <h2 className="text-xl font-semibold">{details.profile.name}</h2>
          </div>
          <div className="text-right text-sm text-muted">
            <p>{details.profile.email}</p>
            <p className="capitalize">{details.profile.accountStatus}</p>
          </div>
        </div>
        <dl className="mt-5 grid gap-4 text-sm md:grid-cols-4">
          <Fact label="Role" value={details.profile.role} />
          <Fact label="Team" value={details.activeMembership?.teamName ?? "-"} />
          <Fact label="Invitation" value={details.invitationStatus} />
          <Fact label="Last login" value={fmt(details.profile.lastLoginAt)} />
          <Fact label="Password changed" value={fmt(details.profile.passwordChangedAt)} />
          <Fact label="Active sessions" value={String(details.activeSessionCount)} />
          <Fact label="Created" value={fmt(details.profile.createdAt)} />
          <Fact label="Updated" value={fmt(details.profile.updatedAt)} />
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Edit user</h2>
        <form action={updateAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <TextField defaultValue={details.profile.name} label="Full name" name="name" required />
          <TextField defaultValue={details.profile.email} label="Login email" name="email" required type="email" />
          <label className="text-sm font-medium">
            Role
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              defaultValue={details.profile.role}
              name="role"
            >
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Team
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              defaultValue={details.activeMembership?.teamId ?? ""}
              name="teamId"
            >
              <option value="">No team</option>
              {details.teams.map((team) => (
                <option disabled={!team.active} key={team.id} value={team.id}>
                  {team.name}{team.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            Role demotion, team movement, and permission changes are audited. The final active admin cannot be demoted.
          </div>
          <section className="md:col-span-2">
            <h3 className="font-semibold">Permission overrides</h3>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              {PERMISSION_GROUPS.map((group) => (
                <fieldset className="rounded-md border border-border p-3" key={group.name}>
                  <legend className="px-1 text-sm font-semibold">{group.name}</legend>
                  <div className="mt-2 space-y-2">
                    {group.permissions.map((permission) => {
                      const override = overrides.get(permission);
                      const roleDefault = roleDefaults.has(permission);
                      const effective = override ?? roleDefault;

                      return (
                        <label className="grid grid-cols-[1fr_auto] gap-3 text-sm" key={permission}>
                          <span>
                            <span className="font-medium">{permission}</span>
                            <span className="ml-2 text-muted">
                              default {roleDefault ? "allow" : "deny"} · effective {effective ? "allow" : "deny"}
                            </span>
                          </span>
                          <select
                            className="rounded-md border border-border bg-background px-2 py-1"
                            defaultValue={
                              override === undefined ? "inherit" : override ? "allow" : "deny"
                            }
                            name={`permission:${permission}`}
                          >
                            <option value="inherit">Inherit</option>
                            <option value="allow">Allow</option>
                            <option value="deny">Deny</option>
                          </select>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>
          <div className="md:col-span-2">
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Save user changes
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <ActionPanel title="Account status">
          <form action={statusAction} className="space-y-3">
            <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" name="status">
              <option value="active">Activate</option>
              <option value="deactivated">Deactivate</option>
              <option value="revoked">Revoke access</option>
            </select>
            <p className="text-sm text-danger">
              Deactivation and revocation immediately stop existing sessions. Revocation also revokes outstanding invitations and reset tokens.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input name="confirmStatusChange" type="checkbox" />
              I understand this account access change.
            </label>
            <button className="rounded-md bg-danger px-3 py-2 text-sm font-semibold text-white">
              Apply status change
            </button>
          </form>
        </ActionPanel>

        <ActionPanel title="Invitation">
          <form action={inviteAction} className="space-y-3">
            <button className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground" name="invitationAction" value="send">
              Send or resend invitation
            </button>
            <button className="rounded-md border border-danger px-3 py-2 text-sm font-semibold text-danger" name="invitationAction" value="revoke">
              Revoke invitation
            </button>
          </form>
        </ActionPanel>

        <ActionPanel title="Password and sessions">
          <form action={resetAction} className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input name="revokeSessions" type="checkbox" defaultChecked />
              Revoke sessions immediately
            </label>
            <button className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
              Force password reset
            </button>
          </form>
          <form action={sessionsAction} className="mt-4 space-y-3 border-t border-border pt-4">
            <label className="flex items-center gap-2 text-sm">
              <input name="includeCurrentSession" type="checkbox" />
              Include my current session when this is my account
            </label>
            <button className="rounded-md border border-danger px-3 py-2 text-sm font-semibold text-danger">
              Revoke all sessions
            </button>
          </form>
        </ActionPanel>
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Dialer mappings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-3">Dialer name</th>
                <th className="px-4 py-3">Normalized</th>
                <th className="px-4 py-3">Primary</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {details.mappings.map((mapping) => (
                <tr className="border-t border-border" key={mapping.id}>
                  <td className="px-4 py-3">{mapping.sourceAgentName}</td>
                  <td className="px-4 py-3">{mapping.normalizedAgentName}</td>
                  <td className="px-4 py-3">{mapping.isPrimary ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">{mapping.active ? "Active" : "Inactive"}</td>
                  <td className="px-4 py-3">{fmt(mapping.createdAt)}</td>
                  <td className="px-4 py-3">
                    {mapping.active ? (
                      <div className="flex flex-wrap gap-2">
                        {!mapping.isPrimary ? (
                          <form action={primaryMappingAction}>
                            <input name="mappingId" type="hidden" value={mapping.id} />
                            <button className="text-primary hover:underline">Make primary</button>
                          </form>
                        ) : null}
                        <details>
                          <summary className="cursor-pointer text-primary hover:underline">
                            Edit
                          </summary>
                          <form action={editMappingAction} className="mt-2 flex min-w-64 flex-col gap-2 rounded-md border border-border bg-background p-3">
                            <input name="mappingId" type="hidden" value={mapping.id} />
                            <label className="text-xs font-medium text-muted">
                              Dialer display name
                              <input
                                className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
                                defaultValue={mapping.sourceAgentName}
                                name="sourceAgentName"
                                required
                              />
                            </label>
                            <p className="text-xs text-muted">
                              Normalized currently: {mapping.normalizedAgentName}
                            </p>
                            <div className="flex gap-3">
                              <button className="text-primary hover:underline">
                                Save
                              </button>
                              <Link className="text-muted hover:underline" href={`/admin/users/${userId}`}>
                                Cancel
                              </Link>
                            </div>
                          </form>
                        </details>
                        <form action={deactivateMappingAction}>
                          <input name="mappingId" type="hidden" value={mapping.id} />
                          <button className="text-danger hover:underline">Deactivate</button>
                        </form>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={addMappingAction} className="grid gap-3 border-t border-border p-4 md:grid-cols-[1fr_auto_auto]">
          <TextField label="New dialer name" name="sourceAgentName" required />
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input name="makePrimary" type="checkbox" />
            Make primary
          </label>
          <button className="self-end rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Add mapping
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Team membership history</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Ended</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {details.memberships.map((membership) => (
                <tr className="border-t border-border" key={membership.id}>
                  <td className="px-4 py-3">{membership.teamName}</td>
                  <td className="px-4 py-3">{membership.role}</td>
                  <td className="px-4 py-3">{fmt(membership.startedAt)}</td>
                  <td className="px-4 py-3">{fmt(membership.endedAt)}</td>
                  <td className="px-4 py-3">{membership.active ? "Active" : "Historical"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Audit history</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {details.audits.map((audit) => (
                <tr className="border-t border-border" key={audit.id}>
                  <td className="px-4 py-3">{audit.action}</td>
                  <td className="px-4 py-3">{fmt(audit.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{jsonPreview(audit.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
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

function ActionPanel({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
