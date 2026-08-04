import { redirect } from "next/navigation";

import { assertCoachingViewAccess } from "@/auth/feature-access";
import { getCurrentUser } from "@/auth/session";
import { PageHeader } from "@/components/dashboard/dashboard-primitives";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SectionTabs } from "@/components/dashboard/section-tabs";

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

  const tabs = [
    ...(actor.role === "admin"
      ? [{ href: "/coaching/leaderboard", label: "Leaderboard" }]
      : []),
    { href: "/coaching/room", label: "Coaching Room" },
    { href: "/coaching/improvement", label: "Improvement" },
  ];

  return (
    <DashboardShell user={actor}>
      <section className="dashboard-page feature-page">
        <PageHeader
          description="Track coaching coverage, record sessions, and measure outcomes with role-scoped data."
          eyebrow="Development"
          title="Coaching Sessions"
        />
        <SectionTabs label="Coaching Sessions views" tabs={tabs} />
        <div aria-label="Selected coaching view" id="feature-tab-panel" role="tabpanel" tabIndex={0}>
          {children}
        </div>
      </section>
    </DashboardShell>
  );
}
