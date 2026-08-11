"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { toggleAllUserSelection, toggleUserSelection } from "@/admin/user-selection";
import { PERMISSION_PRESENTATION } from "@/admin/policy";
import { InlineShiftEditor, InlineTeamSelect, type InlineTeamOption } from "@/components/admin/inline-user-fields";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { Badge, BadgeDot } from "@/components/ui/base-badge";
import { roleLabel, statusLabel } from "@/presentation/labels";
import styles from "./users-access.module.css";

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  dialerAgentName: string | null;
  role: "admin" | "manager" | "agent";
  teamId: string | null;
  teamName: string | null;
  shift: string | null;
  accountStatus: string;
  invitationStatus: string;
  overrideCount: number;
  overrideSummary: string[];
};

type PreviewPayload = {
  user: {
    id: string;
    name: string;
    email: string | null;
    role: string;
    shift: string | null;
    accountStatus: string;
    passwordState: string;
    createdAt: string;
    updatedAt: string;
    lastLoginAt: string | null;
    americanName: string | null;
    team: string | null;
    invitationStatus: string;
    activeSessionCount: number;
  };
  overrides: { permissionKey: string; allowed: boolean }[];
  activity: { id: string; action: string; createdAt: string }[];
};

type InvitationResult = {
  selected: number;
  sent: number;
  skipped: number;
  failed: number;
  outcomes: { userId: string; status: string; reason?: string }[];
};

export function AdminUserTable({ activeTeams, currentUserId, users }: { activeTeams: InlineTeamOption[]; currentUserId: string; users: UserRow[] }) {
  const router = useRouter();
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState(users);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<"invite" | "delete" | "role" | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [invitationResult, setInvitationResult] = useState<InvitationResult | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const selectableIds = useMemo(() => rows.filter((user) => user.id !== currentUserId).map((user) => user.id), [currentUserId, rows]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((userId) => selected.has(userId));
  const someSelected = selected.size > 0 && !allSelected;
  const busy = busyAction !== null;

  async function openPreview(userId: string) {
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    previewDialog.current?.showModal();
    try {
      const response = await fetch(`/api/admin/users/${userId}`, { cache: "no-store" });
      const payload = (await response.json()) as PreviewPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "User details could not be loaded.");
      setPreview(payload);
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : "User details could not be loaded.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function changeRole(user: UserRow, nextRole: UserRow["role"]) {
    if (nextRole === user.role) return;
    if ((user.role === "admin" || nextRole === "admin") && !window.confirm(`Change ${user.name} from ${roleLabel(user.role)} to ${roleLabel(nextRole)}? This changes their effective authorization immediately.`)) return;
    setBusyAction("role");
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "role", value: nextRole }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Role update failed.");
      setRows((current) => current.map((row) => row.id === user.id ? { ...row, role: nextRole, teamId: nextRole === "admin" ? null : row.teamId, teamName: nextRole === "admin" ? null : row.teamName } : row));
      setFeedback({ tone: "success", message: `${user.name} is now ${roleLabel(nextRole)}. Effective access has been refreshed.` });
      router.refresh();
    } catch (cause) {
      setFeedback({ tone: "error", message: cause instanceof Error ? cause.message : "Role update failed." });
    } finally {
      setBusyAction(null);
    }
  }

  async function sendInvitations() {
    setBusyAction("invite"); setInvitationResult(null); setFeedback(null);
    try {
      const response = await fetch("/api/admin/users/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: Array.from(selected) }) });
      const payload = (await response.json()) as InvitationResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Invitations failed.");
      setInvitationResult(payload);
    } catch (cause) {
      setFeedback({ tone: "error", message: cause instanceof Error ? cause.message : "Invitations failed." });
    } finally { setBusyAction(null); }
  }

  async function deleteSelectedUsers() {
    if (busy || selected.size === 0) return;
    setBusyAction("delete"); setFeedback(null);
    try {
      const response = await fetch("/api/admin/users/bulk-delete", { method: "DELETE", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: Array.from(selected) }) });
      const payload = (await response.json()) as { deletedIds?: string[]; error?: string };
      if (!response.ok || !payload.deletedIds) throw new Error(payload.error ?? "User deletion failed.");
      const deleted = new Set(payload.deletedIds);
      setRows((current) => current.filter((user) => !deleted.has(user.id)));
      setSelected(new Set());
      setFeedback({ tone: "success", message: `${deleted.size} ${deleted.size === 1 ? "user was" : "users were"} permanently deleted.` });
      deleteDialog.current?.close();
      router.refresh();
    } catch (cause) {
      setFeedback({ tone: "error", message: cause instanceof Error ? cause.message : "User deletion failed." });
    } finally { setBusyAction(null); }
  }

  return (
    <>
      <div className={styles.bulkBar}>
        <span aria-live="polite"><strong>{selected.size}</strong> selected</span>
        <button className={styles.buttonSecondary} disabled={selected.size === 0 || busy} onClick={sendInvitations} type="button">{busyAction === "invite" ? "Sending…" : "Send invitations"}</button>
        <button className={styles.buttonDanger} disabled={selected.size === 0 || busy} onClick={() => deleteDialog.current?.showModal()} type="button">Delete selected</button>
        <span>The signed-in administrator is protected from selection.</span>
      </div>
      {feedback ? <div className={feedback.tone === "error" ? "border-b border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" : "border-b border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary"} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.message}</div> : null}
      {invitationResult ? <div className="border-b border-border bg-background/50 px-4 py-3 text-sm" role={invitationResult.failed ? "alert" : "status"}>Selected {invitationResult.selected} · Sent {invitationResult.sent} · Skipped {invitationResult.skipped} · Failed {invitationResult.failed}</div> : null}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th scope="col"><input aria-label="Select all users on this page" checked={allSelected} ref={(element) => { if (element) element.indeterminate = someSelected; }} onChange={() => setSelected((current) => toggleAllUserSelection(current, selectableIds))} type="checkbox" /></th><th scope="col">User</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Team</th><th scope="col">Shift</th><th scope="col">Status</th><th scope="col">Override access</th><th scope="col">Actions</th></tr></thead>
          <tbody>{rows.map((user) => <tr key={user.id}><td><input aria-label={`Select ${user.name}`} checked={selected.has(user.id)} disabled={user.id === currentUserId || busy} onChange={() => setSelected((current) => toggleUserSelection(current, user.id))} type="checkbox" /></td><td><div className={styles.person}><span className={styles.avatar}>{initials(user.name)}</span><span><Link className={styles.personName} href={`/admin/users/${user.id}`}>{user.name}</Link>{user.id === currentUserId ? <Badge appearance="light" size="xs" variant="primary">You</Badge> : null}<br /><span className={styles.sectionCopy}>{user.dialerAgentName ?? "No American name"}</span></span></div></td><td>{user.email ?? "—"}</td><td><select aria-label={`Role for ${user.name}`} className={styles.compactControl} disabled={busy || user.id === currentUserId} onChange={(event) => changeRole(user, event.target.value as UserRow["role"])} title={`Current role: ${roleLabel(user.role)}`} value={user.role}><option value="agent">Agent</option><option value="manager">Team Manager</option><option value="admin">Administrator</option></select></td><td>{user.role === "agent" || user.role === "manager" ? <InlineTeamSelect currentTeamId={user.teamId} currentTeamName={user.teamName} teams={activeTeams} userId={user.id} /> : "—"}</td><td><InlineShiftEditor shift={user.shift} userId={user.id} /></td><td><details className={styles.inlineDetails}><Badge appearance="light" render={<summary />} shape="circle" size="xs" variant={user.accountStatus === "active" ? "success" : user.accountStatus === "deactivated" || user.accountStatus === "revoked" ? "destructive" : "warning"}><BadgeDot />{statusLabel(user.accountStatus)}</Badge><p className={styles.inlineDetailText}>{statusLabel(user.accountStatus)} account · Invitation: {statusLabel(user.invitationStatus)}</p></details></td><td><details className={styles.inlineDetails}><Badge appearance="light" render={<summary />} size="xs" variant={user.overrideCount ? "info" : "secondary"}>{user.overrideCount ? `${user.overrideCount} custom` : "None"}</Badge><p className={styles.inlineDetailText}>{user.overrideCount ? user.overrideSummary.join(" · ") : "No explicit overrides. Effective access comes from the role."}</p></details></td><td><button className={styles.buttonGhost} onClick={() => openPreview(user.id)} type="button">View</button></td></tr>)}</tbody>
        </table>
      </div>

      <dialog aria-labelledby="user-preview-title" className={styles.drawer} onClose={() => { setPreview(null); setPreviewError(null); }} ref={previewDialog}>
        <div className={styles.drawerInner}>
          <header className={styles.drawerHeader}><strong id="user-preview-title">User overview</strong><button aria-label="Close user overview" className={styles.iconButton} onClick={() => previewDialog.current?.close()} type="button"><DashboardIcon name="close" /></button></header>
          <div className={styles.drawerBody}>{previewLoading ? <p className={styles.drawerLoading}>Loading authorized account details…</p> : previewError ? <p className={styles.drawerLoading} role="alert">{previewError}</p> : preview ? <UserPreview payload={preview} currentUserId={currentUserId} /> : null}</div>
        </div>
      </dialog>

      <dialog aria-describedby="bulk-delete-description" aria-labelledby="bulk-delete-title" className="m-auto w-[min(34rem,calc(100%-2rem))] rounded-lg border border-danger/40 bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/70" ref={deleteDialog}>
        <div className="p-5"><h2 className="text-lg font-semibold" id="bulk-delete-title">Permanently delete selected users?</h2><p className="mt-2 text-sm text-muted" id="bulk-delete-description">Authentication data and active access are removed. Historical calls, metrics, team attribution, dialer attribution, and audit records remain. This cannot be undone.</p><div className="mt-5 flex justify-end gap-2"><button className={styles.buttonSecondary} disabled={busy} onClick={() => deleteDialog.current?.close()} type="button">Cancel</button><button className={styles.buttonDanger} disabled={busy} onClick={deleteSelectedUsers} type="button">{busyAction === "delete" ? "Deleting…" : "Delete permanently"}</button></div></div>
      </dialog>
    </>
  );
}

function UserPreview({ payload, currentUserId }: { payload: PreviewPayload; currentUserId: string }) {
  const { user, overrides, activity } = payload;
  return <>
    <div className={styles.drawerPerson}><span className={styles.drawerAvatar}>{initials(user.name)}</span><div><strong>{user.name}</strong><p className={styles.sectionCopy}>{roleLabel(user.role)} · {user.email}</p><Badge appearance="light" shape="circle" size="xs" variant={user.accountStatus === "active" ? "success" : "destructive"}><BadgeDot />{statusLabel(user.accountStatus)}</Badge></div></div>
    <section className={styles.drawerSection}><h3>Overview</h3><dl className={styles.facts}><dt>American name</dt><dd>{user.americanName ?? "—"}</dd><dt>Role</dt><dd>{roleLabel(user.role)}</dd><dt>Team</dt><dd>{user.team ?? "—"}</dd><dt>Shift</dt><dd>{user.shift ?? "—"}</dd><dt>Created</dt><dd>{fmtDate(user.createdAt)}</dd><dt>Last login</dt><dd>{fmtDate(user.lastLoginAt)}</dd><dt>Invitation</dt><dd>{statusLabel(user.invitationStatus)}</dd><dt>Password state</dt><dd>{statusLabel(user.passwordState)}</dd></dl></section>
    <section className={styles.drawerSection}><h3>Override access</h3>{overrides.length ? <ul className={styles.activity}>{overrides.map((override) => <li key={override.permissionKey}><strong>{permissionLabel(override.permissionKey)}</strong><span>{override.allowed ? "Explicitly allowed" : "Explicitly denied"}</span></li>)}</ul> : <p className={styles.sectionCopy}>None. Effective access follows the user&apos;s role.</p>}<Link className={styles.buttonSecondary} href={`/admin/users/${user.id}#access`} style={{ marginTop: 12 }}>Manage overrides</Link></section>
    <section className={styles.drawerSection}><h3>Quick actions</h3><div className={styles.drawerActions}><Link className={styles.buttonSecondary} href={`/admin/users/${user.id}#edit-user`}>Edit user</Link><Link className={styles.buttonSecondary} href={`/admin/users/${user.id}#account-actions`}>Reset password</Link><Link className={styles.buttonSecondary} href={`/admin/users/${user.id}#account-actions`}>Send or resend invitation</Link>{user.id !== currentUserId ? <><Link className={styles.buttonDanger} href={`/admin/users/${user.id}#danger-zone`}>{user.accountStatus === "active" ? "Deactivate user" : "Reactivate user"}</Link><Link className={styles.buttonDanger} href={`/admin/users/${user.id}#danger-zone`}>Delete user</Link></> : null}<Link className={styles.button} href={`/admin/users/${user.id}`}>Open full user details</Link></div></section>
    <section className={styles.drawerSection}><h3>Recent activity</h3>{activity.length ? <ul className={styles.activity}>{activity.map((event) => <li key={event.id}><strong>{event.action}</strong><time dateTime={event.createdAt}>{fmtDate(event.createdAt)}</time></li>)}</ul> : <p className={styles.sectionCopy}>No recent activity</p>}</section>
  </>;
}

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U"; }
function fmtDate(value: string | null) { return value ? new Date(value).toLocaleString("en-US") : "Never"; }
function permissionLabel(permissionKey: string) {
  return PERMISSION_PRESENTATION[permissionKey as keyof typeof PERMISSION_PRESENTATION]?.label ?? permissionKey;
}
