import { logoutAction } from "@/auth/actions";
import type { Role } from "@/auth/authorization";
import { SubmitButton } from "@/components/dashboard/action-controls";
import {
  DashboardNavigation,
  type DashboardNavItem,
} from "@/components/dashboard/dashboard-navigation";

const primaryItems: DashboardNavItem[] = [
  { href: "/dashboard", icon: "dashboard", label: "Overview" },
];

const importItem: DashboardNavItem = {
  href: "/import",
  icon: "import",
  label: "Imports",
};

const adminItems: DashboardNavItem[] = [
  { href: "/admin/users", icon: "users", label: "Users & Access" },
  { href: "/admin/teams", icon: "teams", label: "Teams" },
  {
    href: "/admin/permissions",
    icon: "permissions",
    label: "Permissions",
  },
  { href: "/admin/audit", icon: "audit", label: "Audit Log" },
];

function navigationForRole(role: Role) {
  return [
    ...primaryItems,
    ...(role === "agent" ? [] : [importItem]),
    ...(role === "admin" ? adminItems : []),
  ];
}

export function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { email: string; name: string; role: Role };
}) {
  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#dashboard-content">
        Skip to main content
      </a>
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <span aria-hidden="true" className="dashboard-brand__mark">
            O
          </span>
          <span>
            <span className="dashboard-brand__name">Openers</span>
            <span className="dashboard-brand__product">Performance</span>
          </span>
        </div>

        <DashboardNavigation items={navigationForRole(user.role)} />

        <div className="dashboard-profile">
          <span
            aria-hidden="true"
            className="dashboard-profile__avatar"
          >
            {user.name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join("")}
          </span>
          <span className="dashboard-profile__identity">
            <span className="dashboard-profile__name">{user.name}</span>
            <span className="dashboard-profile__role">{user.role}</span>
          </span>
          <form action={logoutAction}>
            <SubmitButton
              aria-label="Sign out"
              className="dashboard-profile__signout"
              pendingLabel="Signing out"
              variant="ghost"
            >
              Sign out
            </SubmitButton>
          </form>
        </div>
      </aside>

      <div className="dashboard-workspace">
        <div className="dashboard-topbar">
          <div>
            <p className="dashboard-topbar__eyebrow">Operations workspace</p>
            <p className="dashboard-topbar__context">
              Secure, role-scoped performance reporting
            </p>
          </div>
          <span className="dashboard-topbar__role">
            {user.role} access
          </span>
        </div>
        <main id="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
