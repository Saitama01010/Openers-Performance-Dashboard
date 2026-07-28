"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { logoutAction } from "@/auth/actions";
import type { Role } from "@/auth/authorization";
import { SubmitButton } from "@/components/dashboard/action-controls";
import {
  DashboardIcon,
} from "@/components/dashboard/dashboard-icons";
import {
  DashboardNavigation,
  type DashboardNavItem,
} from "@/components/dashboard/dashboard-navigation";
import { roleLabel } from "@/presentation/labels";

type NavigationGroup = {
  items: DashboardNavItem[];
  label: string;
};

const routeNames: Array<[prefix: string, label: string]> = [
  ["/leaderboard", "LeaderBoard"],
  ["/admin/imports", "Import history"],
  ["/admin/users", "Users & access"],
  ["/admin/teams", "Teams"],
  ["/admin/permissions", "Permissions"],
  ["/admin/audit", "Audit log"],
  ["/teams/performance", "Team performance"],
  ["/performance", "Performance"],
  ["/agents", "Agents"],
  ["/import", "Import data"],
  ["/dashboard", "Overview"],
];

function pageName(pathname: string) {
  return (
    routeNames.find(([prefix]) => pathname.startsWith(prefix))?.[1] ??
    "Openers"
  );
}

function Brand() {
  return (
    <Link className="dashboard-brand" href="/dashboard">
      <svg
        aria-hidden="true"
        className="dashboard-brand__mark"
        fill="none"
        viewBox="0 0 32 32"
      >
        <path d="m5 16 8-10 5 4-5 6 5 6-5 4z" />
        <path d="m15 16 7-9 5 4-4 5 4 5-5 4z" />
      </svg>
      <span>
        <span className="dashboard-brand__name">Openers</span>
        <span className="dashboard-brand__product">Performance</span>
      </span>
    </Link>
  );
}

function UserProfile({
  user,
}: {
  user: { email: string; name: string; role: Role };
}) {
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="dashboard-profile">
      <span aria-hidden="true" className="dashboard-profile__avatar">
        {initials}
      </span>
      <span className="dashboard-profile__identity">
        <span className="dashboard-profile__name">{user.name}</span>
        <span className="dashboard-profile__role">
          {roleLabel(user.role)}
        </span>
      </span>
      <form action={logoutAction}>
        <SubmitButton
          aria-label={`Sign out ${user.name}`}
          className="dashboard-profile__signout"
          pendingLabel="Signing out"
          variant="ghost"
        >
          Sign out
        </SubmitButton>
      </form>
    </div>
  );
}

function SidebarContent({
  navigation,
  onNavigate,
  user,
}: {
  navigation: NavigationGroup[];
  onNavigate?: () => void;
  user: { email: string; name: string; role: Role };
}) {
  return (
    <>
      <Brand />
      <div className="dashboard-nav-groups">
        {navigation.map((group) => (
          <section className="dashboard-nav-group" key={group.label}>
            <p className="dashboard-nav-group__label">{group.label}</p>
            <DashboardNavigation
              items={group.items}
              label={`${group.label} navigation`}
              onNavigate={onNavigate}
            />
          </section>
        ))}
      </div>
      <UserProfile user={user} />
    </>
  );
}

export function DashboardShellClient({
  children,
  navigation,
  user,
}: {
  children: React.ReactNode;
  navigation: NavigationGroup[];
  user: { email: string; name: string; role: Role };
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;

    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() =>
      closeButtonRef.current?.focus(),
    );

    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  function closeDrawer() {
    setDrawerOpen(false);
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  function openDrawer() {
    setDrawerOpen(true);
  }

  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#dashboard-content">
        Skip to main content
      </a>

      <aside className="dashboard-sidebar dashboard-sidebar--desktop">
        <SidebarContent navigation={navigation} user={user} />
      </aside>

      <dialog
        aria-label="Application navigation"
        aria-modal="true"
        className="dashboard-drawer"
        open={drawerOpen}
        onCancel={(event) => {
          event.preventDefault();
          closeDrawer();
        }}
        onClick={(event) => {
          if (event.currentTarget === event.target) closeDrawer();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeDrawer();
            return;
          }

          if (event.key !== "Tab") return;
          const focusable = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          );
          const first = focusable[0];
          const last = focusable.at(-1);
          if (!first || !last) return;

          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        ref={drawerRef}
      >
        <aside className="dashboard-sidebar dashboard-sidebar--drawer">
          <button
            aria-label="Close navigation"
            className="dashboard-icon-button dashboard-drawer__close"
            onClick={closeDrawer}
            ref={closeButtonRef}
            type="button"
          >
            <DashboardIcon name="close" />
          </button>
          <SidebarContent
            navigation={navigation}
            onNavigate={closeDrawer}
            user={user}
          />
        </aside>
      </dialog>

      <div className="dashboard-workspace">
        <header className="dashboard-topbar">
          <div className="dashboard-topbar__leading">
            <button
              aria-label="Open navigation"
              className="dashboard-icon-button dashboard-menu-button"
              onClick={openDrawer}
              ref={menuButtonRef}
              type="button"
            >
              <DashboardIcon name="menu" />
            </button>
            <div>
              <p className="dashboard-topbar__eyebrow">Openers</p>
              <p className="dashboard-topbar__context">{pageName(pathname)}</p>
            </div>
          </div>
          <div className="dashboard-topbar__actions">
            {user.role !== "agent" ? (
              <Link className="ui-button ui-button--secondary" href="/import">
                <DashboardIcon name="import" />
                <span>Import data</span>
              </Link>
            ) : null}
            <span className="dashboard-topbar__role">
              {roleLabel(user.role)} access
            </span>
          </div>
        </header>
        <main id="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
