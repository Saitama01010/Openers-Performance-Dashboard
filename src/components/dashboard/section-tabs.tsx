"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { KeyboardEvent } from "react";

export type SectionTab = {
  href: string;
  label: string;
};

export function SectionTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: readonly SectionTab[];
}) {
  const pathname = usePathname();

  function handleKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    const tablist = event.currentTarget.closest('[role="tablist"]');
    const links = Array.from(
      tablist?.querySelectorAll<HTMLAnchorElement>('[role="tab"]') ?? [],
    );
    const currentIndex = links.indexOf(event.currentTarget);
    if (currentIndex < 0 || links.length === 0) return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? links.length - 1
          : event.key === "ArrowLeft"
            ? (currentIndex - 1 + links.length) % links.length
            : (currentIndex + 1) % links.length;
    links[nextIndex]?.focus();
    links[nextIndex]?.click();
  }

  return (
    <nav aria-label={label} className="section-tabs" role="tablist">
      {tabs.map((tab) => {
        const selected = pathname === tab.href;
        return (
          <Link
            aria-selected={selected}
            aria-controls="feature-tab-panel"
            className="section-tabs__tab"
            data-active={selected || undefined}
            href={tab.href}
            key={tab.href}
            onKeyDown={handleKeyDown}
            role="tab"
            tabIndex={selected ? 0 : -1}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
