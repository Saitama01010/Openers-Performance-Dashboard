import { DashboardShellClient } from "@/components/dashboard/dashboard-shell-client";
import { navigationForRole } from "@/components/dashboard/dashboard-navigation-config";
import type { Role } from "@/auth/authorization";

export function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { email: string; id: string; name: string; role: Role };
}) {
  return (
    <DashboardShellClient
      navigation={navigationForRole(user.role, user.id)}
      user={user}
    >
      {children}
    </DashboardShellClient>
  );
}
