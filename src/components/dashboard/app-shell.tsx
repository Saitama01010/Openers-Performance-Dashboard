import Link from "next/link";

import { logoutAction } from "@/auth/actions";
import type { Role } from "@/auth/authorization";
import {
  AppNavigation,
  MobileNavigation,
} from "@/components/dashboard/app-navigation";
import { Icon } from "@/components/dashboard/icon";

type ShellUser = {
  name: string;
  email: string;
  role: Role;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function AppShell({
  children,
  eyebrow,
  title,
  user,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  user: ShellUser;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNavigation role={user.role} />
      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-white/[0.065] bg-background/82 backdrop-blur-xl">
          <div className="flex h-20 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <MobileNavigation role={user.role} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold tracking-[0.15em] text-cyan/80 uppercase">
                {eyebrow}
              </p>
              <h1 className="truncate text-lg font-semibold tracking-[-0.025em] text-white sm:text-xl">
                {title}
              </h1>
            </div>

            {user.role !== "agent" ? (
              <Link
                className="hidden items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3.5 py-2.5 text-sm font-semibold text-cyan transition hover:border-cyan/30 hover:bg-primary/15 sm:flex"
                href="/import"
              >
                <Icon className="size-4" name="import" />
                Import data
              </Link>
            ) : null}

            <div className="hidden h-9 w-px bg-border sm:block" />
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-teal text-xs font-bold text-white shadow-[0_8px_24px_rgba(22,139,255,.22)]">
                {initials(user.name)}
              </div>
              <div className="hidden min-w-0 md:block">
                <p className="max-w-36 truncate text-sm font-semibold text-white">
                  {user.name}
                </p>
                <p className="text-[11px] font-medium text-muted capitalize">
                  {user.role} workspace
                </p>
              </div>
            </div>
            <form action={logoutAction}>
              <button
                aria-label="Sign out"
                className="grid size-9 place-items-center rounded-xl text-muted transition hover:bg-white/[0.05] hover:text-white"
                title="Sign out"
                type="submit"
              >
                <Icon className="size-[18px]" name="logout" />
              </button>
            </form>
          </div>
        </header>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
