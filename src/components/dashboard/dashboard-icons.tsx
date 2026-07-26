import type { SVGProps } from "react";

export type DashboardIconName =
  | "activity"
  | "audit"
  | "dashboard"
  | "import"
  | "permissions"
  | "teams"
  | "users";

export function DashboardIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: DashboardIconName }) {
  const paths: Record<DashboardIconName, React.ReactNode> = {
    activity: (
      <path d="M3 12h4l2.4-6 4.2 12 2.4-6H21" />
    ),
    audit: (
      <>
        <path d="M7 3h10v4H7z" />
        <path d="M5 5H4v16h16V5h-1" />
        <path d="M8 12h8M8 16h5" />
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
    import: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    permissions: (
      <>
        <path d="M12 3 5 6v5c0 4.7 2.9 8.5 7 10 4.1-1.5 7-5.3 7-10V6z" />
        <path d="m9 12 2 2 4-4" />
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
