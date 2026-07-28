import { redirect } from "next/navigation";

import { listAuditLogs } from "@/admin/data";
import { getCurrentUser } from "@/auth/session";
import {
  EmptyTableRow,
  PageHeader,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";

export const dynamic = "force-dynamic";

function fmt(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-US") : "—";
}

function metadata(value: unknown) {
  if (!value) return "—";
  return JSON.stringify(value).slice(0, 320);
}

export default async function AdminAuditPage() {
  const actor = await getCurrentUser();

  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/dashboard");

  const rows = await listAuditLogs(actor);

  return (
    <div className="dashboard-page">
      <PageHeader
        description="Review the latest security-sensitive and administrative activity."
        eyebrow="Admin only"
        title="Audit log"
      />

      <section aria-labelledby="audit-events-heading" className="ui-card">
        <div className="ui-card__header">
          <div>
            <h2 className="ui-card__title" id="audit-events-heading">
              Recent events
            </h2>
            <p className="ui-card__subtitle">
              Showing {rows.length} most recent records.
            </p>
          </div>
        </div>
        <TableScroll label="Audit events">
          <table className="ui-table">
            <caption>Recent administrative audit events</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Target</th>
                <th scope="col">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{fmt(row.createdAt)}</td>
                  <td>{row.actorName ?? row.actorProfileId ?? "system"}</td>
                  <td>{row.action}</td>
                  <td>
                    {row.entityType}:{row.entityId ?? "—"}
                  </td>
                  <td className="audit-metadata">{metadata(row.metadata)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <EmptyTableRow
                  colSpan={5}
                  description="Administrative events will appear here as they occur."
                  title="No audit events yet"
                />
              ) : null}
            </tbody>
          </table>
        </TableScroll>
      </section>
    </div>
  );
}
