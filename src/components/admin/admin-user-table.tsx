"use client";

import Link from "next/link";
import { useState } from "react";

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  dialerAgentName: string | null;
  role: string;
  teamName: string | null;
  accountStatus: string;
  invitationStatus: string;
  lastLoginAt: string | null;
  createdAt: string;
};

export function AdminUserTable({ users }: { users: UserRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    selected: number;
    sent: number;
    skipped: number;
    failed: number;
    outcomes: { userId: string; status: string; reason?: string }[];
  } | null>(null);

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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Invitations failed.");
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
            reason: cause instanceof Error ? cause.message : "Invitations failed.",
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
        <div className="border-b border-border bg-background/50 px-4 py-3 text-sm">
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
                      "Invitation"}: {outcome.reason}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-4 py-3">
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
              </th>
              <th className="px-4 py-3">Full name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Dialer name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Invitation</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr className="border-t border-border" key={user.id}>
                <td className="px-4 py-3">
                  <input
                    aria-label={`Select ${user.name}`}
                    checked={selected.has(user.id)}
                    onChange={() => toggle(user.id)}
                    type="checkbox"
                  />
                </td>
                <td className="px-4 py-3 font-medium">{user.name}</td>
                <td className="px-4 py-3">{user.email ?? "—"}</td>
                <td className="px-4 py-3">{user.dialerAgentName ?? "—"}</td>
                <td className="px-4 py-3 capitalize">{user.role}</td>
                <td className="px-4 py-3">{user.teamName ?? "—"}</td>
                <td className="px-4 py-3 capitalize">{user.accountStatus}</td>
                <td className="px-4 py-3 capitalize">{user.invitationStatus}</td>
                <td className="px-4 py-3">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString("en-US")
                    : "Never"}
                </td>
                <td className="px-4 py-3">
                  {new Date(user.createdAt).toLocaleString("en-US")}
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
      </div>
    </>
  );
}
