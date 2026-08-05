import { redirect } from "next/navigation";

import { assertFlagsViewAccess } from "@/auth/feature-access";
import { getCurrentUser } from "@/auth/session";
import { PageHeader } from "@/components/dashboard/dashboard-primitives";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SectionTabs } from "@/components/dashboard/section-tabs";

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
      <section className="dashboard-page feature-page">
        <PageHeader
          description="Review weekly performance-efficiency and matched Closed-deal flag results in your authorized scope."
          eyebrow="Quality signals"
          title="Flags"
        />
        <SectionTabs
          label="Flag views"
          tabs={[
            { href: "/flags/performance", label: "Performance Flags" },
            { href: "/flags/transfers", label: "Transfer Flags" },
          ]}
        />
        <div aria-label="Selected flag view" id="feature-tab-panel" role="tabpanel" tabIndex={0}>
          {children}
        </div>
      </section>
    </DashboardShell>
  );
}
