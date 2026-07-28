"use client";

import { useState } from "react";

export function TemporaryPasswordControls({
  allowRegenerate = true,
  available,
  passwordCreatedAt,
  userId,
}: {
  allowRegenerate?: boolean;
  available: boolean;
  passwordCreatedAt?: string | null;
  userId: string;
}) {
  const [password, setPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState<"reveal" | "copy" | "regenerate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function request(action: "reveal" | "regenerate") {
    const response = await fetch(
      `/api/admin/users/${encodeURIComponent(userId)}/temporary-password`,
      {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
    );
    const result = (await response.json()) as {
      password?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(result.error ?? "Action failed.");
    return result.password ?? null;
  }

  async function reveal() {
    setBusy("reveal");
    setError(null);
    try {
      setPassword(await request("reveal"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reveal failed.");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    setBusy("copy");
    setError(null);
    try {
      const value = password ?? (await request("reveal"));
      if (!value) throw new Error("Temporary password is unavailable.");
      setPassword(value);
      await navigator.clipboard.writeText(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Copy failed.");
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    if (
      !window.confirm(
        "Generate a new temporary password? The previous password and all existing sessions will stop working.",
      )
    ) {
      return;
    }
    setBusy("regenerate");
    setError(null);
    try {
      await request("regenerate");
      setPassword(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Regeneration failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (!available) {
    return (
      <div className="space-y-1 text-sm">
        <p>
          <span className="text-muted">Temporary password:</span>{" "}
          <span className="font-medium">No longer available</span>
        </p>
        <p>
          <span className="text-muted">Password created:</span>{" "}
          {passwordCreatedAt
            ? new Date(passwordCreatedAt).toLocaleString("en-US")
            : "Not recorded"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p
        aria-live="polite"
        className="break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
      >
        {password ?? "••••••••••••••••••••"}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md border border-border px-3 py-2 text-sm font-medium"
          disabled={busy !== null}
          onClick={reveal}
          type="button"
        >
          {busy === "reveal" ? "Revealing…" : "Reveal"}
        </button>
        <button
          className="rounded-md border border-border px-3 py-2 text-sm font-medium"
          disabled={busy !== null}
          onClick={copy}
          type="button"
        >
          {busy === "copy" ? "Copying…" : "Copy"}
        </button>
        {allowRegenerate ? (
          <button
            className="rounded-md border border-danger px-3 py-2 text-sm font-medium text-danger"
            disabled={busy !== null}
            onClick={regenerate}
            type="button"
          >
          {busy === "regenerate"
            ? "Generating…"
            : "Generate new temporary password"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
