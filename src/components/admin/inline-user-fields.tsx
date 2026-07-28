"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type TextField = "email" | "dialerName";

type PatchResult = {
  field?: TextField | "teamId";
  value?: string;
  teamName?: string;
  error?: string;
};

function normalizeText(field: TextField, value: string) {
  const trimmed = value.trim();
  return field === "email"
    ? trimmed.toLowerCase()
    : trimmed.replace(/\s+/g, " ");
}

function FieldFeedback({
  error,
  id,
  status,
}: {
  error: string | null;
  id: string;
  status: SaveStatus;
}) {
  if (status === "saving") {
    return (
      <span className="mt-1 block text-xs text-muted" id={id} role="status">
        Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="mt-1 block text-xs text-primary" id={id} role="status">
        Saved
      </span>
    );
  }
  if (status === "error" && error) {
    return (
      <span className="mt-1 block max-w-56 text-xs text-danger" id={id} role="alert">
        {error}
      </span>
    );
  }
  return null;
}

function InlineTextEditor({
  field,
  label,
  userId,
  value,
}: {
  field: TextField;
  label: string;
  userId: string;
  value: string;
}) {
  const router = useRouter();
  const [persistedValue, setPersistedValue] = useState(value);
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const cancelOnBlur = useRef(false);
  const feedbackId = `${field}-${userId}-feedback`;

  async function save() {
    if (saving.current) return;

    const nextValue = normalizeText(field, draft);
    if (nextValue === normalizeText(field, persistedValue)) {
      setDraft(persistedValue);
      setError(null);
      setStatus("idle");
      return;
    }

    saving.current = true;
    setStatus("saving");
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, value: nextValue }),
        },
      );
      const result = (await response.json()) as PatchResult;
      if (!response.ok) {
        throw new Error(result.error ?? "The field could not be saved.");
      }

      const savedValue = result.value ?? nextValue;
      setPersistedValue(savedValue);
      setDraft(savedValue);
      setStatus("saved");
      router.refresh();
    } catch (cause) {
      setDraft(persistedValue);
      setError(
        cause instanceof Error ? cause.message : "The field could not be saved.",
      );
      setStatus("error");
    } finally {
      saving.current = false;
    }
  }

  return (
    <div className="min-w-48">
      <label className="sr-only" htmlFor={`${field}-${userId}`}>
        {label}
      </label>
      <input
        aria-describedby={status === "idle" ? undefined : feedbackId}
        aria-invalid={status === "error"}
        autoComplete={field === "email" ? "email" : "off"}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm disabled:cursor-wait disabled:opacity-60"
        disabled={status === "saving"}
        id={`${field}-${userId}`}
        onBlur={() => {
          if (cancelOnBlur.current) {
            cancelOnBlur.current = false;
            return;
          }
          void save();
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          if (status !== "saving") {
            setStatus("idle");
            setError(null);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancelOnBlur.current = true;
            setDraft(persistedValue);
            setError(null);
            setStatus("idle");
            event.currentTarget.blur();
          }
        }}
        type={field === "email" ? "email" : "text"}
        value={draft}
      />
      <FieldFeedback error={error} id={feedbackId} status={status} />
    </div>
  );
}

export function InlineEmailEditor({
  email,
  userId,
}: {
  email: string;
  userId: string;
}) {
  return (
    <InlineTextEditor
      field="email"
      label={`Email for user ${userId}`}
      userId={userId}
      value={email}
    />
  );
}

export function InlineDialerNameEditor({
  dialerName,
  userId,
}: {
  dialerName: string | null;
  userId: string;
}) {
  return (
    <InlineTextEditor
      field="dialerName"
      label={`Primary dialer name for user ${userId}`}
      userId={userId}
      value={dialerName ?? ""}
    />
  );
}

export type InlineTeamOption = {
  id: string;
  name: string;
};

export function InlineTeamSelect({
  currentTeamId,
  currentTeamName,
  teams,
  userId,
}: {
  currentTeamId: string | null;
  currentTeamName: string | null;
  teams: InlineTeamOption[];
  userId: string;
}) {
  const router = useRouter();
  const [persistedTeamId, setPersistedTeamId] = useState(currentTeamId ?? "");
  const [selectedTeamId, setSelectedTeamId] = useState(currentTeamId ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const feedbackId = `team-${userId}-feedback`;
  const currentTeamIsActive = teams.some((team) => team.id === currentTeamId);

  async function changeTeam(nextTeamId: string) {
    if (saving.current || nextTeamId === persistedTeamId) return;

    const previousTeamId = persistedTeamId;
    saving.current = true;
    setSelectedTeamId(nextTeamId);
    setStatus("saving");
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "teamId", value: nextTeamId }),
        },
      );
      const result = (await response.json()) as PatchResult;
      if (!response.ok) {
        throw new Error(result.error ?? "The team could not be saved.");
      }

      const savedTeamId = result.value ?? nextTeamId;
      setPersistedTeamId(savedTeamId);
      setSelectedTeamId(savedTeamId);
      setStatus("saved");
      router.refresh();
    } catch (cause) {
      setSelectedTeamId(previousTeamId);
      setError(
        cause instanceof Error ? cause.message : "The team could not be saved.",
      );
      setStatus("error");
    } finally {
      saving.current = false;
    }
  }

  return (
    <div className="min-w-44">
      <label className="sr-only" htmlFor={`team-${userId}`}>
        Team for user {userId}
      </label>
      <select
        aria-describedby={status === "idle" ? undefined : feedbackId}
        aria-invalid={status === "error"}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm disabled:cursor-wait disabled:opacity-60"
        disabled={status === "saving"}
        id={`team-${userId}`}
        onChange={(event) => void changeTeam(event.target.value)}
        value={selectedTeamId}
      >
        {!selectedTeamId ? <option value="">Select team</option> : null}
        {currentTeamId && currentTeamName && !currentTeamIsActive ? (
          <option disabled value={currentTeamId}>
            {currentTeamName} (inactive)
          </option>
        ) : null}
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
      <FieldFeedback error={error} id={feedbackId} status={status} />
    </div>
  );
}
