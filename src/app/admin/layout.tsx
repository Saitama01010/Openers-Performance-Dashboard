import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { AppShell } from "@/components/dashboard/app-shell";

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
    <AppShell
      eyebrow="Workspace administration"
      title="Admin console"
      user={user}
    >
      {children}
    </AppShell>
  );
}
