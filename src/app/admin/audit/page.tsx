import { redirect } from "next/navigation";

import { formatAuditEvent } from "@/admin/audit-format";
import { listAuditLogs } from "@/admin/data";
import { getCurrentUser } from "@/auth/session";
import {
  EmptyTableRow,
  PageHeader,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { humanizeIdentifier } from "@/presentation/labels";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-US") : "Not recorded";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function namedTarget(metadata: unknown) {
  if (!isRecord(metadata)) return null;

  for (const key of [
    "name",
    "userName",
    "teamName",
    "fileName",
    "sourceAgentName",
  ]) {
    const candidate = metadata[key];
    if (typeof candidate === "string" && candidate) {
      return candidate;
    }
  }

  return null;
}

function formatTarget(entityType: string, metadata: unknown) {
  const type = humanizeIdentifier(entityType);
  const name = namedTarget(metadata);
  return name ? `${type}: ${name}` : type;
}

export default async function AdminAuditPage() {
  const actor = await getCurrentUser();

  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/dashboard");

  const rows = await listAuditLogs(actor);

  return (
    <section className="dashboard-page">
      <PageHeader
        description="Review human-readable administrative and import events. Technical evidence remains available on demand."
        eyebrow="Administration"
        title="Audit log"
      />
      <section className="ui-card">
        <div className="ui-card__header">
          <div>
            <h2 className="ui-card__title">Recorded events</h2>
            <p className="ui-card__subtitle">
              Newest activity appears first.
            </p>
          </div>
        </div>
        <TableScroll label="Audit log">
          <table className="ui-table">
            <caption>Administrative and import audit events</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Target</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyTableRow
                  colSpan={5}
                  description="Administrative and import actions will appear here after they are recorded."
                  title="No audit events have been recorded"
                />
              ) : (
                rows.map((row) => {
                  const formatted = formatAuditEvent(
                    row.action,
                    row.metadata,
                  );
                  const technicalEvidence = {
                    ...(isRecord(formatted.technicalDetails)
                      ? formatted.technicalDetails
                      : {}),
                    ...(row.actorProfileId
                      ? { actorProfileId: row.actorProfileId }
                      : {}),
                    ...(row.entityId ? { entityId: row.entityId } : {}),
                  };
                  return (
                    <tr key={row.id}>
                      <td>{formatDate(row.createdAt)}</td>
                      <td>
                        {row.actorName ??
                          (row.actorProfileId ? "User account" : "System")}
                      </td>
                      <td>{formatted.title}</td>
                      <td>
                        <span className="audit-target">
                          {formatTarget(row.entityType, row.metadata)}
                        </span>
                      </td>
                      <td className="audit-description">
                        {formatted.details.join(" ") ||
                          "No additional details were recorded."}
                        {Object.keys(technicalEvidence).length > 0 ? (
                          <details className="ui-details ui-details--compact mt-2">
                            <summary>Technical details</summary>
                            <pre className="audit-technical-details">
                              {JSON.stringify(technicalEvidence, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScroll>
      </section>
    </section>
  );
}
