import { redirect } from "next/navigation";

import { assertFlagsViewAccess } from "@/auth/feature-access";
import { getCurrentUser } from "@/auth/session";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { FlagsTabs } from "@/components/dashboard/flags/flags-tabs";
import styles from "@/components/dashboard/flags/flags-page.module.css";

export const dynamic = "force-dynamic";

export default async function FlagsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  await assertFlagsViewAccess(actor);

  return (
    <DashboardShell user={actor}>
      <section className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.heading}>
            <span className={styles.eyebrow}>Quality signals</span>
            <h1>Flags</h1>
            <p>Review weekly performance-efficiency and matched Closed-deal flag results in your authorized scope.</p>
          </div>
        </header>
        <FlagsTabs />
        <div aria-label="Selected flag view" id="feature-tab-panel" role="tabpanel" tabIndex={0}>
          {children}
        </div>
      </section>
    </DashboardShell>
  );
}
