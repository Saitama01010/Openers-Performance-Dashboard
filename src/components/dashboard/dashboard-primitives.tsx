import type { ReactNode } from "react";

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
  return (
    <span className={`status-badge status-badge--${tone}`}>{children}</span>
  );
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
  return (
    <section
      aria-busy="true"
      aria-label={label}
      className="dashboard-page dashboard-skeleton"
      role="status"
    >
      <span className="sr-only">{label}</span>
      <div className="skeleton-line skeleton-line--short" />
      <div className="skeleton-line skeleton-line--title" />
      <div className="skeleton-grid">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="skeleton-card" key={index} />
        ))}
      </div>
      <div className="skeleton-panel" />
    </section>
  );
}
