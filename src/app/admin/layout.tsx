import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <DashboardShell user={user}>{children}</DashboardShell>
  );
}

