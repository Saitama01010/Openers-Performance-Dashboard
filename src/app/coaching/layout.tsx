import { redirect } from "next/navigation";

import { assertCoachingViewAccess } from "@/auth/feature-access";
import { getCurrentUser } from "@/auth/session";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { CoachingTabs } from "@/components/dashboard/coaching/coaching-tabs";
import styles from "@/components/dashboard/coaching/coaching-page.module.css";

export const dynamic = "force-dynamic";

export default async function CoachingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (actor.role === "agent") redirect("/flags");
  await assertCoachingViewAccess(actor);

  return (
    <DashboardShell user={actor}>
      <section className={styles.page}>
        <header className={styles.header}>
          <div className={styles.heading}>
            <span className={styles.eyebrow}>Coaching</span>
            <h1>Coaching Sessions</h1>
            <p>Track coverage, record grouped sessions, and measure outcomes within your authorized reporting scope.</p>
          </div>
        </header>
        <CoachingTabs showLeaderboard={actor.role === "admin"} />
        <div aria-label="Selected coaching view" className={styles.content} id="coaching-tab-panel" role="tabpanel" tabIndex={0}>
          {children}
        </div>
      </section>
    </DashboardShell>
  );
}
