"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import styles from "@/components/dashboard/flags/flags-page.module.css";

const tabs = [
  { href: "/flags/performance", label: "Performance Flags" },
  { href: "/flags/transfers", label: "Transfer Flags" },
];

export function FlagsTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preserved = new URLSearchParams();
  for (const key of ["range", "from", "to"]) {
    const value = searchParams.get(key);
    if (value) preserved.set(key, value);
  }
  return (
    <nav aria-label="Flag views" className={styles.tabs} role="tablist">
      {tabs.map((tab) => {
        const selected = pathname === tab.href;
        const query = preserved.toString();
        return (
          <Link
            aria-controls="feature-tab-panel"
            aria-selected={selected}
            href={`${tab.href}${query ? `?${query}` : ""}`}
            key={tab.href}
            role="tab"
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
