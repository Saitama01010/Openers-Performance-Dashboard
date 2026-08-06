"use client";

import { useMemo, useState } from "react";

import { SubmitButton } from "@/components/dashboard/action-controls";
import type { RoleDashboardData } from "@/dashboard/role-data";
import { saveCoachingReportAction } from "@/dashboard/actions";

type ManagerData = Extract<RoleDashboardData, { role: "manager" }>["data"];

export function CoachingRubricEntry({
  sessions,
  templates,
  existingReports,
}: {
  sessions: ManagerData["coachingSessions"];
  templates: ManagerData["rubricTemplates"];
  existingReports: ManagerData["coachingReports"];
}) {
  const completedPairs = useMemo(
    () => new Set(existingReports.map((report) => `${report.coachingSessionId}|${report.agentProfileId}`)),
    [existingReports],
  );
  const options = sessions.flatMap((session) =>
    session.participants.flatMap((participant) => {
      const value = `${session.id}|${participant.id}`;
      return completedPairs.has(value)
        ? []
        : [{ value, sessionId: session.id, agentId: participant.id, label: `${session.sessionDate} · ${participant.name} · ${session.category}` }];
    }),
  );
  const [pair, setPair] = useState(options[0]?.value ?? "");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const selectedPair = options.find((option) => option.value === pair);
  const template = templates.find((item) => item.id === templateId);

  if (options.length === 0 || templates.length === 0) {
    return (
      <p className="role-empty">
        {templates.length === 0
          ? "An administrator must configure an active rubric template before reports can be submitted."
          : "Every listed coaching participant already has a rubric report."}
      </p>
    );
  }

  return (
    <details>
      <summary>Submit coaching rubric</summary>
      <form action={saveCoachingReportAction} className="role-form">
        <input name="coachingSessionId" type="hidden" value={selectedPair?.sessionId ?? ""} />
        <input name="agentProfileId" type="hidden" value={selectedPair?.agentId ?? ""} />
        <label className="ui-label">
          Session and agent
          <select className="ui-select" onChange={(event) => setPair(event.target.value)} value={pair}>
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="ui-label">
          Rubric
          <select className="ui-select" name="templateId" onChange={(event) => setTemplateId(event.target.value)} value={templateId}>
            {templates.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}
          </select>
        </label>
        {template?.sections.map((section) => (
          <fieldset className="role-rubric-section" key={section.id}>
            <legend>{section.label}</legend>
            {section.criteria.map((criterion) => (
              <div className="role-rubric-criterion" key={criterion.id}>
                <input name="criterionId" type="hidden" value={criterion.id} />
                <label className="ui-label">
                  {criterion.label} (0–{criterion.maximumScore})
                  <input className="ui-input" max={criterion.maximumScore} min="0" name="score" required={criterion.required} step="0.01" type="number" />
                </label>
                <label className="ui-label">
                  Criterion note
                  <textarea className="ui-textarea" name="criterionNote" />
                </label>
              </div>
            ))}
          </fieldset>
        ))}
        <label className="ui-label">Strengths<textarea className="ui-textarea" name="strengths" /></label>
        <label className="ui-label">Improvement areas<textarea className="ui-textarea" name="improvementAreas" /></label>
        <label className="ui-label">Action items (one per line)<textarea className="ui-textarea" name="actionItems" /></label>
        <label className="ui-label">Follow-up date<input className="ui-input" name="followUpDate" type="date" /></label>
        <SubmitButton>Save draft report</SubmitButton>
      </form>
    </details>
  );
}
