import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getAdminTeamStats,
  listAdminTeamsDirectory,
  resolveAdminTeamDirectoryFilters,
} from "@/admin/teams";
import { getCurrentUser } from "@/auth/session";
import { AdminTeamsWorkspace } from "@/components/admin/admin-teams-workspace";
import styles from "@/components/admin/teams-admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const filters = resolveAdminTeamDirectoryFilters(params);
  const [stats, directory] = await Promise.all([
    getAdminTeamStats(actor),
    listAdminTeamsDirectory(actor, filters),
  ]);

  return (
    <section className={`dashboard-page ${styles.page}`}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Administration</p>
          <h1>Teams</h1>
          <p>Create reporting teams and maintain active manager and agent assignments.</p>
        </div>
        <Link className={styles.buttonSecondary} href="/teams/performance">
          View team performance
        </Link>
      </header>
      <AdminTeamsWorkspace
        directory={{
          ...directory,
          rows: directory.rows.map((row) => ({
            ...row,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          })),
        }}
        filters={filters}
        stats={stats}
      />
    </section>
  );
}
