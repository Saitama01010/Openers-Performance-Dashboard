import type { Role } from "@/auth/authorization";
import type { DashboardNavItem } from "@/components/dashboard/dashboard-navigation";

const primaryItems: DashboardNavItem[] = [
  { href: "/dashboard", icon: "dashboard", label: "Overview" },
  { href: "/performance", icon: "performance", label: "Performance" },
  { href: "/leaderboard", icon: "leaderboard", label: "LeaderBoard" },
  { href: "/agents", icon: "agent", label: "Agents" },
  {
    href: "/teams/performance",
    icon: "teams",
    label: "Team performance",
  },
];

const importItem: DashboardNavItem = {
  href: "/import",
  icon: "import",
  label: "Imports",
};

const coachingItem: DashboardNavItem = {
  href: "/coaching",
  icon: "coaching",
  label: "Coaching Sessions",
};

const flagsItem: DashboardNavItem = {
  href: "/flags",
  icon: "flag",
  label: "Flags",
};

const commissionsItem: DashboardNavItem = {
  href: "/commissions",
  icon: "commissions",
  label: "Commissions",
};

const adminItems: DashboardNavItem[] = [
  { href: "/admin/imports", icon: "freshness", label: "Import history" },
  { href: "/admin/users", icon: "users", label: "Users & access" },
  { href: "/admin/teams", icon: "teams", label: "Teams" },
  {
    href: "/admin/permissions",
    icon: "permissions",
    label: "Permissions",
  },
  { href: "/admin/audit", icon: "audit", label: "Audit log" },
];

export function navigationForRole(role: Role, userId: string) {
  const workspaceItems =
    role === "agent"
      ? [
          primaryItems[0],
          primaryItems[1],
          primaryItems[2],
          {
            href: `/agents/${userId}`,
            icon: "agent" as const,
            label: "My performance",
          },
          flagsItem,
          commissionsItem,
        ]
      : [
          ...primaryItems,
          coachingItem,
          flagsItem,
          commissionsItem,
          ...(role === "admin" ? [importItem] : []),
        ];

  return [
    { label: "Workspace", items: workspaceItems },
    ...(role === "admin"
      ? [{ label: "Administration", items: adminItems }]
      : []),
  ];
}
