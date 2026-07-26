"use client";

import { useRef, useState } from "react";

export function DeleteUserDialog({
  email,
  userId,
}: {
  email: string;
  userId: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmationEmail: confirmation }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Deletion failed.");
      window.location.assign("/admin/users?ok=user-deleted");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Deletion failed.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="rounded-md bg-danger px-3 py-2 text-sm font-semibold text-white"
        onClick={() => dialog.current?.showModal()}
        type="button"
      >
        Permanently delete user
      </button>
      <dialog
        className="m-auto w-[min(34rem,calc(100%-2rem))] rounded-lg border border-danger/40 bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/70"
        ref={dialog}
      >
        <div className="p-5">
          <h2 className="text-lg font-semibold">Permanently delete user</h2>
          <p className="mt-2 text-sm text-muted">
            Login access and private authentication data will be removed.
            Historical calls, metrics, team attribution, and reporting totals
            will remain.
          </p>
          <label className="mt-4 block text-sm font-medium">
            Type <span className="font-mono">{email}</span> to confirm
            <input
              autoFocus
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
              onChange={(event) => setConfirmation(event.target.value)}
              value={confirmation}
            />
          </label>
          {error ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <button
              className="rounded-md border border-border px-3 py-2 text-sm font-medium"
              disabled={busy}
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy || confirmation !== email}
              onClick={remove}
              type="button"
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
