"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
import {
  RexMascot,
  RexToggle,
} from "@/components/dashboard/rex-mascot";
import { roleLabel } from "@/presentation/labels";

type NavigationGroup = {
  items: DashboardNavItem[];
  label: string;
};

const routeNames: Array<[prefix: string, label: string]> = [
  ["/commissions", "Commissions"],
  ["/coaching", "Coaching Sessions"],
  ["/flags", "Flags"],
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
    <Link
      aria-label="Openers Performance overview"
      className="dashboard-brand"
      href="/dashboard"
    >
      <span aria-hidden="true" className="dashboard-brand__image-frame">
        <Image
          alt=""
          className="dashboard-brand__image"
          height={1080}
          loading="eager"
          src="/brand/openers-performance-logo.png"
          width={1080}
        />
      </span>
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
        <span className="dashboard-profile__name" title={user.name}>
          {user.name}
        </span>
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

type PageSearchCandidate = {
  id: string;
  label: string;
};

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));
}

function ShellSearch({ navigation }: { navigation: NavigationGroup[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageCandidates, setPageCandidates] = useState<PageSearchCandidate[]>([]);
  const navCandidates = useMemo(
    () => navigation.flatMap((group) => group.items.map((item) => ({
      href: item.href,
      id: `nav:${item.href}`,
      label: item.label,
      type: "Navigation" as const,
    }))),
    [navigation],
  );

  useEffect(() => {
    const scan = () => setPageCandidates(
      Array.from(document.querySelectorAll<HTMLElement>("[data-overview-search-label][id]"))
        .map((element) => ({ id: element.id, label: element.dataset.overviewSearchLabel ?? "" }))
        .filter((candidate) => candidate.label),
    );
    const frame = requestAnimationFrame(scan);
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      } else if (event.key === "/" && !isTypingTarget(event.target)) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const normalized = query.trim().toLowerCase();
  const results = [
    ...pageCandidates.map((candidate) => ({ ...candidate, type: "This page" as const })),
    ...navCandidates,
  ].filter((candidate) => !normalized || candidate.label.toLowerCase().includes(normalized)).slice(0, 8);

  function choose(index: number) {
    const result = results[index];
    if (!result) return;
    setOpen(false);
    setQuery("");
    if ("href" in result) {
      router.push(result.href);
      return;
    }
    const element = document.getElementById(result.id);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!element.matches("button, a, input, select, textarea, [tabindex]")) {
      element.tabIndex = -1;
    }
    element.focus({ preventScroll: true });
    element.animate(
      [{ boxShadow: "0 0 0 0 rgb(31 94 255 / 0)" }, { boxShadow: "0 0 0 4px rgb(31 94 255 / .22)" }, { boxShadow: "0 0 0 0 rgb(31 94 255 / 0)" }],
      { duration: 900 },
    );
  }

  return (
    <div className="dashboard-search">
      <DashboardIcon name="search" />
      <input
        aria-activedescendant={open && results[activeIndex] ? `dashboard-search-result-${activeIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls="dashboard-search-results"
        aria-expanded={open}
        aria-label="Search this page and navigation"
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((value) => Math.min(results.length - 1, value + 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((value) => Math.max(0, value - 1)); }
          if (event.key === "Enter") { event.preventDefault(); choose(activeIndex); }
          if (event.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
        }}
        placeholder="Search this page or navigation…"
        ref={inputRef}
        role="combobox"
        value={query}
      />
      <kbd>⌘K</kbd>
      {open ? (
        <div className="dashboard-search__results" id="dashboard-search-results" role="listbox">
          {results.length ? results.map((result, index) => (
            <button
              aria-selected={activeIndex === index}
              id={`dashboard-search-result-${index}`}
              key={result.id}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
              role="option"
              type="button"
            >
              <DashboardIcon name={result.type === "Navigation" ? "arrowRight" : "search"} />
              <span><strong>{result.label}</strong><small>{result.type}</small></span>
            </button>
          )) : <p>No matching overview items or destinations.</p>}
        </div>
      ) : null}
    </div>
  );
}

type AttentionItem = { count: number; href: string; title: string };

function AttentionMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AttentionItem[]>([]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>("[data-attention-title]"));
      const byTitle = new Map<string, AttentionItem>();
      for (const candidate of candidates) {
        const title = candidate.dataset.attentionTitle;
        const count = Number(candidate.dataset.attentionCount ?? 0);
        if (!title || count <= 0 || byTitle.has(title)) continue;
        byTitle.set(title, { count, href: candidate.dataset.attentionHref ?? "#dashboard-content", title });
      }
      setItems(Array.from(byTitle.values()));
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
  return (
    <div className="dashboard-attention">
      <button aria-expanded={open} aria-label={`${items.length} operational attention categories`} className="dashboard-icon-button ui-button--sweep" onClick={() => setOpen((value) => !value)} type="button">
        <DashboardIcon name="bell" />
        {items.length ? <span>{items.length}</span> : null}
      </button>
      {open ? <div className="dashboard-attention__popover"><strong>Operational attention</strong>{items.length ? items.map((item) => <Link href={item.href} key={item.title} onClick={() => setOpen(false)}><span>{item.title}</span><b>{item.count}</b></Link>) : <p>No current attention categories on this page.</p>}</div> : null}
    </div>
  );
}

function TopUserMenu({ user }: { user: { email: string; name: string; role: Role } }) {
  const [open, setOpen] = useState(false);
  const initialsValue = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return (
    <div className="dashboard-user-menu">
      <button aria-expanded={open} className="dashboard-user-menu__trigger" onClick={() => setOpen((value) => !value)} type="button">
        <span className="dashboard-user-menu__avatar">{initialsValue}</span>
        <span><strong>{user.name}</strong><small>{roleLabel(user.role)}</small></span>
        <DashboardIcon name="chevronDown" />
      </button>
      {open ? <div className="dashboard-user-menu__popover"><p>{user.email}</p><span>{roleLabel(user.role)} access</span><form action={logoutAction}><SubmitButton pendingLabel="Signing out"><DashboardIcon name="signOut" />Sign out</SubmitButton></form></div> : null}
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
          <div
            aria-hidden="true"
            className="dashboard-topbar__rex-lane"
            data-rex-navbar-lane
          />
          <ShellSearch navigation={navigation} />
          <div className="dashboard-topbar__actions">
            {user.role !== "agent" ? (
              <Link className="dashboard-topbar__import ui-button ui-button--secondary ui-button--sweep" href="/import">
                <DashboardIcon name="import" />
                <span>Import data</span>
              </Link>
            ) : null}
            <RexToggle />
            <AttentionMenu />
            <TopUserMenu user={user} />
          </div>
        </header>
        <main id="dashboard-content">{children}</main>
      </div>
      <RexMascot />
    </div>
  );
}
