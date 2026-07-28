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
    <div className="dashboard-page">
      <PageHeader
        actions={
          <Link className="ui-button ui-button--secondary" href="/admin/users">
            Back to users
          </Link>
        }
        description="Review identity, permissions, account state, team history, and dialer mappings."
        eyebrow="Account details"
        title={details.profile.name}
      />
      <StatusMessage error={query.error} ok={query.ok} warning={query.warning} />

      <section aria-labelledby="account-summary-heading" className="ui-card ui-card--padded">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="ui-card__title" id="account-summary-heading">
              Account summary
            </h2>
            <p className="ui-card__subtitle">{details.profile.email}</p>
          </div>
          <StatusBadge
            tone={details.profile.accountStatus === "active" ? "success" : "danger"}
          >
            {details.profile.accountStatus}
          </StatusBadge>
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

      <section aria-labelledby="edit-user-heading" className="ui-card ui-card--padded">
        <h2 className="ui-card__title" id="edit-user-heading">
          Edit user
        </h2>
        <form action={updateAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <TextField autoComplete="name" defaultValue={details.profile.name} label="Full name" name="name" required />
          <TextField autoComplete="email" defaultValue={details.profile.email} label="Login email" name="email" required type="email" />
          <label className="ui-label">
            Role
            <select
              className="ui-select"
              defaultValue={details.profile.role}
              name="role"
            >
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="ui-label">
            Team
            <select
              className="ui-select"
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
          <div className="md:col-span-2">
            <StatusBanner tone="warning">
              Role demotion, team movement, and permission changes are audited. The final active admin cannot be demoted.
            </StatusBanner>
          </div>
          <section className="md:col-span-2">
            <h3 className="font-semibold">Permission overrides</h3>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              {PERMISSION_GROUPS.map((group) => (
                <fieldset className="ui-fieldset" key={group.name}>
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
                              default {roleDefault ? "allow" : "deny"}; effective {effective ? "allow" : "deny"}
                            </span>
                          </span>
                          <select
                            aria-label={`${permission} override`}
                            className="ui-select"
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
            <SubmitButton pendingLabel="Saving user changes">
              Save user changes
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="admin-action-grid admin-action-grid--three">
        <ActionPanel title="Account status">
          <form action={statusAction} className="space-y-3">
            <label className="ui-label">
              New account status
              <select className="ui-select" name="status">
                <option value="active">Activate</option>
                <option value="deactivated">Deactivate</option>
                <option value="revoked">Revoke access</option>
              </select>
            </label>
            <StatusBanner tone="warning">
              Deactivation and revocation immediately stop existing sessions. Revocation also revokes outstanding invitations and reset tokens.
            </StatusBanner>
            <input name="confirmStatusChange" type="hidden" value="true" />
            <ConfirmSubmitButton
              confirmLabel="Apply status change"
              description="This may immediately end sessions and remove account access. Review the selected status before continuing."
              pendingLabel="Applying account status"
              title="Change this account status?"
            >
              Apply status change
            </ConfirmSubmitButton>
          </form>
        </ActionPanel>

        <ActionPanel title="Invitation">
          <form action={inviteAction} className="space-y-3">
            <SubmitButton
              name="invitationAction"
              pendingLabel="Sending invitation"
              value="send"
            >
              Send or resend invitation
            </SubmitButton>
            <ConfirmSubmitButton
              confirmLabel="Revoke invitation"
              description="The outstanding invitation link will stop working immediately."
              name="invitationAction"
              pendingLabel="Revoking invitation"
              title="Revoke this invitation?"
              value="revoke"
            >
              Revoke invitation
            </ConfirmSubmitButton>
          </form>
        </ActionPanel>

        <ActionPanel title="Password and sessions">
          <form action={resetAction} className="space-y-3">
            <label className="ui-checkbox-label">
              <input name="revokeSessions" type="checkbox" defaultChecked />
              Revoke sessions immediately
            </label>
            <ConfirmSubmitButton
              confirmLabel="Force reset"
              description="The user will be required to create a new password. Selected active sessions will be revoked."
              pendingLabel="Forcing password reset"
              title="Force a password reset?"
              variant="primary"
            >
              Force password reset
            </ConfirmSubmitButton>
          </form>
          <form action={sessionsAction} className="mt-4 space-y-3 border-t border-border pt-4">
            <label className="ui-checkbox-label">
              <input name="includeCurrentSession" type="checkbox" />
              Include my current session when this is my account
            </label>
            <ConfirmSubmitButton
              confirmLabel="Revoke sessions"
              description="All selected sessions for this account will be ended immediately."
              pendingLabel="Revoking sessions"
              title="Revoke all sessions?"
            >
              Revoke all sessions
            </ConfirmSubmitButton>
          </form>
        </ActionPanel>
      </section>

      <section aria-labelledby="dialer-mappings-heading" className="ui-card">
        <div className="ui-card__header">
          <h2 className="ui-card__title" id="dialer-mappings-heading">
            Dialer mappings
          </h2>
        </div>
        <TableScroll label="Dialer mappings">
          <table className="ui-table">
            <caption>Dialer identity mappings for this user</caption>
            <thead>
              <tr>
                <th scope="col">Dialer name</th>
                <th scope="col">Normalized</th>
                <th scope="col">Primary</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {details.mappings.map((mapping) => (
                <tr className="border-t border-border" key={mapping.id}>
                  <td className="px-4 py-3">{mapping.sourceAgentName}</td>
                  <td className="px-4 py-3">{mapping.normalizedAgentName}</td>
                  <td className="px-4 py-3">
                    {mapping.isPrimary ? (
                      <StatusBadge tone="info">Primary</StatusBadge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={mapping.active ? "success" : "neutral"}>
                      {mapping.active ? "Active" : "Inactive"}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3">{fmt(mapping.createdAt)}</td>
                  <td className="px-4 py-3">
                    {mapping.active ? (
                      <div className="flex flex-wrap gap-2">
                        {!mapping.isPrimary ? (
                          <form action={primaryMappingAction}>
                            <input name="mappingId" type="hidden" value={mapping.id} />
                            <SubmitButton pendingLabel="Setting primary" variant="secondary">
                              Make primary
                            </SubmitButton>
                          </form>
                        ) : null}
                        <details className="ui-details ui-details--compact">
                          <summary>
                            Edit
                          </summary>
                          <form action={editMappingAction} className="mt-2 flex min-w-64 flex-col gap-2 rounded-md border border-border bg-background p-3">
                            <input name="mappingId" type="hidden" value={mapping.id} />
                            <label className="ui-label">
                              Dialer display name
                              <input
                                className="ui-input"
                                defaultValue={mapping.sourceAgentName}
                                name="sourceAgentName"
                                required
                              />
                            </label>
                            <p className="text-xs text-muted">
                              Normalized currently: {mapping.normalizedAgentName}
                            </p>
                            <div className="flex gap-3">
                              <SubmitButton pendingLabel="Saving mapping" variant="secondary">
                                Save
                              </SubmitButton>
                              <Link className="ui-link" href={`/admin/users/${userId}`}>
                                Cancel
                              </Link>
                            </div>
                          </form>
                        </details>
                        <form action={deactivateMappingAction}>
                          <input name="mappingId" type="hidden" value={mapping.id} />
                          <ConfirmSubmitButton
                            confirmLabel="Deactivate mapping"
                            description={`${mapping.sourceAgentName} will stop resolving to this account for future previews.`}
                            pendingLabel="Deactivating mapping"
                            title="Deactivate this mapping?"
                          >
                            Deactivate
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
              {details.mappings.length === 0 ? (
                <EmptyTableRow
                  colSpan={6}
                  description="Add a dialer name to match future import rows to this user."
                  title="No dialer mappings"
                />
              ) : null}
            </tbody>
          </table>
        </TableScroll>
        <form action={addMappingAction} className="grid gap-3 border-t border-border p-4 md:grid-cols-[1fr_auto_auto]">
          <TextField label="New dialer name" name="sourceAgentName" required />
          <label className="ui-checkbox-label self-center">
            <input name="makePrimary" type="checkbox" />
            Make primary
          </label>
          <SubmitButton className="self-end" pendingLabel="Adding mapping">
            Add mapping
          </SubmitButton>
        </form>
      </section>

      <section aria-labelledby="membership-history-heading" className="ui-card">
        <div className="ui-card__header">
          <h2 className="ui-card__title" id="membership-history-heading">
            Team membership history
          </h2>
        </div>
        <TableScroll label="Team membership history">
          <table className="ui-table">
            <caption>Historical team memberships for this user</caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">Role</th>
                <th scope="col">Started</th>
                <th scope="col">Ended</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {details.memberships.map((membership) => (
                <tr className="border-t border-border" key={membership.id}>
                  <td className="px-4 py-3">{membership.teamName}</td>
                  <td className="px-4 py-3">{membership.role}</td>
                  <td className="px-4 py-3">{fmt(membership.startedAt)}</td>
                  <td className="px-4 py-3">{fmt(membership.endedAt)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={membership.active ? "success" : "neutral"}>
                      {membership.active ? "Active" : "Historical"}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
              {details.memberships.length === 0 ? (
                <EmptyTableRow
                  colSpan={5}
                  description="Team assignments will be recorded here."
                  title="No membership history"
                />
              ) : null}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <section aria-labelledby="user-audit-heading" className="ui-card">
        <div className="ui-card__header">
          <h2 className="ui-card__title" id="user-audit-heading">
            Audit history
          </h2>
        </div>
        <TableScroll label="User audit history">
          <table className="ui-table">
            <caption>Administrative events for this user</caption>
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">When</th>
                <th scope="col">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {details.audits.map((audit) => (
                <tr className="border-t border-border" key={audit.id}>
                  <td className="px-4 py-3">{audit.action}</td>
                  <td className="px-4 py-3">{fmt(audit.createdAt)}</td>
                  <td className="audit-metadata">{jsonPreview(audit.metadata)}</td>
                </tr>
              ))}
              {details.audits.length === 0 ? (
                <EmptyTableRow
                  colSpan={3}
                  description="Audited changes to this account will appear here."
                  title="No audit history"
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
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

function ActionPanel({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="ui-card ui-card--padded">
      <h2 className="ui-card__title">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
