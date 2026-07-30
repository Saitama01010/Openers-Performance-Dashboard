import type { SVGProps } from "react";

export type DashboardIconName =
  | "activity"
  | "agent"
  | "arrowRight"
  | "audit"
  | "calendar"
  | "calls"
  | "close"
  | "dashboard"
  | "freshness"
  | "import"
  | "info"
  | "leaderboard"
  | "menu"
  | "pause"
  | "performance"
  | "permissions"
  | "ringing"
  | "search"
  | "talk"
  | "teams"
  | "untracked"
  | "users";

export function DashboardIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: DashboardIconName }) {
  const paths: Record<DashboardIconName, React.ReactNode> = {
    activity: (
      <path d="M3 12h4l2.4-6 4.2 12 2.4-6H21" />
    ),
    agent: (
      <>
        <circle cx="12" cy="8" r="3.25" />
        <path d="M5.5 20c0-4.1 2.9-6.5 6.5-6.5s6.5 2.4 6.5 6.5" />
      </>
    ),
    arrowRight: (
      <>
        <path d="M5 12h14" />
        <path d="m14 7 5 5-5 5" />
      </>
    ),
    audit: (
      <>
        <path d="M7 3h10v4H7z" />
        <path d="M5 5H4v16h16V5h-1" />
        <path d="M8 12h8M8 16h5" />
      </>
    ),
    calendar: (
      <>
        <rect height="16" rx="2" width="18" x="3" y="5" />
        <path d="M8 3v4M16 3v4M3 10h18" />
      </>
    ),
    calls: (
      <path d="M6.6 3.5 9.3 6.2 7.6 9c1.4 3 3.7 5.3 6.7 6.7l2.8-1.7 2.7 2.7-1.6 3c-.4.8-1.3 1.2-2.2 1C9.5 19.3 4.5 14.4 3.2 7.9c-.2-.9.2-1.8 1-2.2z" />
    ),
    close: (
      <>
        <path d="m6 6 12 12" />
        <path d="M18 6 6 18" />
      </>
    ),
    dashboard: (
      <>
        <rect height="7" rx="1" width="7" x="3" y="3" />
        <rect height="7" rx="1" width="7" x="14" y="3" />
        <rect height="7" rx="1" width="7" x="3" y="14" />
        <rect height="7" rx="1" width="7" x="14" y="14" />
      </>
    ),
    freshness: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.5 1.5" />
      </>
    ),
    import: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 8h.01" />
      </>
    ),
    leaderboard: (
      <>
        <path d="M8 21h8M12 17v4" />
        <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
        <path d="M7 6H4v1a4 4 0 0 0 4 4M17 6h3v1a4 4 0 0 1-4 4" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    pause: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9v6M14.5 9v6" />
      </>
    ),
    performance: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="m7 15 4-4 3 2 5-6" />
      </>
    ),
    permissions: (
      <>
        <path d="M12 3 5 6v5c0 4.7 2.9 8.5 7 10 4.1-1.5 7-5.3 7-10V6z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    ringing: (
      <>
        <path d="M7 16h10l-1.5-2.2V10a3.5 3.5 0 0 0-7 0v3.8z" />
        <path d="M10 19h4" />
        <path d="M5.5 8.5A7 7 0 0 1 7 5.7M18.5 8.5A7 7 0 0 0 17 5.7" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 4 4" />
      </>
    ),
    talk: (
      <>
        <path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.8 8.8 0 0 1-3.2-.6L4 20l1.5-4.1A7.2 7.2 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z" />
        <path d="M8.5 11.5h7" />
      </>
    ),
    teams: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2" />
        <path d="M3 20c0-4 2.7-6 6-6s6 2 6 6" />
        <path d="M15 15c3 0 5 1.7 5 5" />
      </>
    ),
    untracked: (
      <>
        <path d="M5 4h14l-5 7v7l-4 2v-9z" />
      </>
    ),
    users: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-5 3.6-8 8-8s8 3 8 8" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="20"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
