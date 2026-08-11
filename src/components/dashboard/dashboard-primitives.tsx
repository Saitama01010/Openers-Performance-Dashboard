import type { ReactNode } from "react";

import { Badge } from "@/components/ui/base-badge";
import { GhostPageLoader } from "@/components/ui/ghost-page-loader";

export function PageHeader({
  actions,
  description,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="page-header__eyebrow">{eyebrow}</p> : null}
        <h1 className="page-header__title">{title}</h1>
        {description ? (
          <p className="page-header__description">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function StatusBanner({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "danger" | "info" | "success" | "warning";
}) {
  return (
    <div
      className={`status-banner status-banner--${tone}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      <span aria-hidden="true" className="status-banner__marker" />
      <div>{children}</div>
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "danger" | "info" | "neutral" | "success" | "warning";
}) {
  const variant = tone === "danger" ? "destructive" : tone === "neutral" ? "secondary" : tone;
  return <Badge appearance="light" shape="circle" size="sm" variant={variant}>{children}</Badge>;
}

export function TableScroll({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      aria-label={`${label}. Scroll horizontally to view all columns.`}
      className="table-scroll"
      role="region"
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export function EmptyTableRow({
  colSpan,
  description,
  title,
}: {
  colSpan: number;
  description?: string;
  title: string;
}) {
  return (
    <tr>
      <td className="empty-table-cell" colSpan={colSpan}>
        <p className="empty-table-cell__title">{title}</p>
        {description ? (
          <p className="empty-table-cell__description">{description}</p>
        ) : null}
      </td>
    </tr>
  );
}

export function DashboardPageSkeleton({
  label = "Loading dashboard content",
}: {
  label?: string;
}) {
  return <GhostPageLoader label={label} />;
}
