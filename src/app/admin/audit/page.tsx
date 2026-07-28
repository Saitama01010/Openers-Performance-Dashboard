import { redirect } from "next/navigation";

import { listAuditLogs } from "@/admin/data";
import { formatAuditEvent } from "@/admin/audit-format";
import { getCurrentUser } from "@/auth/session";

export const dynamic = "force-dynamic";

function fmt(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-US") : "-";
}

export default async function AdminAuditPage() {
  const actor = await getCurrentUser();

  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/dashboard");

  const rows = await listAuditLogs(actor);

  return (
    <section className="dashboard-page">
      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm text-muted">Admin only</p>
          <h2 className="text-xl font-semibold">Audit Log</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Description</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const formatted = formatAuditEvent(row.action, row.metadata);
                return (
                  <tr className="border-t border-border align-top" key={row.id}>
                    <td className="px-4 py-3">{fmt(row.createdAt)}</td>
                    <td className="px-4 py-3">{row.actorName ?? row.actorProfileId ?? "system"}</td>
                    <td className="px-4 py-3">{formatted.title}</td>
                    <td className="px-4 py-3">{row.entityType}:{row.entityId ?? "-"}</td>
                    <td className="px-4 py-3">
                      {formatted.details.join(" ") || "No additional details."}
                      {formatted.technicalDetails &&
                      typeof formatted.technicalDetails === "object" &&
                      Object.keys(formatted.technicalDetails).length > 0 ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-muted">
                            Technical details
                          </summary>
                          <pre className="mt-2 max-w-xl overflow-auto whitespace-pre-wrap text-xs text-muted">
                            {JSON.stringify(formatted.technicalDetails, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

