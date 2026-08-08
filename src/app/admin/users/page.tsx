import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createUserAction,
  ignoreUnknownDialerNameAction,
  mapUnknownDialerNameAction,
} from "@/admin/actions";
import {
  getAdminReferenceData,
  getAdminUserStats,
  getUnmappedDialerNames,
  listAdminUsers,
  type InvitationStatus,
} from "@/admin/data";
import { adminErrorMessage, adminSuccessMessage } from "@/admin/messages";
import {
  OVERRIDABLE_PERMISSION_GROUPS,
  PERMISSION_PRESENTATION,
} from "@/admin/policy";
import type { Role } from "@/auth/authorization";
import { getCurrentUser } from "@/auth/session";
import { AdminUserTable } from "@/components/admin/admin-user-table";
import styles from "@/components/admin/users-access.module.css";
import { UserImportWizard } from "@/components/admin/user-import-wizard";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { SubmitButton } from "@/components/dashboard/action-controls";
import { importStatusLabel } from "@/presentation/labels";

export const dynamic = "force-dynamic";

const accountStatuses = ["invited", "active", "deactivated", "revoked"] as const;
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
  return value === "admin" || value === "manager" || value === "agent" ? value : undefined;
}

function parseInvitationStatus(value?: string): InvitationStatus | undefined {
  return invitationStatuses.includes(value as InvitationStatus)
    ? (value as InvitationStatus)
    : undefined;
}

function percent(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(1)}%` : "0%";
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
  const overrideAccess =
    params.override === "with-overrides" || params.override === "role-default"
      ? params.override
      : undefined;
  const [{ users, pagination }, referenceData, unmappedNames, stats] = await Promise.all([
    listAdminUsers(actor, {
      query: params.q?.trim() || undefined,
      role: parseRole(params.role),
      teamId: params.teamId || undefined,
      accountStatus: accountStatuses.includes(params.status as (typeof accountStatuses)[number])
        ? (params.status as (typeof accountStatuses)[number])
        : undefined,
      invitationStatus: parseInvitationStatus(params.invitation),
      overrideAccess,
      page,
      pageSize: 10,
    }),
    getAdminReferenceData(actor),
    getUnmappedDialerNames(actor),
    getAdminUserStats(actor),
  ]);
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  const activeTeams = referenceData.teams
    .filter((team) => team.active)
    .map((team) => ({ id: team.id, name: team.name }));

  return (
    <section className={`dashboard-page ${styles.page}`}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Administration</p>
          <h1 className={styles.title}>Users &amp; access</h1>
          <p className={styles.description}>
            Search accounts, manage roles, teams, and override access without leaving the administration workspace.
          </p>
        </div>
        <Link className={styles.buttonSecondary} href="/admin/teams">
          <DashboardIcon name="teams" /> Manage teams
        </Link>
      </header>

      <StatusMessage error={params.error} ok={params.ok} warning={params.warning} />

      <section aria-label="User statistics" className={styles.kpis}>
        <Kpi label="Total users" value={stats.total} meta="All users" detail={`${stats.active} active accounts`} icon="users" />
        <Kpi label="Active users" value={stats.active} meta={`${percent(stats.active, stats.total)} of total`} detail={`${stats.total - stats.active} accounts are not active`} icon="permissions" />
        <Kpi label="Admins" value={stats.roles.admin.total} meta={`${percent(stats.roles.admin.total, stats.total)} of total`} detail={`${stats.roles.admin.active} active administrators`} icon="permissions" />
        <Kpi label="Managers" value={stats.roles.manager.total} meta={`${percent(stats.roles.manager.total, stats.total)} of total`} detail={`${stats.roles.manager.active} active managers`} icon="teams" />
        <Kpi label="Agents" value={stats.roles.agent.total} meta={`${percent(stats.roles.agent.total, stats.total)} of total`} detail={`${stats.roles.agent.active} active agents`} icon="agent" />
      </section>

      <section className={styles.panelPadded}>
        <div className={styles.sectionHeading}>
          <div>
            <h2 className={styles.sectionTitle}>Find accounts</h2>
            <p className={styles.sectionCopy}>Filter by identity, access state, invitation, team, or explicit override.</p>
          </div>
        </div>
        <form className={styles.filterGrid}>
          <TextField defaultValue={params.q} label="Search" name="q" placeholder="Name, email, or dialer name" />
          <FilterSelect defaultValue={params.role} label="Role" name="role" options={[["admin", "Administrator"], ["manager", "Team Manager"], ["agent", "Agent"]]} />
          <FilterSelect defaultValue={params.status} label="Status" name="status" options={accountStatuses.map((value) => [value, value])} />
          <FilterSelect defaultValue={params.invitation} label="Invitation" name="invitation" options={invitationStatuses.map((value) => [value, value])} />
          <label className={styles.field}>Team<select className={styles.control} defaultValue={params.teamId ?? ""} name="teamId"><option value="">All teams</option>{referenceData.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
          <FilterSelect defaultValue={params.override} label="Override access" name="override" options={[["with-overrides", "Has overrides"], ["role-default", "Role default only"]]} />
          <div className={styles.filterActions}>
            <button className={styles.button}>Apply filters</button>
            <Link className={styles.buttonSecondary} href="/admin/users">Clear filters</Link>
          </div>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.tableMeta}>Page {pagination.page} of {totalPages} · {pagination.total} users</div>
        {users.length === 0 ? (
          <p className={styles.drawerLoading}>No users match the current filters.</p>
        ) : (
          <AdminUserTable
            activeTeams={activeTeams}
            currentUserId={actor.id}
            users={users.map((user) => ({
              id: user.id,
              name: user.name,
              email: user.email,
              dialerAgentName: user.dialerAgentName,
              role: user.role,
              teamId: user.team?.teamId ?? null,
              teamName: user.team?.teamName ?? null,
              shift: user.shift,
              accountStatus: user.accountStatus,
              invitationStatus: user.invitationStatus,
              overrideCount: user.permissionOverrides.length,
              overrideSummary: user.permissionOverrides.map((override) => `${PERMISSION_PRESENTATION[override.permissionKey as keyof typeof PERMISSION_PRESENTATION]?.label ?? override.permissionKey}: ${override.allowed ? "Allowed" : "Denied"}`),
            }))}
          />
        )}
        <Pagination current={pagination.page} params={params} totalPages={totalPages} total={pagination.total} pageSize={pagination.pageSize} />
      </section>

      <section className={styles.panelPadded} id="create-user">
        <div className={styles.sectionHeading}>
          <div><h2 className={styles.sectionTitle}>Create user</h2><p className={styles.sectionCopy}>Create one account with authoritative role, team, dialer identity, and optional overrides.</p></div>
        </div>
        <form action={createUserAction} className={styles.createGrid}>
          <TextField label="Real name" name="name" placeholder="Enter full name" required />
          <TextField label="Login email" name="email" placeholder="Enter email address" required type="email" />
          <RoleSelect />
          <label className={styles.field}>Team<select className={styles.control} name="teamId"><option value="">Select team</option>{referenceData.teams.map((team) => <option disabled={!team.active} key={team.id} value={team.id}>{team.name}{team.active ? "" : " (inactive)"}</option>)}</select></label>
          <TextField defaultValue={params.dialerName} label="American name" name="dialerName" placeholder="Enter American name" />
          <TextField label="Shift" name="shift" placeholder="Select or enter shift" />
          <label className={styles.field} style={{ gridColumn: "1 / -1" }}>Additional dialer aliases<textarea className={styles.control} name="dialerAliases" placeholder="One alias per line" /></label>
          <details className={styles.createOverrides}><summary>Optional permission overrides</summary><PermissionOverrideControls /></details>
          <div style={{ gridColumn: "1 / -1" }}><SubmitButton pendingLabel="Creating user">Create user with temporary password</SubmitButton></div>
        </form>
      </section>

      <UserImportWizard teams={referenceData.teams} />

      <section className={styles.panel}>
        <div className={styles.sectionHeader} style={{ padding: "14px" }}><h2 className={styles.sectionTitle}>Unmatched dialer names</h2></div>
        <p className={styles.unmatchedDescription}>These dialer identities don&apos;t have a matching user account.</p>
        {unmappedNames.length === 0 ? <p className={styles.drawerLoading}>No unmapped names are present in open import previews.</p> : (
          <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Dialer name</th><th>Normalized</th><th>Affected rows</th><th>File</th><th>Import status</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>{unmappedNames.map((name) => <tr key={name.normalizedName}><td><strong>{name.dialerName}</strong></td><td>{name.normalizedName}</td><td>{name.affectedRowCount}</td><td>{name.files[0]?.fileName ?? "—"}</td><td>{name.files[0] ? importStatusLabel(name.files[0].batchStatus) : "—"}</td><td>{name.files[0] ? fmt(name.files[0].uploadedAt) : "—"}</td><td><div className={styles.actionCluster}><form action={mapUnknownDialerNameAction} className={styles.actionCluster}><input name="sourceAgentName" type="hidden" value={name.dialerName} /><select className={styles.compactControl} name="userId" required><option value="">Map to agent</option>{referenceData.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><SubmitButton pendingLabel="Saving" variant="secondary">Save</SubmitButton></form><Link className={styles.buttonGhost} href={`/admin/users?dialerName=${encodeURIComponent(name.dialerName)}#create-user`}>Create with name</Link>{name.files[0] ? <Link className={styles.buttonGhost} href={`/import?preview=${name.files[0].batchId}`}>Re-run preview</Link> : null}<form action={ignoreUnknownDialerNameAction} className={styles.actionCluster}><input name="sourceAgentName" type="hidden" value={name.dialerName} /><input className={styles.compactControl} name="reason" placeholder="Ignore reason" required /><SubmitButton pendingLabel="Ignoring" variant="danger">Ignore</SubmitButton></form></div></td></tr>)}</tbody></table></div>
        )}
      </section>
    </section>
  );
}

function Kpi({ label, value, meta, detail, icon }: { label: string; value: number; meta: string; detail: string; icon: "users" | "permissions" | "teams" | "agent" }) {
  return <article className={styles.kpi} tabIndex={0}><p className={styles.kpiLabel}>{label}</p><p className={styles.kpiValue}>{value}</p><p className={styles.kpiMeta}>{meta}</p><span className={styles.kpiIcon}><DashboardIcon name={icon} /></span><span className={styles.kpiDetails} role="tooltip">{detail}. {meta}.</span></article>;
}

function StatusMessage({ error, ok, warning }: { error?: string; ok?: string; warning?: string }) {
  const message = error ? adminErrorMessage(error) : warning === "email" ? "Invitation delivery could not be completed. Please try again." : ok ? adminSuccessMessage(ok) : null;
  if (!message) return null;
  return <p className={error || warning ? "rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" : "rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary"} role={error || warning ? "alert" : "status"}>{message}</p>;
}

function FilterSelect({ defaultValue, label, name, options }: { defaultValue?: string; label: string; name: string; options: readonly (readonly [string, string])[] }) {
  return <label className={styles.field}>{label}<select className={styles.control} defaultValue={defaultValue ?? ""} name={name}><option value="">All</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
}

function TextField({ defaultValue, label, name, placeholder, required, type = "text" }: { defaultValue?: string; label: string; name: string; placeholder?: string; required?: boolean; type?: string }) {
  return <label className={styles.field}>{label}<input className={styles.control} defaultValue={defaultValue} name={name} placeholder={placeholder} required={required} type={type} /></label>;
}

function RoleSelect() {
  return <label className={styles.field}>Role<select className={styles.control} defaultValue="agent" name="role" required><option value="agent">Agent</option><option value="manager">Team Manager</option><option value="admin">Administrator</option></select></label>;
}

function PermissionOverrideControls() {
  return <div className={styles.overrideGrid}>{OVERRIDABLE_PERMISSION_GROUPS.map((group) => <fieldset className={styles.overrideGroup} key={group.name}><legend>{group.name}</legend>{group.permissions.map((permission) => <label className={styles.overrideRow} key={permission}><span><strong>{PERMISSION_PRESENTATION[permission].label}</strong><br /><span className={styles.sectionCopy}>{PERMISSION_PRESENTATION[permission].description}</span></span><select className={styles.compactControl} defaultValue="inherit" name={`permission:${permission}`}><option value="inherit">Role default</option><option value="allow">Allow</option><option value="deny">Deny</option></select></label>)}</fieldset>)}</div>;
}

function Pagination({ current, params, totalPages, total, pageSize }: { current: number; params: Record<string, string | undefined>; totalPages: number; total: number; pageSize: number }) {
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  const pageNumbers = Array.from(new Set([1, current - 1, current, current + 1, totalPages])).filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  return <nav aria-label="User pagination" className={styles.pagination}><span>Showing {from} to {to} of {total} users</span><div className={styles.pages}>{pageNumbers.map((value, index) => <span key={value} style={{ display: "contents" }}>{index > 0 && value - pageNumbers[index - 1] > 1 ? <span aria-hidden="true">…</span> : null}<Link aria-current={value === current ? "page" : undefined} className={value === current ? styles.pageLinkActive : styles.pageLink} href={pageHref(params, value)}>{value}</Link></span>)}</div></nav>;
}

function pageHref(params: Record<string, string | undefined>, page: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value && key !== "page") search.set(key, value);
  search.set("page", String(page));
  return `/admin/users?${search.toString()}`;
}
