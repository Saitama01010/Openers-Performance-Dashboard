"use client";

import Link from "next/link";
import { useState } from "react";

import {
  InlineDialerNameEditor,
  InlineEmailEditor,
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
  accountStatus: string;
  invitationStatus: string;
  lastLoginAt: string | null;
};

type InvitationResult = {
  selected: number;
  sent: number;
  skipped: number;
  failed: number;
  outcomes: { userId: string; status: string; reason?: string }[];
};

export function AdminUserTable({
  activeTeams,
  users,
}: {
  activeTeams: InlineTeamOption[];
  users: UserRow[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InvitationResult | null>(null);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendInvitations() {
    setBusy(true);
    setResult(null);
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
      setResult(payload);
    } catch (cause) {
      setResult({
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
      setBusy(false);
    }
  }

  const allSelected =
    users.length > 0 && users.every((user) => selected.has(user.id));

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <button
          className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          disabled={selected.size === 0 || busy}
          onClick={sendInvitations}
          type="button"
        >
          {busy ? "Sending…" : `Send invitation (${selected.size})`}
        </button>
        <p className="text-sm text-muted">
          Each selected user receives a separate expiring link.
        </p>
      </div>
      {result ? (
        <div
          aria-live="polite"
          className="border-b border-border bg-background/50 px-4 py-3 text-sm"
          role={result.failed > 0 ? "alert" : "status"}
        >
          <p className="font-medium">
            Selected {result.selected} · Sent {result.sent} · Skipped{" "}
            {result.skipped} · Failed {result.failed}
          </p>
          {result.outcomes.some((outcome) => outcome.reason) ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              {result.outcomes
                .filter((outcome) => outcome.reason)
                .map((outcome, index) => (
                  <li key={`${outcome.userId}-${index}`}>
                    {users.find((user) => user.id === outcome.userId)?.name ??
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
              <th className="px-4 py-3">
                <span className="flex min-w-48 items-center gap-3">
                  <input
                    aria-label="Select all users on this page"
                    checked={allSelected}
                    onChange={() =>
                      setSelected(
                        allSelected
                          ? new Set()
                          : new Set(users.map((user) => user.id)),
                      )
                    }
                    type="checkbox"
                  />
                  <span>Full name</span>
                </span>
              </th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Dialer name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Invitation</th>
              <th className="px-4 py-3">Last login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr className="border-t border-border align-top" key={user.id}>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-3">
                    <input
                      aria-label={`Select ${user.name}`}
                      checked={selected.has(user.id)}
                      onChange={() => toggle(user.id)}
                      type="checkbox"
                    />
                    <Link
                      className="font-medium text-primary hover:underline"
                      href={`/admin/users/${user.id}`}
                    >
                      {user.name}
                    </Link>
                  </span>
                </td>
                <td className="px-4 py-3">
                  {user.email ? (
                    <InlineEmailEditor
                      email={user.email}
                      userId={user.id}
                    />
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
                  <span className="inline-flex rounded-full border border-border bg-background px-2 py-0.5 text-xs capitalize">
                    {statusLabel(user.accountStatus)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full border border-border bg-background px-2 py-0.5 text-xs capitalize">
                    {statusLabel(user.invitationStatus)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString("en-US")
                    : "Never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </>
  );
}
