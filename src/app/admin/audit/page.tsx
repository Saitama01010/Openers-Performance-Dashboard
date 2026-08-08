import { redirect } from "next/navigation";

import { getAdminAuditStats, listAdminAuditEvents, resolveAdminAuditFilters } from "@/admin/audit";
import { getCurrentUser } from "@/auth/session";
import { AdminAuditWorkspace } from "@/components/admin/admin-audit-workspace";
import styles from "@/components/admin/audit-admin.module.css";
import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const now = new Date();
  const timeZone = getEnv().GOOGLE_SHEETS_TIMEZONE;
  const filters = resolveAdminAuditFilters(params, now, timeZone);
  const [stats, data] = await Promise.all([
    getAdminAuditStats(actor, filters, { now, timeZone }),
    listAdminAuditEvents(actor, filters, { now, timeZone }),
  ]);

  return (
    <section className={`dashboard-page ${styles.page}`}>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>Administration</p>
        <h1>Audit log</h1>
        <p>Review human-readable administrative and import events. Technical evidence remains available on demand.</p>
      </header>
      <AdminAuditWorkspace
        key={`${filters.range}:${filters.from}:${filters.to}`}
        data={{
          ...data,
          rows: data.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        }}
        filters={{
          query: filters.query, range: filters.range, from: filters.from, to: filters.to,
          actorId: filters.actorId, action: filters.action, targetType: filters.targetType,
          category: filters.category, page: filters.page, pageSize: filters.pageSize,
          direction: filters.direction, focus: filters.focus, dateLabel: filters.dateRange.label,
        }}
        now={now.toISOString()}
        stats={stats}
        timeZone={timeZone}
      />
    </section>
  );
}
