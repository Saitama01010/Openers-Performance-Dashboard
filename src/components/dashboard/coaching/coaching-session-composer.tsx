"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { createCoachingSessionAction, type CoachingSessionActionState } from "@/app/coaching/actions";
import { COACHING_CATEGORIES, COACHING_CATEGORY_LABELS, COACHING_NOTE_MAX_LENGTH, type CoachingCategory } from "@/coaching/domain";
import { Badge, BadgeDot } from "@/components/ui/base-badge";
import styles from "@/components/dashboard/coaching/coaching-page.module.css";

type Coach = { id: string; name: string };
type Participant = { id: string; name: string; teamNames: string[] };
type PageData = { rows: Participant[]; page: number; pageSize: number; total: number };
const INITIAL: CoachingSessionActionState = { status: "idle", message: "" };

export function CoachingSessionComposer({ actorId, actorRole, coaches, today }: { actorId: string; actorRole: "admin" | "manager"; coaches: Coach[]; today: string }) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [coachId, setCoachId] = useState(actorId);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PageData>({ rows: [], page: 1, pageSize: 12, total: 0 });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Map<string, Participant>>(new Map());
  const [sessionDate, setSessionDate] = useState(today);
  const [category, setCategory] = useState<CoachingCategory>(COACHING_CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [state, action, pending] = useActionState(createCoachingSessionAction, INITIAL);
  const dirty = selected.size > 0 || note.length > 0 || sessionDate !== today || category !== COACHING_CATEGORIES[0];

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 250); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    queueMicrotask(() => setLoading(true));
    const params = new URLSearchParams({ coach: coachId, page: String(page), q: debouncedSearch });
    fetch(`/api/coaching/participants?${params}`, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((response) => { if (!response.ok) throw new Error("Unable to load authorized agents."); return response.json() as Promise<PageData>; })
      .then(setData)
      .catch((error) => { if (error instanceof DOMException && error.name === "AbortError") return; setData({ rows: [], page: 1, pageSize: 12, total: 0 }); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [coachId, debouncedSearch, open, page]);
  useEffect(() => { if (open) headingRef.current?.focus(); }, [open, step]);
  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
    if (state.status !== "success") return;
    queueMicrotask(() => { setOpen(false); setStep(1); setSelected(new Map()); setNote(""); setCategory(COACHING_CATEGORIES[0]); setSessionDate(today); router.refresh(); });
  }, [router, state, today]);
  useEffect(() => {
    if (!open) return;
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); cancel(); } }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  });

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const selectedRows = useMemo(() => Array.from(selected.values()), [selected]);
  function cancel() { if (dirty && !window.confirm("Discard this coaching session draft?")) return; setOpen(false); }
  function toggle(row: Participant) { setSelected((current) => { const next = new Map(current); if (next.has(row.id)) next.delete(row.id); else next.set(row.id, row); return next; }); }
  function next() { if (step === 1 && selected.size === 0) return; setStep((current) => Math.min(4, current + 1)); }
  const stepTitle = step === 1 ? "Select participants" : step === 2 ? "Session details" : step === 3 ? "Coaching focus" : "Review and confirm";

  if (!open) return (
    <div>
      <button className={styles.button} onClick={() => { setOpen(true); setStep(1); }} type="button">+ New coaching session</button>
      {state.status === "success" ? <p aria-live="polite" className={styles.success}>{state.message}</p> : null}
    </div>
  );

  return (
    <section aria-labelledby="new-coaching-title" className={styles.composer}>
      <header className={styles.composerHeader}><h2 id="new-coaching-title">Create new coaching session</h2><button aria-label="Close coaching session composer" className={styles.secondaryButton} onClick={cancel} type="button">Close</button></header>
      <form action={action}>
        {selectedRows.map((row) => <input key={row.id} name="agentProfileIds" type="hidden" value={row.id} />)}
        <input name="coachProfileId" type="hidden" value={coachId} /><input name="sessionDate" type="hidden" value={sessionDate} /><input name="category" type="hidden" value={category} /><input name="note" type="hidden" value={note} />
        <div className={styles.composerGrid}>
          <ol aria-label="Session creation steps" className={styles.steps}>{["Participants", "Details", "Coaching focus", "Review & confirm"].map((label, index) => <li data-active={step === index + 1} data-complete={step > index + 1} key={label}><span className={styles.stepNumber}>{index + 1}</span>{label}</li>)}</ol>
          <section className={styles.stepPanel}>
            <h3 ref={headingRef} tabIndex={-1}>{stepTitle}</h3>
            {step === 1 ? <>
              <p>Choose one or more agents from the coach&apos;s current server-authorized scope. Selection persists across search and pages.</p>
              <input aria-label="Search authorized agents" className={styles.searchBox} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search agent by name or team…" type="search" value={search} />
              <div className={styles.pickerToolbar}><span className={styles.muted}>{selected.size} selected · {data.total} available</span><div className={styles.pickerActions}><button className={styles.secondaryButton} disabled={data.rows.length === 0} onClick={() => setSelected((current) => new Map([...current, ...data.rows.map((row) => [row.id, row] as const)]))} type="button">Select all visible</button><button className={styles.secondaryButton} disabled={selected.size === 0} onClick={() => setSelected(new Map())} type="button">Clear</button></div></div>
              <div aria-busy={loading || undefined} className={styles.participantList}>{loading ? <p className={styles.empty}>Loading authorized agents…</p> : data.rows.length === 0 ? <p className={styles.empty}>No authorized agents match this search.</p> : data.rows.map((row) => <label className={styles.participant} key={row.id}><input checked={selected.has(row.id)} onChange={() => toggle(row)} type="checkbox" /><span className={styles.avatar}>{row.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span><span><strong>{row.name}</strong><small>{row.teamNames.join(", ") || "Unassigned"}</small></span><Badge appearance="light" shape="circle" size="xs" variant="success"><BadgeDot />Active</Badge></label>)}</div>
              <div className={styles.footer}><span>Page {data.page} of {totalPages}</span><div className={styles.pagination}><button className={styles.secondaryButton} disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button><button className={styles.secondaryButton} disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} type="button">Next</button></div></div>
            </> : null}
            {step === 2 ? <div className={styles.formGrid}><p>Record who coached the group, when the session occurred, and an optional concise note.</p>{actorRole === "admin" ? <label>Coach<select onChange={(event) => { setCoachId(event.target.value); setSelected(new Map()); setPage(1); }} value={coachId}>{coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}</select></label> : <label>Coach<input disabled value={coaches.find((coach) => coach.id === actorId)?.name ?? "You"} /></label>}<label>Coaching date<input max={today} onChange={(event) => setSessionDate(event.target.value)} required type="date" value={sessionDate} /></label><label>Coaching note (optional)<textarea maxLength={COACHING_NOTE_MAX_LENGTH} onChange={(event) => setNote(event.target.value)} placeholder="Add a concise coaching note…" value={note} /></label></div> : null}
            {step === 3 ? <div className={styles.formGrid}><p>Choose from the coaching categories already supported by the product. No additional rubric fields are invented here.</p><label>Coaching category<select onChange={(event) => setCategory(event.target.value as CoachingCategory)} value={category}>{COACHING_CATEGORIES.map((item) => <option key={item} value={item}>{COACHING_CATEGORY_LABELS[item]}</option>)}</select></label><div className={styles.notice}>Detailed rubric scoring remains available through the existing coaching-report workflow after the grouped session is created.</div></div> : null}
            {step === 4 ? <><p>Confirm the grouped event. One transaction creates one session and every selected participant together.</p><dl className={styles.review}><div><dt>Coach</dt><dd>{coaches.find((coach) => coach.id === coachId)?.name ?? "You"}</dd></div><div><dt>Participants</dt><dd>{selected.size} agents</dd></div><div><dt>Date</dt><dd>{sessionDate}</dd></div><div><dt>Focus</dt><dd>{COACHING_CATEGORY_LABELS[category]}</dd></div><div><dt>Note</dt><dd>{note || "No note"}</dd></div></dl></> : null}
            {state.status === "error" ? <p className={styles.error} ref={errorRef} role="alert" tabIndex={-1}>{state.message}</p> : null}
          </section>
          <aside className={styles.summary}><h3>Session summary</h3><p>Your selections stay available as you move through the workflow.</p><dl className={styles.review}><div><dt>Coach</dt><dd>{coaches.find((coach) => coach.id === coachId)?.name ?? "You"}</dd></div><div><dt>Selected participants</dt><dd>{selected.size}</dd></div><div><dt>Category</dt><dd>{COACHING_CATEGORY_LABELS[category]}</dd></div></dl><ul className={styles.selectedList}>{selectedRows.slice(0, 8).map((row) => <li key={row.id}><span>{row.name}<small>{row.teamNames.join(", ")}</small></span><button aria-label={`Remove ${row.name}`} onClick={() => toggle(row)} type="button">×</button></li>)}</ul>{selected.size > 8 ? <p className={styles.muted}>+ {selected.size - 8} more selected</p> : null}</aside>
        </div>
        <footer className={styles.composerFooter}><button className={styles.secondaryButton} onClick={cancel} type="button">Cancel</button>{step > 1 ? <button className={styles.secondaryButton} onClick={() => setStep((current) => Math.max(1, current - 1))} type="button">Back</button> : null}{step < 4 ? <button className={styles.button} disabled={step === 1 && selected.size === 0} onClick={next} type="button">Next</button> : <button aria-busy={pending || undefined} className={styles.button} disabled={pending || selected.size === 0} type="submit">{pending ? "Saving…" : "Create grouped session"}</button>}</footer>
      </form>
    </section>
  );
}
