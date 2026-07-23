import { redirect } from "next/navigation";

import { listAuditLogs } from "@/admin/data";
import { getCurrentUser } from "@/auth/session";

export const dynamic = "force-dynamic";

function fmt(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-US") : "-";
}

function metadata(value: unknown) {
  if (!value) return "-";
  return JSON.stringify(value).slice(0, 320);
}

export default async function AdminAuditPage() {
  const actor = await getCurrentUser();

  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/dashboard");

  const rows = await listAuditLogs(actor);

  return (
    <section className="mx-auto max-w-7xl px-6 py-6">
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
                <th className="px-4 py-3">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-border" key={row.id}>
                  <td className="px-4 py-3">{fmt(row.createdAt)}</td>
                  <td className="px-4 py-3">{row.actorName ?? row.actorProfileId ?? "system"}</td>
                  <td className="px-4 py-3">{row.action}</td>
                  <td className="px-4 py-3">{row.entityType}:{row.entityId ?? "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{metadata(row.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

