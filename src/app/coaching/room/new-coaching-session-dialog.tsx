"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  createCoachingSessionAction,
  type CoachingSessionActionState,
} from "@/app/coaching/actions";
import {
  COACHING_CATEGORIES,
  COACHING_CATEGORY_LABELS,
  COACHING_NOTE_MAX_LENGTH,
} from "@/coaching/domain";

type CoachOption = { id: string; name: string };
type AgentOption = {
  id: string;
  name: string;
  teamNames: string[];
  allowedCoachIds: string[];
};

const INITIAL_COACHING_SESSION_STATE: CoachingSessionActionState = {
  status: "idle",
  message: "",
};

export function NewCoachingSessionDialog({
  actorId,
  actorRole,
  agents,
  coaches,
  today,
}: {
  actorId: string;
  actorRole: "admin" | "manager";
  agents: AgentOption[];
  coaches: CoachOption[];
  today: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [coachId, setCoachId] = useState(actorId);
  const [state, formAction, pending] = useActionState(
    createCoachingSessionAction,
    INITIAL_COACHING_SESSION_STATE,
  );
  const availableAgents = agents.filter((agent) =>
    agent.allowedCoachIds.includes(coachId),
  );

  useEffect(() => {
    if (state.status !== "success") return;
    dialogRef.current?.close();
    formRef.current?.reset();
    router.refresh();
  }, [router, state]);

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        className="ui-button ui-button--primary"
        onClick={() => {
          formRef.current?.reset();
          setCoachId(actorId);
          dialogRef.current?.showModal();
        }}
        ref={triggerRef}
        type="button"
      >
        New coaching session
      </button>
      {state.status === "success" ? (
        <p aria-live="polite" className="feature-action-message">
          {state.message}
        </p>
      ) : null}
      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="ui-dialog feature-dialog"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => triggerRef.current?.focus()}
        ref={dialogRef}
      >
        <h2 className="ui-dialog__title" id={titleId}>
          New coaching session
        </h2>
        <p className="ui-dialog__description" id={descriptionId}>
          Record one group event and select every agent who participated.
        </p>
        <form action={formAction} className="feature-form" ref={formRef}>
          {actorRole === "admin" ? (
            <label className="ui-label">
              Coach <span className="ui-required">Required</span>
              <select
                className="ui-select"
                name="coachProfileId"
                onChange={(event) => setCoachId(event.target.value)}
                required
                value={coachId}
              >
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <input name="coachProfileId" type="hidden" value={actorId} />
              <p className="ui-helper">Coach: your authenticated manager profile</p>
            </>
          )}
          <label className="ui-label">
            Agents <span className="ui-required">Required; choose one or more</span>
            <select
              aria-describedby={`${descriptionId}-agents`}
              className="ui-select feature-multiselect"
              key={coachId}
              multiple
              name="agentProfileIds"
              required
              size={Math.min(8, Math.max(3, availableAgents.length))}
            >
              {availableAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} — {agent.teamNames.join(", ") || "Unassigned"}
                </option>
              ))}
            </select>
          </label>
          <p className="ui-helper" id={`${descriptionId}-agents`}>
            Hold Ctrl or Command to select multiple agents.
          </p>
          {availableAgents.length === 0 ? (
            <p className="feature-form__error" role="status">
              This coach has no active agents in assigned active teams.
            </p>
          ) : null}
          <label className="ui-label">
            Coaching category <span className="ui-required">Required</span>
            <select className="ui-select" name="category" required>
              {COACHING_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {COACHING_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>
          <label className="ui-label">
            Coaching date <span className="ui-required">Required</span>
            <input
              className="ui-input"
              defaultValue={today}
              max={today}
              name="sessionDate"
              required
              type="date"
            />
          </label>
          <label className="ui-label">
            Coaching note <span className="ui-required">Optional</span>
            <textarea
              className="ui-textarea"
              maxLength={COACHING_NOTE_MAX_LENGTH}
              name="note"
              placeholder="Add a concise coaching note"
            />
          </label>
          {state.status === "error" ? (
            <p aria-live="polite" className="feature-form__error" role="alert">
              {state.message}
            </p>
          ) : null}
          <div className="ui-dialog__actions">
            <button
              className="ui-button ui-button--secondary"
              disabled={pending}
              onClick={closeDialog}
              type="button"
            >
              Cancel
            </button>
            <button
              aria-busy={pending || undefined}
              className="ui-button ui-button--primary"
              disabled={pending || availableAgents.length === 0}
              type="submit"
            >
              {pending ? "Saving…" : "Save coaching session"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
