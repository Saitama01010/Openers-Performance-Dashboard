"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import {
  toggleAllUserSelection,
  toggleUserSelection,
} from "@/admin/user-selection";
import {
  InlineDialerNameEditor,
  InlineEmailEditor,
  InlineShiftEditor,
  InlineTeamSelect,
  type InlineTeamOption,
} from "@/components/admin/inline-user-fields";
import { TableScroll } from "@/components/dashboard/dashboard-primitives";
import { roleLabel, statusLabel } from "@/presentation/labels";

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  dialerAgentName: string | null;
  role: string;
  teamId: string | null;
  teamName: string | null;
  shift: string | null;
  accountStatus: string;
};

type InvitationResult = {
  selected: number;
  sent: number;
  skipped: number;
  failed: number;
  outcomes: { userId: string; status: string; reason?: string }[];
};

type Feedback =
  | { tone: "success" | "error"; message: string }
  | null;

export function AdminUserTable({
  activeTeams,
  currentUserId,
  users,
}: {
  activeTeams: InlineTeamOption[];
  currentUserId: string;
  users: UserRow[];
}) {
  const router = useRouter();
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState(users);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<"invite" | "delete" | null>(
    null,
  );
  const [invitationResult, setInvitationResult] =
    useState<InvitationResult | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const selectableIds = useMemo(
    () => rows.filter((user) => user.id !== currentUserId).map((user) => user.id),
    [currentUserId, rows],
  );
  const allSelected =
    selectableIds.length > 0 &&
    selectableIds.every((userId) => selected.has(userId));
  const someSelected = selected.size > 0 && !allSelected;
  const busy = busyAction !== null;

  async function sendInvitations() {
    setBusyAction("invite");
    setInvitationResult(null);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/users/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected) }),
      });
      const payload = (await response.json()) as InvitationResult & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Invitations failed.");
      }
      setInvitationResult(payload);
    } catch (cause) {
      setInvitationResult({
        selected: selected.size,
        sent: 0,
        skipped: 0,
        failed: selected.size,
        outcomes: [
          {
            userId: "",
            status: "failed",
            reason:
              cause instanceof Error ? cause.message : "Invitations failed.",
          },
        ],
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteSelectedUsers() {
    if (busy || selected.size === 0) return;

    setBusyAction("delete");
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/users/bulk-delete", {
        method: "DELETE",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected) }),
      });
      const payload = (await response.json()) as {
        deletedIds?: string[];
        error?: string;
      };
      if (!response.ok || !payload.deletedIds) {
        throw new Error(payload.error ?? "User deletion failed.");
      }

      const deleted = new Set(payload.deletedIds);
      setRows((current) => current.filter((user) => !deleted.has(user.id)));
      setSelected(new Set());
      setInvitationResult(null);
      setFeedback({
        tone: "success",
        message: `${deleted.size} ${deleted.size === 1 ? "user was" : "users were"} permanently deleted.`,
      });
      deleteDialog.current?.close();
      router.refresh();
    } catch (cause) {
      setFeedback({
        tone: "error",
        message:
          cause instanceof Error ? cause.message : "User deletion failed.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <span className="text-sm font-semibold" aria-live="polite">
          {selected.size} selected
        </span>
        <button
          className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          disabled={selected.size === 0 || busy}
          onClick={sendInvitations}
          type="button"
        >
          {busyAction === "invite"
            ? "Sending…"
            : `Send invitation (${selected.size})`}
        </button>
        {selected.size > 0 ? (
          <button
            className="rounded-md bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              setFeedback(null);
              deleteDialog.current?.showModal();
            }}
            type="button"
          >
            Delete Selected Users
          </button>
        ) : null}
        <p className="text-sm text-muted">
          The signed-in administrator is protected from selection.
        </p>
      </div>
      {feedback ? (
        <div
          className={
            feedback.tone === "success"
              ? "border-b border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary"
              : "border-b border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
          }
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </div>
      ) : null}
      {invitationResult ? (
        <div
          aria-live="polite"
          className="border-b border-border bg-background/50 px-4 py-3 text-sm"
          role={invitationResult.failed > 0 ? "alert" : "status"}
        >
          <p className="font-medium">
            Selected {invitationResult.selected} · Sent {invitationResult.sent} ·
            Skipped {invitationResult.skipped} · Failed {invitationResult.failed}
          </p>
          {invitationResult.outcomes.some((outcome) => outcome.reason) ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              {invitationResult.outcomes
                .filter((outcome) => outcome.reason)
                .map((outcome, index) => (
                  <li key={`${outcome.userId}-${index}`}>
                    {rows.find((user) => user.id === outcome.userId)?.name ??
                      "Invitation"}
                    : {outcome.reason}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <TableScroll label="Users and access">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-4 py-3" scope="col">
                <input
                  aria-label="Select all users on this page"
                  checked={allSelected}
                  ref={(element) => {
                    if (element) element.indeterminate = someSelected;
                  }}
                  onChange={() =>
                    setSelected((current) =>
                      toggleAllUserSelection(current, selectableIds),
                    )
                  }
                  type="checkbox"
                />
              </th>
              <th className="px-4 py-3" scope="col">Real Name</th>
              <th className="px-4 py-3" scope="col">Email</th>
              <th className="px-4 py-3" scope="col">American Name</th>
              <th className="px-4 py-3" scope="col">Role</th>
              <th className="px-4 py-3" scope="col">Team</th>
              <th className="px-4 py-3" scope="col">Shift</th>
              <th className="px-4 py-3" scope="col">Status</th>
              <th className="px-4 py-3" scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => (
              <tr className="border-t border-border align-top" key={user.id}>
                <td className="px-4 py-3">
                  <input
                    aria-label={`Select ${user.name}`}
                    checked={selected.has(user.id)}
                    disabled={user.id === currentUserId || busy}
                    onChange={() =>
                      setSelected((current) =>
                        toggleUserSelection(current, user.id),
                      )
                    }
                    type="checkbox"
                  />
                </td>
                <th className="px-4 py-3 text-left" scope="row">
                  <Link
                    className="font-medium text-primary hover:underline"
                    href={`/admin/users/${user.id}`}
                  >
                    {user.name}
                  </Link>
                </th>
                <td className="px-4 py-3">
                  {user.email ? (
                    <InlineEmailEditor email={user.email} userId={user.id} />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <InlineDialerNameEditor
                    dialerName={user.dialerAgentName}
                    userId={user.id}
                  />
                </td>
                <td className="px-4 py-3">{roleLabel(user.role)}</td>
                <td className="px-4 py-3">
                  {user.role === "agent" || user.role === "manager" ? (
                    <InlineTeamSelect
                      currentTeamId={user.teamId}
                      currentTeamName={user.teamName}
                      teams={activeTeams}
                      userId={user.id}
                    />
                  ) : (
                    user.teamName ?? "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <InlineShiftEditor shift={user.shift} userId={user.id} />
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full border border-border bg-background px-2 py-0.5 text-xs capitalize">
                    {statusLabel(user.accountStatus)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    className="font-medium text-primary hover:underline"
                    href={`/admin/users/${user.id}`}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>

      <dialog
        className="m-auto w-[min(34rem,calc(100%-2rem))] rounded-lg border border-danger/40 bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/70"
        ref={deleteDialog}
      >
        <div className="p-5">
          <h2 className="text-lg font-semibold">Delete selected users?</h2>
          <p className="mt-2 text-sm text-muted">
            {selected.size} {selected.size === 1 ? "user is" : "users are"}{" "}
            selected. Account deletion is permanent and cannot be undone.
          </p>
          <p className="mt-3 text-sm text-muted">
            Login credentials and active sessions will be removed. Historical
            performance, imports, calls, transfers, deals, team attribution,
            and audit records will remain.
          </p>
          {feedback?.tone === "error" ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {feedback.message}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <button
              className="rounded-md border border-border px-3 py-2 text-sm font-medium"
              disabled={busy}
              onClick={() => deleteDialog.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={deleteSelectedUsers}
              type="button"
            >
              {busyAction === "delete" ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
