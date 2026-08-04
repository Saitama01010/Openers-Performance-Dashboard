"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

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
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState(
    createCoachingSessionAction,
    INITIAL_COACHING_SESSION_STATE,
  );
  const availableAgents = useMemo(
    () => agents.filter((agent) => agent.allowedCoachIds.includes(coachId)),
    [agents, coachId],
  );
  const visibleAgents = useMemo(() => availableAgents.filter((agent) => {
    const query = search.trim().toLocaleLowerCase();
    return (
      !query ||
      agent.name.toLocaleLowerCase().includes(query) ||
      agent.teamNames.some((team) => team.toLocaleLowerCase().includes(query))
    );
  }), [availableAgents, search]);
  const groupedAgents = useMemo(() => {
    const groups = new Map<string, AgentOption[]>();
    for (const agent of visibleAgents) {
      const group = agent.teamNames.join(", ") || "Unassigned";
      groups.set(group, [...(groups.get(group) ?? []), agent]);
    }
    return Array.from(groups.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [visibleAgents]);

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
          setSearch("");
          setSelectedIds(new Set());
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
        <h2 className="ui-dialog__title" id={titleId}>New coaching session</h2>
        <p className="ui-dialog__description" id={descriptionId}>
          Record one group event and select every authorized agent who participated.
        </p>
        <form action={formAction} className="feature-form" ref={formRef}>
          {actorRole === "admin" ? (
            <label className="ui-label">
              Coach <span className="ui-required">Required</span>
              <select
                className="ui-select"
                name="coachProfileId"
                onChange={(event) => {
                  const nextCoachId = event.target.value;
                  const allowed = new Set(
                    agents
                      .filter((agent) => agent.allowedCoachIds.includes(nextCoachId))
                      .map((agent) => agent.id),
                  );
                  setCoachId(nextCoachId);
                  setSelectedIds((current) =>
                    new Set(Array.from(current).filter((id) => allowed.has(id))),
                  );
                }}
                required
                value={coachId}
              >
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>{coach.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <input name="coachProfileId" type="hidden" value={actorId} />
              <p className="ui-helper">Coach: your authenticated manager profile</p>
            </>
          )}

          <div className="feature-agent-picker">
            <label className="ui-label">
              Search authorized agents
              <input
                aria-controls={`${descriptionId}-agents`}
                className="ui-input"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by agent or team"
                type="search"
                value={search}
              />
            </label>
            <div className="feature-agent-picker__toolbar">
              <p aria-live="polite" className="ui-helper">{selectedIds.size} selected</p>
              <div className="feature-agent-picker__actions">
                <button
                  className="ui-button ui-button--secondary"
                  disabled={visibleAgents.length === 0}
                  onClick={() => setSelectedIds((current) => {
                    const next = new Set(current);
                    for (const agent of visibleAgents) next.add(agent.id);
                    return next;
                  })}
                  type="button"
                >
                  Select all visible
                </button>
                <button
                  className="ui-button ui-button--secondary"
                  disabled={selectedIds.size === 0}
                  onClick={() => setSelectedIds(new Set())}
                  type="button"
                >
                  Clear selected
                </button>
              </div>
            </div>
            <div id={`${descriptionId}-agents`}>
              {groupedAgents.map(([team, teamAgents]) => (
                <section className="feature-agent-picker__group" key={team}>
                  <h3>{team}</h3>
                  {teamAgents.map((agent) => (
                    <label className="feature-agent-picker__option" key={agent.id}>
                      <input
                        checked={selectedIds.has(agent.id)}
                        name="agentProfileIds"
                        onChange={(event) => setSelectedIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(agent.id);
                          else next.delete(agent.id);
                          return next;
                        })}
                        type="checkbox"
                        value={agent.id}
                      />
                      <strong>{agent.name}</strong>
                      <span>{agent.teamNames.join(", ") || "Unassigned"}</span>
                    </label>
                  ))}
                </section>
              ))}
              {visibleAgents.length === 0 ? (
                <p className="ui-helper">No authorized agents match this search.</p>
              ) : null}
            </div>
          </div>

          {availableAgents.length === 0 ? (
            <p className="feature-form__error" role="status">
              This coach has no active agents in assigned active teams.
            </p>
          ) : null}
          <label className="ui-label">
            Coaching category <span className="ui-required">Required</span>
            <select className="ui-select" name="category" required>
              {COACHING_CATEGORIES.map((category) => (
                <option key={category} value={category}>{COACHING_CATEGORY_LABELS[category]}</option>
              ))}
            </select>
          </label>
          <label className="ui-label">
            Coaching date <span className="ui-required">Required</span>
            <input className="ui-input" defaultValue={today} max={today} name="sessionDate" required type="date" />
          </label>
          <label className="ui-label">
            Coaching note <span className="ui-required">Optional</span>
            <textarea className="ui-textarea" maxLength={COACHING_NOTE_MAX_LENGTH} name="note" placeholder="Add a concise coaching note" />
          </label>
          {state.status === "error" ? (
            <p aria-live="polite" className="feature-form__error" role="alert">{state.message}</p>
          ) : null}
          <div className="ui-dialog__actions">
            <button className="ui-button ui-button--secondary" disabled={pending} onClick={closeDialog} type="button">Cancel</button>
            <button
              aria-busy={pending || undefined}
              className="ui-button ui-button--primary"
              disabled={pending || availableAgents.length === 0 || selectedIds.size === 0}
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
