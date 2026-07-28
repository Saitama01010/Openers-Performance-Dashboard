import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatAuditEvent } from "@/admin/audit-format";
import { getAdminUserDetails } from "@/admin/data";
import { adminErrorMessage, adminSuccessMessage } from "@/admin/messages";
import { getCurrentUser } from "@/auth/session";
import { DeleteUserDialog } from "@/components/admin/delete-user-dialog";
import { TemporaryPasswordControls } from "@/components/admin/temporary-password-controls";
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
    <section className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <Link
        className="text-sm font-medium text-primary hover:underline"
        href="/admin/users"
      >
        Back to users & access
      </Link>
      <StatusMessage
        error={query.error}
        ok={query.ok}
        warning={query.warning}
      />

      <section className="rounded-lg border border-border bg-surface p-5">
        <div>
          <p className="text-sm text-muted">Read-only account details</p>
          <h1 className="text-xl font-semibold">{details.profile.name}</h1>
        </div>
        <dl className="mt-5 grid gap-4 text-sm md:grid-cols-3 lg:grid-cols-4">
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

      <section className="rounded-lg border border-border bg-surface p-5">
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

      <section className="rounded-lg border border-danger/40 bg-danger/10 p-5">
        <h2 className="font-semibold text-danger">Permanent deletion</h2>
        <p className="mt-2 text-sm text-muted">
          Authentication data and active access will be removed. Historical
          calls, metrics, team attribution, dialer attribution, and audit
          records will remain.
        </p>
        <div className="mt-4">
          <DeleteUserDialog userId={userId} />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface">
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

      <details className="rounded-lg border border-border bg-surface">
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

      <details className="rounded-lg border border-border bg-surface">
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

      <details className="rounded-lg border border-border bg-surface">
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
