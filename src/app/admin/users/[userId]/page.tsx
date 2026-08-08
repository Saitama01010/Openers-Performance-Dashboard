import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatAuditEvent } from "@/admin/audit-format";
import {
  forcePasswordResetAction,
  invitationAction,
  revokeSessionsAction,
  updateUserAction,
  userStatusAction,
} from "@/admin/actions";
import { getAdminUserDetails } from "@/admin/data";
import { adminErrorMessage, adminSuccessMessage } from "@/admin/messages";
import {
  OVERRIDABLE_PERMISSION_GROUPS,
  PERMISSION_PRESENTATION,
  ROLE_DEFAULT_PERMISSIONS,
} from "@/admin/policy";
import { getCurrentUser } from "@/auth/session";
import { DeleteUserDialog } from "@/components/admin/delete-user-dialog";
import { InlineDialerNameEditor } from "@/components/admin/inline-user-fields";
import { TemporaryPasswordControls } from "@/components/admin/temporary-password-controls";
import styles from "@/components/admin/users-access.module.css";
import { SubmitButton } from "@/components/dashboard/action-controls";
import { roleLabel, statusLabel } from "@/presentation/labels";

export const dynamic = "force-dynamic";

function fmt(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-US") : "Never";
}

function invitationRecordStatus(invitation: {
  deliveryStatus: string;
  expiresAt: Date;
  revokedAt: Date | null;
  usedAt: Date | null;
}) {
  if (invitation.usedAt) return "Accepted";
  if (invitation.revokedAt) return "Revoked";
  if (invitation.expiresAt.getTime() <= Date.now()) return "Expired";
  return statusLabel(invitation.deliveryStatus);
}

function resetRecordStatus(reset: {
  expiresAt: Date;
  revokedAt: Date | null;
  usedAt: Date | null;
}) {
  if (reset.usedAt) return "Used";
  if (reset.revokedAt) return "Revoked";
  if (reset.expiresAt.getTime() <= Date.now()) return "Expired";
  return "Pending";
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

  const currentDialer =
    details.mappings.find((mapping) => mapping.active && mapping.isPrimary) ??
    null;

  return (
    <section className={`dashboard-page ${styles.detailPage}`}>
      <header className={styles.detailHero}>
        <div>
          <Link className={styles.buttonGhost} href="/admin/users">← Back to users &amp; access</Link>
          <p className={styles.eyebrow}>Administration · User details</p>
          <div className={styles.detailHeroIdentity}>
            <span className={styles.detailAvatar}>{initials(details.profile.name)}</span>
            <div><h1 className={styles.title}>{details.profile.name}</h1><p className={styles.description}>{details.profile.email} · {roleLabel(details.profile.role)}</p></div>
          </div>
        </div>
        <Link className={styles.buttonSecondary} href="/admin/users">Back to users list</Link>
      </header>
      <StatusMessage
        error={query.error}
        ok={query.ok}
        warning={query.warning}
      />

      <section className={styles.panelPadded}>
        <div>
          <p className="text-sm text-muted">Read-only account details</p>
          <h1 className="text-xl font-semibold">{details.profile.name}</h1>
        </div>
        <dl className={styles.factGrid} style={{ marginTop: 16 }}>
          <Fact label="Real Name" value={details.profile.name} />
          <Fact label="Email" value={details.profile.email ?? "—"} />
          <Fact label="Role" value={roleLabel(details.profile.role)} />
          <Fact
            label="Current team"
            value={details.activeMembership?.teamName ?? "No team"}
          />
          <Fact label="Shift" value={details.profile.shift ?? "Unassigned"} />
          <Fact
            label="Account status"
            value={statusLabel(details.profile.accountStatus)}
          />
          <Fact
            label="Invitation status"
            value={statusLabel(details.invitationStatus)}
          />
          <Fact label="Last login" value={fmt(details.profile.lastLoginAt)} />
          <Fact
            label="Password state"
            value={statusLabel(details.profile.passwordState)}
          />
          <Fact
            label="Password changed"
            value={fmt(details.profile.passwordChangedAt)}
          />
          <Fact
            label="Active sessions"
            value={String(details.activeSessionCount)}
          />
          <Fact
            label="American Name"
            value={currentDialer?.sourceAgentName ?? "No primary mapping"}
          />
          <Fact label="Created" value={fmt(details.profile.createdAt)} />
          <Fact label="Updated" value={fmt(details.profile.updatedAt)} />
        </dl>
      </section>

      <section className={styles.panelPadded} id="edit-user">
        <div className={styles.sectionHeading}><div><h2 className={styles.sectionTitle}>Edit user</h2><p className={styles.sectionCopy}>Role, team, profile, and override changes are validated and audited server-side.</p></div></div>
        <form action={updateUserAction.bind(null, userId)} className={styles.createGrid}>
          <Field defaultValue={details.profile.name} label="Real name" name="name" required />
          <Field defaultValue={details.profile.email ?? ""} label="Login email" name="email" required type="email" />
          <label className={styles.field}>Role<select className={styles.control} defaultValue={details.profile.role} name="role" required><option value="agent">Agent</option><option value="manager">Team Manager</option><option value="admin">Administrator</option></select></label>
          <label className={styles.field}>Team<select className={styles.control} defaultValue={details.activeMembership?.teamId ?? ""} name="teamId"><option value="">No team</option>{details.teams.map((team) => <option disabled={!team.active} key={team.id} value={team.id}>{team.name}{team.active ? "" : " (inactive)"}</option>)}</select></label>
          <label className={styles.field}>American name<InlineDialerNameEditor dialerName={currentDialer?.sourceAgentName ?? null} userId={userId} /></label>
          <Field defaultValue={details.profile.shift ?? ""} label="Shift" name="shift" />
          <div className={styles.createOverrides} id="access"><div style={{ padding: 12 }}><h3 className={styles.sectionTitle}>Override access</h3><p className={styles.sectionCopy}>Role default, explicit override, and effective access use the existing permission model.</p></div><OverrideEditor details={details} /></div>
          <div style={{ gridColumn: "1 / -1" }}><SubmitButton pendingLabel="Saving changes">Save user and access</SubmitButton></div>
        </form>
      </section>

      <section className={styles.panelPadded} id="account-actions">
        <div className={styles.sectionHeading}><div><h2 className={styles.sectionTitle}>Account actions</h2><p className={styles.sectionCopy}>Invitation, password, and session controls preserve the current secure lifecycle.</p></div></div>
        <div className="grid gap-3 md:grid-cols-3">
          <form action={invitationAction.bind(null, userId)} className="rounded-md border border-border p-4"><input name="invitationAction" type="hidden" value="send" /><strong className="text-sm">Invitation</strong><p className="my-2 text-xs text-muted">Current state: {statusLabel(details.invitationStatus)}</p><SubmitButton pendingLabel="Sending invitation" variant="secondary">Send or resend invitation</SubmitButton></form>
          <form action={forcePasswordResetAction.bind(null, userId)} className="rounded-md border border-border p-4"><strong className="text-sm">Reset password</strong><label className="my-2 flex items-center gap-2 text-xs text-muted"><input defaultChecked name="revokeSessions" type="checkbox" /> Revoke active sessions</label><SubmitButton pendingLabel="Starting reset" variant="secondary">Start secure password reset</SubmitButton></form>
          <form action={revokeSessionsAction.bind(null, userId)} className="rounded-md border border-border p-4"><strong className="text-sm">Active sessions</strong><p className="my-2 text-xs text-muted">{details.activeSessionCount} active session(s)</p><SubmitButton pendingLabel="Revoking sessions" variant="secondary">Revoke sessions</SubmitButton></form>
        </div>
      </section>

      <section className={styles.panelPadded}>
        <h2 className="text-lg font-semibold">Temporary password</h2>
        <p className="mt-1 text-sm text-muted">
          The value remains masked until an administrator explicitly reveals
          it. Permanent passwords are never retrievable.
        </p>
        <div className="mt-4">
          <TemporaryPasswordControls
            allowRegenerate={false}
            available={
              details.profile.passwordState === "temporary" &&
              Boolean(details.profile.encryptedTemporaryPassword)
            }
            passwordCreatedAt={
              details.profile.passwordChangedAt?.toISOString() ?? null
            }
            userId={userId}
          />
        </div>
      </section>

      <section className={styles.danger} id="danger-zone">
        <h2 className="font-semibold text-danger">Danger zone</h2>
        <p className="mt-2 text-sm text-muted">Deactivation prevents sign-in while preserving business history. Permanent deletion removes authentication data and active access; historical calls, metrics, attribution, and audit records remain.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {details.profile.accountStatus === "active" ? <form action={userStatusAction.bind(null, userId)}><input name="status" type="hidden" value="deactivated" /><label className="mr-3 inline-flex items-center gap-2 text-xs"><input name="confirmStatusChange" required type="checkbox" /> I understand access will be disabled</label><SubmitButton pendingLabel="Deactivating" variant="danger">Deactivate user</SubmitButton></form> : <form action={userStatusAction.bind(null, userId)}><input name="status" type="hidden" value="active" /><SubmitButton pendingLabel="Reactivating" variant="secondary">Reactivate user</SubmitButton></form>}
          <DeleteUserDialog userId={userId} />
        </div>
      </section>

      <section className={styles.panel}>
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">
            Dialer mapping history ({details.mappings.length})
          </h2>
        </div>
        {details.mappings.length === 0 ? (
          <p className="p-5 text-sm text-muted">No dialer mappings recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-4 py-3">Dialer name</th>
                  <th className="px-4 py-3">Normalized</th>
                  <th className="px-4 py-3">Primary</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Deactivated</th>
                </tr>
              </thead>
              <tbody>
                {details.mappings.map((mapping) => (
                  <tr className="border-t border-border" key={mapping.id}>
                    <td className="px-4 py-3">{mapping.sourceAgentName}</td>
                    <td className="px-4 py-3">
                      {mapping.normalizedAgentName}
                    </td>
                    <td className="px-4 py-3">
                      {mapping.isPrimary ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3">
                      {mapping.active ? "Active" : "Inactive"}
                    </td>
                    <td className="px-4 py-3">{fmt(mapping.createdAt)}</td>
                    <td className="px-4 py-3">
                      {mapping.deactivatedAt
                        ? fmt(mapping.deactivatedAt)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className={`${styles.panel} ${styles.history}`}>
        <summary className="cursor-pointer px-4 py-3 font-semibold">
          Team membership history ({details.memberships.length})
          <span className="ml-3 text-sm font-normal text-muted">
            Current team:{" "}
            {details.activeMembership?.teamName ?? "Unassigned"}
          </span>
        </summary>
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
                  <td className="px-4 py-3">
                    {roleLabel(membership.role)}
                  </td>
                  <td className="px-4 py-3">{fmt(membership.startedAt)}</td>
                  <td className="px-4 py-3">
                    {membership.endedAt
                      ? fmt(membership.endedAt)
                      : "Still active"}
                  </td>
                  <td className="px-4 py-3">
                    {membership.active
                      ? "Current membership"
                      : "Previous membership"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className={`${styles.panel} ${styles.history}`}>
        <summary className="cursor-pointer px-4 py-3 font-semibold">
          Invitation and reset history (
          {details.invitations.length + details.passwordResets.length})
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {details.invitations.map((invitation) => (
                <tr className="border-t border-border" key={invitation.id}>
                  <td className="px-4 py-3">Invitation</td>
                  <td className="px-4 py-3">{fmt(invitation.createdAt)}</td>
                  <td className="px-4 py-3">{fmt(invitation.expiresAt)}</td>
                  <td className="px-4 py-3 capitalize">
                    {invitationRecordStatus(invitation)}
                  </td>
                </tr>
              ))}
              {details.passwordResets.map((reset) => (
                <tr className="border-t border-border" key={reset.id}>
                  <td className="px-4 py-3">Password reset</td>
                  <td className="px-4 py-3">{fmt(reset.createdAt)}</td>
                  <td className="px-4 py-3">{fmt(reset.expiresAt)}</td>
                  <td className="px-4 py-3">{resetRecordStatus(reset)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className={`${styles.panel} ${styles.history}`}>
        <summary className="cursor-pointer px-4 py-3 font-semibold">
          Audit history ({details.audits.length})
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Description</th>
              </tr>
            </thead>
            <tbody>
              {details.audits.map((audit) => {
                const formatted = formatAuditEvent(
                  audit.action,
                  audit.metadata,
                );
                const technical = formatted.technicalDetails;
                const hasTechnical =
                  technical &&
                  typeof technical === "object" &&
                  Object.keys(technical).length > 0;

                return (
                  <tr
                    className="border-t border-border align-top"
                    key={audit.id}
                  >
                    <td className="px-4 py-3">{formatted.title}</td>
                    <td className="px-4 py-3">{fmt(audit.createdAt)}</td>
                    <td className="px-4 py-3">
                      {formatted.details.length > 0 ? (
                        <ul className="list-disc pl-5">
                          {formatted.details.map((detail) => (
                            <li key={detail}>{detail}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted">
                          No additional details.
                        </span>
                      )}
                      {hasTechnical ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-muted">
                            Technical details
                          </summary>
                          <pre className="mt-2 max-w-xl overflow-auto whitespace-pre-wrap text-xs text-muted">
                            {JSON.stringify(technical, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
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
        {adminSuccessMessage(ok)}
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

function Field({
  defaultValue,
  disabled,
  label,
  name,
  required,
  type = "text",
}: {
  defaultValue: string;
  disabled?: boolean;
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className={styles.field}>
      {label}
      <input
        className={styles.control}
        defaultValue={defaultValue}
        disabled={disabled}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

function OverrideEditor({
  details,
}: {
  details: NonNullable<Awaited<ReturnType<typeof getAdminUserDetails>>>;
}) {
  const overrides = new Map(
    details.overrides.map((override) => [
      override.permissionKey,
      override.allowed ? "allow" : "deny",
    ]),
  );
  const roleDefaults = new Set(ROLE_DEFAULT_PERMISSIONS[details.profile.role]);

  return (
    <div className={styles.overrideGrid}>
      {OVERRIDABLE_PERMISSION_GROUPS.map((group) => (
        <fieldset className={styles.overrideGroup} key={group.name}>
          <legend>{group.name}</legend>
          {group.permissions.map((permission) => {
            const roleDefault = roleDefaults.has(permission);
            const override = overrides.get(permission) ?? "inherit";
            const effective =
              override === "allow"
                ? true
                : override === "deny"
                  ? false
                  : roleDefault;
            return (
              <label className={styles.overrideRow} key={permission}>
                <span>
                  <strong>{PERMISSION_PRESENTATION[permission].label}</strong>
                  <br />
                  <span className={styles.sectionCopy}>
                    Role: {roleDefault ? "Allowed" : "Denied"} · Effective:{" "}
                    {effective ? "Allowed" : "Denied"}
                  </span>
                </span>
                <select
                  className={styles.compactControl}
                  defaultValue={override}
                  name={`permission:${permission}`}
                >
                  <option value="inherit">Role default</option>
                  <option value="allow">Allow</option>
                  <option value="deny">Deny</option>
                </select>
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}
