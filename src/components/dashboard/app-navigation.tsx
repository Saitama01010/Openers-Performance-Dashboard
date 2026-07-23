"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Role } from "@/auth/authorization";
import { BrandMark, Icon, type IconName } from "@/components/dashboard/icon";

type NavigationItem = {
  href: string;
  label: string;
  icon: IconName;
  roles: Role[];
};

const workspaceItems: NavigationItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: "grid",
    roles: ["admin", "manager", "agent"],
  },
  {
    href: "/dashboard#performance",
    label: "Performance",
    icon: "chart",
    roles: ["admin", "manager", "agent"],
  },
  {
    href: "/dashboard#agents",
    label: "Agents",
    icon: "agents",
    roles: ["admin", "manager"],
  },
  {
    href: "/dashboard#team-comparison",
    label: "Team performance",
    icon: "team",
    roles: ["admin", "manager"],
  },
  {
    href: "/import",
    label: "Imports",
    icon: "import",
    roles: ["admin", "manager"],
  },
];

const administrationItems: NavigationItem[] = [
  {
    href: "/admin/users",
    label: "Users & access",
    icon: "users",
    roles: ["admin"],
  },
  {
    href: "/admin/teams",
    label: "Teams",
    icon: "team",
    roles: ["admin"],
  },
  {
    href: "/admin/audit",
    label: "Audit log",
    icon: "audit",
    roles: ["admin"],
  },
];

function NavItems({
  role,
  onNavigate,
}: {
  role: Role;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  function renderItems(items: NavigationItem[]) {
    return items
      .filter((item) => item.roles.includes(role))
      .map((item) => {
        const path = item.href.split("#")[0];
        const isHashLink = item.href.includes("#");
        const isActive =
          !isHashLink &&
          (pathname === path ||
            (path.startsWith("/admin/") && pathname.startsWith(path)));

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive
                ? "bg-primary/13 text-white shadow-[inset_0_0_0_1px_rgba(57,216,242,.12)]"
                : "text-muted-strong hover:bg-white/[0.045] hover:text-white"
            }`}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            {isActive ? (
              <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-cyan to-teal shadow-[0_0_12px_rgba(57,216,242,.8)]" />
            ) : null}
            <Icon
              className={`size-[18px] transition ${
                isActive
                  ? "text-cyan"
                  : "text-muted group-hover:text-cyan"
              }`}
              name={item.icon}
            />
            <span>{item.label}</span>
          </Link>
        );
      });
  }

  return (
    <nav aria-label="Primary navigation" className="flex-1 px-3 py-5">
      <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">
        Workspace
      </p>
      <div className="space-y-1">{renderItems(workspaceItems)}</div>
      {role === "admin" ? (
        <>
          <p className="mt-7 mb-2 px-3 text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">
            Administration
          </p>
          <div className="space-y-1">{renderItems(administrationItems)}</div>
        </>
      ) : null}
    </nav>
  );
}

function SidebarContent({
  role,
  onNavigate,
}: {
  role: Role;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-20 items-center border-b border-white/[0.06] px-5">
        <Link
          className="flex items-center gap-3 rounded-lg focus-visible:outline-offset-4"
          href="/dashboard"
          onClick={onNavigate}
        >
          <BrandMark className="size-10 shrink-0 drop-shadow-[0_0_16px_rgba(22,139,255,.3)]" />
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.02em] text-white">
              Openers
            </p>
            <p className="text-[10px] font-medium tracking-[0.16em] text-muted uppercase">
              Performance
            </p>
          </div>
        </Link>
      </div>
      <NavItems onNavigate={onNavigate} role={role} />
      <div className="p-4">
        <div className="rounded-2xl border border-cyan/10 bg-gradient-to-br from-primary/[0.09] to-teal/[0.035] p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-strong">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal opacity-50" />
              <span className="relative inline-flex size-2 rounded-full bg-teal" />
            </span>
            Secure workspace
          </div>
          <p className="mt-2 text-[11px] leading-4 text-muted">
            Role-scoped access is enforced on the server.
          </p>
        </div>
      </div>
    </>
  );
}

export function AppNavigation({ role }: { role: Role }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/[0.065] bg-[#07101c]/95 backdrop-blur-xl lg:flex">
      <SidebarContent role={role} />
    </aside>
  );
}

export function MobileNavigation({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const closeNavigation = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => closeButtonRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeNavigation();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeNavigation, open]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-label="Open navigation"
        className="grid size-10 place-items-center rounded-xl border border-border bg-surface-raised text-muted-strong transition hover:border-border-strong hover:text-white lg:hidden"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <Icon className="size-5" name="menu" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeNavigation}
            type="button"
          />
          <aside
            aria-label="Mobile navigation"
            aria-modal="true"
            className="relative flex h-full w-[min(86vw,20rem)] flex-col border-r border-border bg-[#07101c] shadow-2xl"
            role="dialog"
          >
            <button
              aria-label="Close navigation"
              className="absolute top-5 right-4 z-10 grid size-9 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-white"
              onClick={closeNavigation}
              ref={closeButtonRef}
              type="button"
            >
              <Icon className="size-5" name="x" />
            </button>
            <SidebarContent onNavigate={closeNavigation} role={role} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
