"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  DashboardIcon,
  type DashboardIconName,
} from "@/components/dashboard/dashboard-icons";

export type DashboardNavItem = {
  href: string;
  icon: DashboardIconName;
  label: string;
};

export function isNavigationItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNavigation({
  label = "Dashboard navigation",
  items,
  onNavigate,
}: {
  label?: string;
  items: DashboardNavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="dashboard-nav">
      {items.map((item) => {
        const active = isNavigationItemActive(pathname, item.href);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className="dashboard-nav__link"
            data-active={active || undefined}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            <DashboardIcon className="dashboard-nav__icon" name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
