import type { SVGProps } from "react";

export type IconName =
  | "activity"
  | "agents"
  | "arrow-up-right"
  | "audit"
  | "calendar"
  | "chart"
  | "check"
  | "chevron-down"
  | "clock"
  | "database"
  | "download"
  | "filter"
  | "grid"
  | "import"
  | "logout"
  | "menu"
  | "pulse"
  | "search"
  | "settings"
  | "sparkles"
  | "team"
  | "users"
  | "x";

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
};

export function Icon({ name, ...props }: IconProps) {
  const paths: Record<IconName, React.ReactNode> = {
    activity: (
      <path d="M4 12h3l2.1-5 3.7 10 2.2-5H20" />
    ),
    agents: (
      <>
        <circle cx="12" cy="7.5" r="3.5" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </>
    ),
    "arrow-up-right": (
      <>
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </>
    ),
    audit: (
      <>
        <path d="M6 3h12v18H6z" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    "chevron-down": <path d="m7 10 5 5 5-5" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5.5" rx="8" ry="3.5" />
        <path d="M4 5.5v6c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-6M4 11.5v6c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-6" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    filter: <path d="M4 5h16l-6 7v6l-4 2v-8z" />,
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    import: (
      <>
        <path d="M12 3v12M7 10l5 5 5-5" />
        <path d="M4 19h16" />
      </>
    ),
    logout: (
      <>
        <path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    pulse: (
      <>
        <path d="M3 12h4l2-5 4 10 2-5h6" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1 1.6v.2h-4V21a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1-2.8-2.8.1-.1a1.8 1.8 0 0 0 .4-2A1.8 1.8 0 0 0 3 14H2.8v-4H3a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.4-2l-.1-.1 2.8-2.8.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 10 3V2.8h4V3a1.8 1.8 0 0 0 1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1 2.8 2.8-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.6 1h.2v4H21a1.8 1.8 0 0 0-1.6 1Z" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 1.1 3.4L16.5 8l-3.4 1.1L12 12.5l-1.1-3.4L7.5 8l3.4-1.6zM18.5 14l.7 2.2 2.3.8-2.3.8-.7 2.2-.8-2.2-2.2-.8 2.2-.8zM5.5 13l.7 2.2 2.3.8-2.3.8L5.5 19l-.8-2.2-2.2-.8 2.2-.8z" />
      </>
    ),
    team: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="10" r="2.5" />
        <path d="M3 20a6 6 0 0 1 12 0M14 15.5a5 5 0 0 1 7 4.5" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M16 4.5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 4.9" />
      </>
    ),
    x: <path d="m6 6 12 12M18 6 6 18" />,
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="24"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 44 44"
    >
      <defs>
        <linearGradient id="brand-blue" x1="5" x2="37" y1="7" y2="35">
          <stop stopColor="#168BFF" />
          <stop offset="1" stopColor="#39D8F2" />
        </linearGradient>
        <linearGradient id="brand-teal" x1="8" x2="36" y1="37" y2="8">
          <stop stopColor="#2DD4BF" />
          <stop offset="1" stopColor="#39D8F2" />
        </linearGradient>
      </defs>
      <circle cx="22" cy="22" fill="#081321" r="21" />
      <path
        d="M10 24.5A13 13 0 0 1 31.8 15"
        stroke="url(#brand-blue)"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <path
        d="M34 19.5A13 13 0 0 1 12.2 29"
        stroke="url(#brand-teal)"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <circle cx="22" cy="22" fill="#EAFBFF" r="3" />
    </svg>
  );
}
