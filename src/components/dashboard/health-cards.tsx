import Link from "next/link";

import type { Role } from "@/auth/authorization";
import {
  EmptyState,
  StatusBadge,
} from "@/components/dashboard/dashboard-primitives";
import { Icon, type IconName } from "@/components/dashboard/icon";
import type {
  DashboardHealth,
  DashboardTotals,
} from "@/dashboard/data";
import { secondsToDuration, toPercentage } from "@/dashboard/format";

function formatTimestamp(value: Date | string | null) {
  if (!value) return "No update recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Update time unavailable";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function importTone(
  status: NonNullable<DashboardHealth["lastImport"]>["status"],
) {
  if (status === "confirmed") return "success" as const;
  if (status === "failed" || status === "rejected") return "danger" as const;
  if (status === "partially_confirmed") return "warning" as const;
  return "info" as const;
}

function HealthCard({
  children,
  icon,
  label,
}: {
  children: React.ReactNode;
  icon: IconName;
  label: string;
}) {
  return (
    <article className="dashboard-card dashboard-card-interactive min-h-52 p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-xl bg-primary/[0.09] text-cyan">
          <Icon className="size-4" name={icon} />
        </span>
        <h3 className="text-xs font-semibold text-muted-strong">{label}</h3>
      </div>
      <div className="mt-5">{children}</div>
    </article>
  );
}

export function DashboardHealthGrid({
  health,
  role,
  totals,
}: {
  health: DashboardHealth;
  role: Role;
  totals: DashboardTotals;
}) {
  const classifiedSeconds =
    health.trackedSeconds + Math.max(totals.untrackedSeconds, 0);
  const classifiedPercentage = Math.min(
    toPercentage(classifiedSeconds, totals.loginSeconds),
    100,
  );
  const reconciliationBalanced =
    totals.loginSeconds > 0 &&
    Math.abs(health.reconciliationSeconds) < 60;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <HealthCard icon="database" label="Data freshness">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold tracking-[-0.04em] text-white">
              {health.latestMetricDate
                ? new Intl.DateTimeFormat("en", {
                    month: "short",
                    day: "numeric",
                  }).format(new Date(`${health.latestMetricDate}T00:00:00`))
                : "No data"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Latest metric date in this view
            </p>
          </div>
          <StatusBadge
            label={health.rowCount > 0 ? "Available" : "Waiting"}
            tone={health.rowCount > 0 ? "success" : "neutral"}
          />
        </div>
        <div className="mt-5 border-t border-border pt-3 text-[11px] text-muted">
          <div className="flex items-center justify-between gap-4">
            <span>Last database update</span>
            <span className="font-mono text-muted-strong">
              {formatTimestamp(health.latestMetricAt)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4">
            <span>Scoped source rows</span>
            <span className="font-mono text-muted-strong">
              {health.rowCount.toLocaleString()}
            </span>
          </div>
        </div>
      </HealthCard>

      {role !== "agent" ? (
        <HealthCard icon="import" label="Import health">
          {health.lastImport ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {health.lastImport.fileName}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {health.lastImport.rowCount.toLocaleString()} source rows
                  </p>
                </div>
                <StatusBadge
                  label={health.lastImport.status.replaceAll("_", " ")}
                  tone={importTone(health.lastImport.status)}
                />
              </div>
              <div className="mt-5 border-t border-border pt-3 text-[11px] text-muted">
                <div className="flex items-center justify-between gap-4">
                  <span>Uploaded</span>
                  <span className="font-mono text-muted-strong">
                    {formatTimestamp(health.lastImport.createdAt)}
                  </span>
                </div>
                <Link
                  className="mt-3 inline-flex items-center gap-1.5 font-semibold text-cyan transition hover:text-white"
                  href="/import"
                >
                  Open import studio
                  <Icon className="size-3.5" name="arrow-up-right" />
                </Link>
              </div>
            </>
          ) : (
            <div className="-mx-3 -my-5">
              <EmptyState
                action={
                  <Link
                    className="text-xs font-semibold text-cyan hover:text-white"
                    href="/import"
                  >
                    Start an import
                  </Link>
                }
                description="Your latest eligible import will be summarized here."
                icon="import"
                title="No import history"
              />
            </div>
          )}
        </HealthCard>
      ) : null}

      <HealthCard icon="pulse" label="Time reconciliation">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-2xl font-semibold tracking-[-0.04em] text-white">
              {totals.loginSeconds > 0
                ? `${classifiedPercentage.toFixed(1)}%`
                : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Logged-in time classified by activity
            </p>
          </div>
          <StatusBadge
            label={
              reconciliationBalanced
                ? "Balanced"
                : totals.loginSeconds > 0
                  ? "Review"
                  : "Waiting"
            }
            tone={
              reconciliationBalanced
                ? "success"
                : totals.loginSeconds > 0
                  ? "warning"
                  : "neutral"
            }
          />
        </div>
        <div className="mt-5 border-t border-border pt-3 text-[11px] text-muted">
          <div className="flex items-center justify-between gap-4">
            <span>Logged-in total</span>
            <span className="font-mono text-muted-strong">
              {secondsToDuration(totals.loginSeconds)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4">
            <span>Reconciliation delta</span>
            <span className="font-mono text-muted-strong">
              {reconciliationBalanced
                ? "0h 0m"
                : `${health.reconciliationSeconds < 0 ? "−" : ""}${secondsToDuration(
                    Math.abs(health.reconciliationSeconds),
                  )}`}
            </span>
          </div>
        </div>
      </HealthCard>
    </div>
  );
}

const actions: {
  href: string;
  icon: IconName;
  label: string;
  roles: Role[];
  helper: string;
}[] = [
  {
    href: "/import",
    icon: "import",
    label: "Import activity",
    roles: ["admin", "manager"],
    helper: "Preview and reconcile a dialer CSV",
  },
  {
    href: "/admin/users",
    icon: "users",
    label: "Manage access",
    roles: ["admin"],
    helper: "Invite, activate, or scope users",
  },
  {
    href: "/admin/teams",
    icon: "team",
    label: "Manage teams",
    roles: ["admin"],
    helper: "Maintain reporting assignments",
  },
  {
    href: "/admin/audit",
    icon: "audit",
    label: "Review audit log",
    roles: ["admin"],
    helper: "Inspect sensitive activity",
  },
];

export function QuickActions({ role }: { role: Role }) {
  const visibleActions = actions.filter((action) =>
    action.roles.includes(role),
  );

  if (visibleActions.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {visibleActions.map((action) => (
        <Link
          className="group dashboard-card dashboard-card-interactive flex items-center gap-3 p-4"
          href={action.href}
          key={action.href}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/[0.09] text-cyan transition group-hover:bg-primary/15">
            <Icon className="size-[18px]" name={action.icon} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white">{action.label}</p>
            <p className="mt-0.5 truncate text-[10px] text-muted">
              {action.helper}
            </p>
          </div>
          <Icon
            className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-cyan"
            name="arrow-up-right"
          />
        </Link>
      ))}
    </div>
  );
}
