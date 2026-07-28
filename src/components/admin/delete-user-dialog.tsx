"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function DeleteUserDialog({ userId }: { userId: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          cache: "no-store",
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Deletion failed.");
      }

      dialog.current?.close();
      router.replace("/admin/users?ok=user-deleted");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Deletion failed.",
      );
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="rounded-md bg-danger px-3 py-2 text-sm font-semibold text-white"
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
        }}
        type="button"
      >
        Permanently delete user
      </button>
      <dialog
        className="m-auto w-[min(34rem,calc(100%-2rem))] rounded-lg border border-danger/40 bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/70"
        ref={dialog}
      >
        <div className="p-5">
          <h2 className="text-lg font-semibold">Permanently delete user?</h2>
          <p className="mt-2 text-sm text-muted">
            This immediately removes login access, active sessions,
            authentication credentials, temporary-password data, invitations,
            reset tokens, permission overrides, active team memberships, and
            active dialer mappings.
          </p>
          <p className="mt-3 text-sm text-muted">
            Historical calls, metrics, display name, dialer attribution, team
            attribution, and audit information will be preserved. This action
            cannot be undone.
          </p>
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
              disabled={busy}
              onClick={remove}
              type="button"
            >
              {busy ? "Deleting…" : "Confirm permanent deletion"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
